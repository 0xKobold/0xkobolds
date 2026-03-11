/**
 * Gateway Agent Method Handler (Phase 5 Enhanced)
 *
 * Handles agent.run with session-aware memory.
 * Links gateway sessions to generative agents, perennial memory, and user profiles.
 */

import { randomUUID } from "node:crypto";
import { ErrorCodes, errorShape } from "../protocol";
import { eventBus } from "../../event-bus";
import { spawnAgent, runEmbeddedAgent } from "../../agent";
import { getSessionMemoryBridge } from "../../memory/session-memory-bridge";
import { getMemoryIntegration } from "../../memory/memory-integration";
import type {
  GatewayContext,
  GatewayRespond,
  GatewayClientInfo,
  GatewayMethodHandler,
} from "./types";

// Validation
interface AgentParams {
  message: string;
  agentId?: string;
  sessionKey?: string;
  thinking?: string;
  deliver?: boolean;
  timeout?: number;
  idempotencyKey?: string;
  extraSystemPrompt?: string;
  workspaceDir?: string;
  resumeSession?: boolean;       // Phase 5: resume from memory thread
  memoryThreadId?: string;       // Phase 5: explicit memory thread
}

function validateAgentParams(data: unknown): data is AgentParams {
  if (!data || typeof data !== "object") return false;
  const p = data as Record<string, unknown>;
  return typeof p.message === "string" && p.message.length > 0;
}

// Dedupe helpers
interface DedupeEntry {
  ts: number;
  ok: boolean;
  payload?: unknown;
  error?: ReturnType<typeof errorShape>;
}

function setGatewayDedupeEntry({
  dedupe,
  key,
  entry,
}: {
  dedupe: GatewayContext["dedupe"];
  key: string;
  entry: DedupeEntry;
}): void {
  dedupe.set(key, entry);
}

function getGatewayDedupeEntry({
  dedupe,
  key,
}: {
  dedupe: GatewayContext["dedupe"];
  key: string;
}): DedupeEntry | undefined {
  return dedupe.get(key);
}

// Active run tracking
const activeRuns = new Map<
  string,
  {
    status: "running" | "completed" | "failed";
    result?: string;
    error?: string;
    duration?: number;
    tokens?: number;
    sessionKey?: string;
  }
>();

// Phase 5: Session memory bridge
const sessionBridge = getSessionMemoryBridge();

// Agent run dispatcher with session-aware memory
async function dispatchAgentRunFromGateway({
  params,
  runId,
  idempotencyKey,
  respond,
  context,
}: {
  params: AgentParams;
  runId: string;
  idempotencyKey: string;
  respond: GatewayRespond;
  context: GatewayContext;
  client?: GatewayClientInfo;
}): Promise<void> {
  const { 
    message, 
    agentId, 
    sessionKey, 
    thinking, 
    extraSystemPrompt, 
    workspaceDir,
    resumeSession,
    memoryThreadId,
  } = params;

  // Phase 5: Get or create memory context
  let memoryContext;
  try {
    if (memoryThreadId) {
      // Resume from explicit memory thread
      memoryContext = await sessionBridge.resumeFromMemoryThread(memoryThreadId);
    } else if (sessionKey) {
      // Get or create for this session key
      memoryContext = await sessionBridge.getMemoryContext(sessionKey);
    } else {
      // No session - stateless run
      memoryContext = null;
    }
  } catch (err) {
    console.warn("[Gateway] Failed to get memory context:", err);
    memoryContext = null;
  }

  // Build enriched system prompt with session context
  let enrichedSystemPrompt = extraSystemPrompt || "";
  
  // Phase 5: Auto-recap - load previous context
  if (memoryContext && resumeSession !== false) {
    const memoryIntegration = getMemoryIntegration();
    const recap = await memoryIntegration.getSessionRecap(memoryContext.sessionKey);
    if (recap) {
      enrichedSystemPrompt = `Previous conversation:\n${recap}\n\n${enrichedSystemPrompt}`;
    }

    // Also add stored context
    const enriched = await sessionBridge.getEnrichedSession(memoryContext.sessionKey);
    if (enriched?.relevantContext) {
      enrichedSystemPrompt = `Relevant memories:\n${enriched.relevantContext}\n\n${enrichedSystemPrompt}`;
    }
    if (enriched?.conversationSummary) {
      enrichedSystemPrompt = `Summary: ${enriched.conversationSummary}\n\n${enrichedSystemPrompt}`;
    }
  }

  // Determine agent type
  let agentType: "spawn_agent" | "run_embedded" = "spawn_agent";
  if (agentId?.toLowerCase().includes("embedded")) {
    agentType = "run_embedded";
  }

  // Track in active runs
  activeRuns.set(runId, { 
    status: "running",
    sessionKey: memoryContext?.sessionKey,
  });

  try {
    let result: string;
    let tokens = 0;
    const startTime = Date.now();

    if (agentType === "run_embedded") {
      const embeddedResult = await runEmbeddedAgent({
        prompt: message,  // Use prompt instead of task
        cwd: workspaceDir,
        extensions: [],
      });

      result =
        typeof embeddedResult.output === "string"
          ? embeddedResult.output
          : JSON.stringify(embeddedResult.output);
      tokens = embeddedResult.stats.tokens.total || 0;
    } else {
      // Spawn agent with session context
      const spawnResult = await spawnAgent({
        task: message,
        parentRunId: runId,
        agentType: "specialist",
        extraSystemPrompt: enrichedSystemPrompt || undefined,
        // Phase 5: Pass memory context
        sessionKey: memoryContext?.sessionKey,
      });

      if (!spawnResult.success) {
        throw new Error(spawnResult.error || "Spawn failed");
      }

      // Link run to session
      if (memoryContext) {
        await sessionBridge.linkRunToSession(memoryContext.sessionKey, spawnResult.runId!);
      }

      // Wait for completion
      result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Agent run timeout"));
        }, params.timeout || 120000);

        const onCompleted = (event: any) => {
          const data = event.payload || event;
          if (data.runId === spawnResult.runId) {
            clearTimeout(timeout);
            cleanup();
            resolve(data.result || "");
          }
        };

        const onError = (event: any) => {
          const error = event.payload || event;
          if (error.runId === spawnResult.runId) {
            clearTimeout(timeout);
            cleanup();
            reject(new Error(error.message));
          }
        };

        const cleanup = () => {
          eventBus.off("agent.completed", onCompleted);
          eventBus.off("agent.error", onError);
        };

        eventBus.on("agent.completed", onCompleted);
        eventBus.on("agent.error", onError);
      });
    }

    const duration = Date.now() - startTime;

    // Phase 5: Update session with result summary
    if (memoryContext) {
      const shortResult = result.slice(0, 500); // First 500 chars
      await sessionBridge.updateSummary(
        memoryContext.sessionKey,
        `User: ${message.slice(0, 100)}...\nAssistant: ${shortResult}...`,
      );
    }

    // Update tracking
    activeRuns.set(runId, { 
      status: "completed", 
      result, 
      duration, 
      tokens,
      sessionKey: memoryContext?.sessionKey,
    });

    // Phase 5: Auto-save to memory systems
    if (memoryContext) {
      const memoryIntegration = getMemoryIntegration();
      await memoryIntegration.processRunCompletion(
        memoryContext.sessionKey,
        runId,
        result
      );
      
      // Add generative observation
      eventBus.emit("generative.observe_session", {
        sessionKey: memoryContext.sessionKey,
        content: `User: "${message.slice(0, 100)}..."\nAI: "${result.slice(0, 100)}..."`,
        type: "observation",
      });
    }

    const payload = {
      runId,
      status: "ok" as const,
      summary: "completed",
      result: {
        payloads: result ? [{ type: "text", content: result }] : [],
        meta: {
          durationMs: duration,
          tokens,
        },
        // Phase 5: Return memory context for client
        memoryThreadId: memoryContext?.memoryThreadId,
        sessionKey: memoryContext?.sessionKey,
      },
    };

    setGatewayDedupeEntry({
      dedupe: context.dedupe,
      key: `agent:${idempotencyKey}`,
      entry: {
        ts: Date.now(),
        ok: true,
        payload,
      },
    });

    respond(true, payload, undefined, { runId, expectFinal: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    activeRuns.set(runId, { 
      status: "failed", 
      error: message,
      sessionKey: memoryContext?.sessionKey,
    });

    const errShape = errorShape(ErrorCodes.AGENT_ERROR, message);
    const payload = {
      runId,
      status: "error" as const,
      summary: message,
      memoryThreadId: memoryContext?.memoryThreadId,
    };

    setGatewayDedupeEntry({
      dedupe: context.dedupe,
      key: `agent:${idempotencyKey}`,
      entry: {
        ts: Date.now(),
        ok: false,
        payload,
      },
    });

    respond(false, payload, errShape, { runId });
  }
}

// Main handler
export const agentHandler: GatewayMethodHandler<AgentParams> = async ({
  params,
  respond,
  context,
  client,
}) => {
  if (!validateAgentParams(params)) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_PARAMS, "Invalid agent params: message required"),
    );
    return;
  }

  const request = params as AgentParams;
  const runId = randomUUID();
  const idempotencyKey = request.idempotencyKey || runId;

  // Check dedupe store
  const existing = getGatewayDedupeEntry({
    dedupe: context.dedupe,
    key: `agent:${idempotencyKey}`,
  });

  if (existing) {
    if (existing.ok) {
      respond(true, existing.payload, undefined, { runId });
    } else {
      respond(false, existing.payload, existing.error, { runId });
    }
    return;
  }

  // Send accepted response
  const accepted = {
    runId,
    status: "accepted" as const,
    acceptedAt: Date.now(),
  };

  setGatewayDedupeEntry({
    dedupe: context.dedupe,
    key: `agent:${idempotencyKey}`,
    entry: {
      ts: Date.now(),
      ok: true,
      payload: accepted,
    },
  });

  respond(true, accepted, undefined, { runId });

  // Dispatch with session awareness
  await dispatchAgentRunFromGateway({
    params: request,
    runId,
    idempotencyKey,
    respond,
    context,
    client,
  });
};

// Agent status handler (enhanced with session info)
interface AgentStatusParams {
  runId: string;
}

export const agentStatusHandler: GatewayMethodHandler<AgentStatusParams> = async ({
  params,
  respond,
}) => {
  if (!params?.runId || typeof params.runId !== "string") {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_PARAMS, "Missing runId"));
    return;
  }

  const { runId } = params;
  const status = activeRuns.get(runId);

  if (!status) {
    respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Run ${runId} not found`));
    return;
  }

  respond(true, { 
    runId, 
    ...status,
    hasSession: !!status.sessionKey,
  }, undefined);
};

// Agent wait handler
interface AgentWaitParams {
  runId: string;
  timeout?: number;
}

export const agentWaitHandler: GatewayMethodHandler<AgentWaitParams> = async ({
  params,
  respond,
}) => {
  if (!params?.runId || typeof params.runId !== "string") {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_PARAMS, "Missing runId"));
    return;
  }

  const { runId, timeout = 120000 } = params;
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeout) {
    const status = activeRuns.get(runId);

    if (!status) {
      respond(
        false,
        { runId, status: "not_found" },
        errorShape(ErrorCodes.NOT_FOUND, `Run ${runId} not found`),
      );
      return;
    }

    if (status.status === "completed") {
      respond(
        true,
        {
          runId,
          status: "completed",
          result: status.result,
          duration: status.duration,
          tokens: status.tokens,
          hasSession: !!status.sessionKey,
        },
        undefined,
      );
      return;
    }

    if (status.status === "failed") {
      respond(
        false,
        { runId, status: "failed", error: status.error },
        errorShape(ErrorCodes.AGENT_ERROR, status.error || "Agent failed"),
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  respond(
    false,
    { runId, status: "timeout" },
    errorShape(ErrorCodes.TIMEOUT, `Wait timeout after ${timeout}ms`),
  );
};

// Phase 5: New method to get session memory
interface SessionMemoryParams {
  sessionKey?: string;
  memoryThreadId?: string;
}

export const sessionMemoryHandler: GatewayMethodHandler<SessionMemoryParams> = async ({
  params,
  respond,
}) => {
  if (!params?.sessionKey && !params?.memoryThreadId) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_PARAMS, "sessionKey or memoryThreadId required"));
    return;
  }

  try {
    let context;
    if (params.memoryThreadId) {
      context = await sessionBridge.resumeFromMemoryThread(params.memoryThreadId);
    } else if (params.sessionKey) {
      context = await sessionBridge.getMemoryContext(params.sessionKey);
    }

    if (!context) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Session not found"));
      return;
    }

    const enriched = await sessionBridge.getEnrichedSession(context.sessionKey);

    respond(true, {
      sessionKey: context.sessionKey,
      memoryThreadId: context.memoryThreadId,
      messageCount: enriched?.messageCount || 0,
      summary: enriched?.conversationSummary,
      recentMemories: enriched?.recentMemories?.slice(-10), // Last 10
    }, undefined);
  } catch (err) {
    respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
  }
};
