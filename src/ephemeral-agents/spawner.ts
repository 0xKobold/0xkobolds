/**
 * Ephemeral Agent Spawner - v1.3
 * 
 * Uses pi CLI in RPC mode for FULL tool execution
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { ephemeralRegistry } from './registry.js';
import { createWorkspace } from './workspace.js';
import type { EphemeralResult } from './types.js';

export interface SpawnParams {
  task: string;
  agentType?: string;
  model?: string;
  timeoutMs?: number;
  parentId?: string;
  provider?: string;
}

interface RpcCommand {
  id: string;
  type: string;
  [key: string]: any;
}

interface AgentEvent {
  type: string;
  [key: string]: any;
}

function parseJsonLine(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function serializeJsonLine(obj: any): string {
  return JSON.stringify(obj) + '\n';
}

function getPiCliPath(): string {
  // Use the correct path in the 0xkobold project
  const path = require('path');
  const cliPath = path.join(process.cwd(), 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'cli.js');
  return cliPath;
}

export async function spawnEphemeral(
  params: SpawnParams
): Promise<EphemeralResult> {
  const startTime = Date.now();
  const agentId = randomUUID();
  
  const workspace = await createWorkspace(agentId);
  
  let agent;
  try {
    agent = ephemeralRegistry.create({
      type: params.agentType || 'worker',
      task: params.task,
      workspace: workspace.path,
      parentId: params.parentId,
      ttlMs: params.timeoutMs,
    });
    agent.id = agentId;
  } catch (error) {
    await workspace.cleanup();
    throw error;
  }

  ephemeralRegistry.start(agentId);

  console.log(`[Ephemeral] Spawning ${agent.type} agent ${agentId.slice(0, 8)}`);
  console.log(`[Ephemeral] Workspace: ${workspace.path}`);

  const timeout = params.timeoutMs || 5 * 60 * 1000;
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let requestId = 0;
  let done = false;
  let finalText = '';
  const toolCalls: Array<{ tool: string; output: string }> = [];
  let errorOccurred = false;
  let lastError: string | null = null;

  const pendingRequests = new Map<string, {
    resolve: (data: any) => void;
    reject: (error: Error) => void;
  }>();

  return new Promise<EphemeralResult>((resolve) => {
    const cliPath = getPiCliPath();
    
    const args = ['--mode', 'rpc'];
    if (params.provider) args.push('--provider', params.provider);
    if (params.model) args.push('--model', params.model);

    console.log(`[Ephemeral] Starting: node "${cliPath}" ${args.join(' ')}`);

    const proc = spawn('node', [cliPath, ...args], {
      cwd: workspace.path,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    proc.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      
      for (const line of lines) {
        const parsed = parseJsonLine(line);
        if (!parsed) continue;

        if (parsed.type === 'response' && parsed.id && pendingRequests.has(parsed.id)) {
          const pending = pendingRequests.get(parsed.id)!;
          pendingRequests.delete(parsed.id);
          if (parsed.success) pending.resolve(parsed.data);
          else pending.reject(new Error(parsed.error || 'Unknown error'));
          continue;
        }

        if (parsed.type === 'event' || parsed.event) {
          handleEvent(parsed.event || parsed);
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
    });

    proc.on('exit', (code, signal) => {
      done = true;
      const exitInfo = `code: ${code}, signal: ${signal}`;
      if (code !== 0 && code !== null) {
        errorOccurred = true;
        lastError = `Process exited with ${exitInfo}`;
        console.error(`[Ephemeral] Process exited: ${exitInfo}`);
        if (stderrBuffer) {
          console.error(`[Ephemeral] Stderr: ${stderrBuffer.slice(-1000)}`);
        }
      } else {
        console.log(`[Ephemeral] Process exited normally: ${exitInfo}`);
      }
    });

    proc.on('error', (err) => {
      errorOccurred = true;
      lastError = err.message;
      console.error(`[Ephemeral] Process error: ${err.message}`);
    });

    function handleEvent(event: AgentEvent) {
      switch (event.type) {
        case 'tool_start':
          console.log(`[Ephemeral] Tool: ${event.tool || event.name || 'unknown'}`);
          break;
        case 'tool_result':
          if (event.result) {
            toolCalls.push({
              tool: event.tool || event.name || 'unknown',
              output: String(event.result).slice(0, 500),
            });
          }
          break;
        case 'turn_end':
          if (event.state?.messages) {
            const msgs = event.state.messages;
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg?.role === 'assistant') {
              for (const content of lastMsg.content || []) {
                if (content.type === 'text' && content.text) {
                  finalText += content.text;
                }
              }
            }
          }
          break;
        case 'agent_end':
          console.log(`[Ephemeral] Agent finished`);
          done = true;
          break;
        case 'error':
          errorOccurred = true;
          lastError = event.error || 'Agent error';
          console.error(`[Ephemeral] Error:`, lastError);
          break;
      }
    }

    function sendCommand(type: string, data: Record<string, any> = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = `req_${++requestId}`;
        const cmd: RpcCommand = { id, type, ...data };
        
        pendingRequests.set(id, { resolve, reject });
        
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error(`Timeout waiting for ${type} response`));
          }
        }, 30000);

        try {
          if (proc.stdin?.writable) {
            proc.stdin.write(serializeJsonLine(cmd));
          } else {
            reject(new Error('stdin not writable - process may have crashed'));
          }
        } catch (err) {
          reject(new Error(`Failed to write to stdin: ${err}`));
        }
      });
    }

    async function waitForCompletion(): Promise<void> {
      const checkInterval = 100;
      let waited = 0;
      
      while (!done && waited < timeout) {
        await new Promise(r => setTimeout(r, checkInterval));
        waited += checkInterval;
      }
      
      if (!done) {
        try { await sendCommand('abort'); } catch { /* ignore */ }
        throw new Error('Agent timed out');
      }
    }

    function buildResult(): EphemeralResult {
      const durationMs = Date.now() - startTime;
      
      let resultText = finalText.trim() || 'Completed';
      
      if (toolCalls.length > 0) {
        resultText += '\n\n--- Tool Executions ---\n';
        for (const tc of toolCalls.slice(0, 10)) {
          resultText += `[${tc.tool}]: ${tc.output.slice(0, 200)}\n`;
        }
        if (toolCalls.length > 10) {
          resultText += `... and ${toolCalls.length - 10} more\n`;
        }
      }

      if (errorOccurred && lastError) {
        resultText += `\n\n[Error]: ${lastError}`;
      }

      return {
        success: !errorOccurred,
        text: resultText,
        tokens: { input: 0, output: 0, total: 0 },
        durationMs,
        status: errorOccurred ? 'failed' : 'completed',
      };
    }

    (async () => {
      try {
        await new Promise(r => setTimeout(r, 500));

        console.log(`[Ephemeral] Task: ${params.task.slice(0, 50)}...`);
        await sendCommand('prompt', { message: params.task });

        await waitForCompletion();
        await new Promise(r => setTimeout(r, 500));

        const result = buildResult();
        ephemeralRegistry.complete(agentId, result);
        console.log(`[Ephemeral] Completed in ${result.durationMs}ms (${toolCalls.length} tools)`);

        proc.kill('SIGTERM');
        setTimeout(() => { workspace.cleanup().catch(() => {}); }, 5000);

        resolve(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - startTime;

        console.error(`[Ephemeral] Failed:`, errorMessage);

        proc.kill('SIGTERM');

        const result: EphemeralResult = {
          success: false,
          text: errorMessage,
          durationMs,
          status: 'failed',
        };

        ephemeralRegistry.fail(agentId, errorMessage);
        workspace.cleanup().catch(() => {});

        resolve(result);
      }
    })();
  });
}

export async function spawnEphemeralFanOut(
  tasks: string[],
  agentType: string = 'worker',
  maxConcurrent: number = 4
): Promise<EphemeralResult[]> {
  console.log(`[Ephemeral] Fan-out: ${tasks.length} tasks, max ${maxConcurrent} concurrent`);

  const results: EphemeralResult[] = [];
  
  for (let i = 0; i < tasks.length; i += maxConcurrent) {
    const batch = tasks.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(task => spawnEphemeral({ task, agentType }))
    );
    results.push(...batchResults);
    if (i + maxConcurrent < tasks.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const successful = results.filter(r => r.success).length;
  console.log(`[Ephemeral] Fan-out complete: ${successful}/${tasks.length} succeeded`);

  return results;
}

export async function spawnEphemeralWithTimeout(
  params: SpawnParams,
  timeoutMs: number
): Promise<EphemeralResult> {
  return Promise.race([
    spawnEphemeral({ ...params, timeoutMs }),
    new Promise<EphemeralResult>((_, reject) =>
      setTimeout(() => reject(new Error('Spawn timeout')), timeoutMs)
    ),
  ]);
}
