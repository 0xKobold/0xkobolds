/**
 * Pi Agent Core Adapter
 *
 * Uses @mariozechner/pi-agent-core Agent class for the agent loop,
 * providing event streaming, steering, follow-up messages, and abort support.
 */

import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentEvent, AgentTool, AgentMessage } from '@mariozechner/pi-agent-core';
import type { Message as PiMessage, TextContent, ImageContent } from '@mariozechner/pi-ai';
import type { Skill } from '../skills/types';
import { createEventEmitter } from '../event-bus';
import type { ApprovalQueue } from '../approval/queue';
import type { LLMProvider } from '../llm/types';

const emitter = createEventEmitter('agent');

// Track active agents for lifecycle management
const activeAgents = new Map<string, Agent>();

export interface AgentOptions {
  agentId: string;
  sessionKey: string;
  parentId?: string;
  skills: Skill[];
  llm: LLMProvider;
  approvalQueue: ApprovalQueue;
  systemPrompt?: string;
}

export interface AgentWrapper {
  id: string;
  sessionKey: string;
  run(input: string): Promise<string>;
  spawn(task: string): Promise<AgentWrapper>;
  stop(): void;
}

/**
 * Convert our message format to pi-agent-core Message format
 */
function convertToLlmMessage(messages: AgentMessage[]): PiMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
      };
    } else if (msg.role === 'assistant') {
      return {
        role: 'assistant',
        content: typeof msg.content === 'string'
          ? [{ type: 'text', text: msg.content } as TextContent]
          : (Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: String(msg.content) } as TextContent]),
        api: 'openai-completions',
        provider: 'openai',
        model: 'unknown',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: msg.timestamp || Date.now(),
      };
    } else if (msg.role === 'toolResult') {
      // Tool result message
      const toolMsg = msg as { role: 'toolResult'; toolCallId: string; toolName: string; content: (TextContent | ImageContent)[]; details?: unknown; isError?: boolean; timestamp?: number };
      return {
        role: 'toolResult',
        toolCallId: toolMsg.toolCallId,
        toolName: toolMsg.toolName,
        content: toolMsg.content,
        timestamp: toolMsg.timestamp || Date.now(),
        isError: toolMsg.isError || false,
      };
    } else {
      // Custom messages - convert to user message
      // Cast to access content property on custom message types
      const customMsg = msg as { content?: string; timestamp?: number };
      return {
        role: 'user',
        content: String(customMsg.content || ''),
        timestamp: customMsg.timestamp || Date.now(),
      };
    }
  });
}

/**
 * Convert a Skill to a Pi Agent Tool
 */
function skillToTool(skill: Skill, approvalQueue: ApprovalQueue): AgentTool {
  return {
    name: skill.name,
    description: skill.description,
    label: skill.name,
    parameters: skill.toolDefinition.function.parameters as any,

    async execute(_toolCallId: string, args: unknown, _signal?: AbortSignal) {
      // Check approval for risky skills
      if (skill.risk !== 'safe') {
        const approved = await approvalQueue.request({
          skill: skill.name,
          description: skill.description,
          args: args as Record<string, unknown>,
          risk: skill.risk,
        });

        if (!approved) {
          return {
            content: [],
            details: {
              error: 'User denied execution',
              denied: true,
            },
          };
        }
      }

      // Execute the skill
      const result = await skill.execute(args as Record<string, unknown>);

      return {
        content: [],
        details: result,
      };
    },
  };
}

/**
 * Create an agent using pi-agent-core Agent class
 */
export function createAgent(options: AgentOptions): AgentWrapper {
  const { agentId, sessionKey, parentId, skills, approvalQueue, systemPrompt } = options;

  // Convert skills to AgentTools
  const tools = skills.map((skill) => skillToTool(skill, approvalQueue));

  // Create the Agent instance from pi-agent-core
  // Use default streamFn (streamSimple) and provide convertToLlm
  const agent = new Agent({
    convertToLlm: convertToLlmMessage,
  });

  // Set up tools
  agent.setTools(tools);

  // Set system prompt if provided
  if (systemPrompt) {
    agent.setSystemPrompt(systemPrompt);
  }

  // Store in active agents map
  activeAgents.set(agentId, agent);

  // Subscribe to AgentEvent stream and forward to our event bus
  agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case 'agent_start':
        emitter.emit('agent.run', { agentId });
        break;

      case 'agent_end':
        emitter.emit('agent.completed', {
          agentId,
          messages: event.messages,
        });
        break;

      case 'turn_start':
        emitter.emit('agent.run', { agentId, phase: 'turn_start' });
        break;

      case 'turn_end':
        emitter.emit('agent.completed', { agentId, phase: 'turn_end', message: event.message, toolResults: event.toolResults });
        break;

      case 'message_start':
        emitter.emit('agent.message', { agentId, phase: 'start', message: event.message });
        break;

      case 'message_update':
        emitter.emit('agent.message', { agentId, phase: 'update', message: event.message });
        break;

      case 'message_end':
        emitter.emit('agent.message', { agentId, phase: 'end', message: event.message });
        break;

      case 'tool_execution_start':
        emitter.emit('agent.tool.started', {
          agentId,
          skill: event.toolName,
          toolCallId: event.toolCallId,
          args: event.args,
        });
        break;

      case 'tool_execution_update':
        emitter.emit('agent.tool.started', {
          agentId,
          skill: event.toolName,
          toolCallId: event.toolCallId,
          partialResult: event.partialResult,
        });
        break;

      case 'tool_execution_end':
        emitter.emit('agent.tool.completed', {
          agentId,
          skill: event.toolName,
          toolCallId: event.toolCallId,
          result: event.result,
          isError: event.isError,
        });
        break;
    }
  });

  // Create wrapper with our interface
  const wrapper: AgentWrapper = {
    id: agentId,
    sessionKey,

    async run(input: string): Promise<string> {
      emitter.emit('agent.run', { agentId, input });

      // Send prompt to agent - this triggers the agent loop
      await agent.prompt(input);

      // Get the final state and extract the last assistant message
      const state = agent.state;
      const messages = state.messages;

      // Find the last assistant message
      const lastAssistantMessage = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant');

      if (lastAssistantMessage && lastAssistantMessage.role === 'assistant') {
        // Content can be string or array
        const content = lastAssistantMessage.content;
        if (typeof content === 'string') {
          return content;
        } else if (Array.isArray(content) && content.length > 0) {
          // Extract text from content array
          return content
            .filter((c): c is TextContent => c.type === 'text')
            .map((c) => c.text)
            .join('');
        }
      }

      return '';
    },

    async spawn(task: string): Promise<AgentWrapper> {
      const subagentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      emitter.emit('agent.spawned', {
        agentId: subagentId,
        parentId,
        task,
      });

      // Create subagent with same configuration
      return createAgent({
        agentId: subagentId,
        sessionKey: `${sessionKey}:subagent:${subagentId}`,
        parentId,
        skills,
        llm: options.llm,
        approvalQueue,
        systemPrompt,
      });
    },

    stop() {
      // Abort the agent execution
      agent.abort();
      activeAgents.delete(agentId);
      emitter.emit('agent.stopped', { agentId });
    },
  };

  return wrapper;
}

/**
 * Create agent factory
 */
export function createAgentFactory(deps: {
  llm: LLMProvider;
  skills: Skill[];
  approvalQueue: ApprovalQueue;
  systemPrompt?: string;
}) {
  const agents = new Map<string, AgentWrapper>();

  return {
    create(agentId: string, sessionKey: string, parentId?: string): AgentWrapper {
      const agent = createAgent({
        agentId,
        sessionKey,
        parentId,
        skills: deps.skills,
        llm: deps.llm,
        approvalQueue: deps.approvalQueue,
        systemPrompt: deps.systemPrompt,
      });

      agents.set(agentId, agent);
      return agent;
    },

    get(agentId: string): AgentWrapper | undefined {
      return agents.get(agentId);
    },

    list(): Array<{ id: string; agent: AgentWrapper }> {
      return Array.from(agents.entries()).map(([id, agent]) => ({ id, agent }));
    },

    stopAll(): void {
      for (const agent of agents.values()) {
        agent.stop();
      }
      agents.clear();
      activeAgents.clear();
    },

    async stop(agentId: string): Promise<void> {
      const agent = agents.get(agentId);
      if (agent) {
        agent.stop();
        agents.delete(agentId);
      }
    },

    /**
     * Send a steering message to an active agent
     * This allows interrupting/interjecting during agent execution
     */
    async steer(agentId: string, message: string): Promise<boolean> {
      const agent = activeAgents.get(agentId);
      if (!agent) return false;

      // Send steering message to the agent
      agent.steer({
        role: 'user',
        content: message,
        timestamp: Date.now(),
      });

      return true;
    },

    /**
     * Send a follow-up message to an agent
     * This processes after the current agent run completes
     */
    async followUp(agentId: string, message: string): Promise<boolean> {
      const agent = activeAgents.get(agentId);
      if (!agent) return false;

      agent.followUp({
        role: 'user',
        content: message,
        timestamp: Date.now(),
      });

      return true;
    },
  };
}

/**
 * Export skillToTool for use in other modules (like tool-adapter.ts)
 */
export { skillToTool };
