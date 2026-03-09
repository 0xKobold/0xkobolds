/**
 * Cron Job Runner - 0xKobold
 * 
 * Executes cron jobs in isolated or main sessions.
 * Isolated = fresh context, Main = shares conversation history
 */

import { CronJob, JobResult } from "./types.js";
import { OllamaProvider, AnthropicProvider } from "../llm/index.js";
import type { LLMProvider, Message } from "../llm/types.js";
import { sendNotification } from "./notifications.js";

// Provider cache
const providers: Map<string, LLMProvider> = new Map();

/**
 * Get or create provider for a model
 */
function getProvider(model: string): LLMProvider {
  // Extract provider prefix (e.g., "ollama/", "claude/", "openai/")
  const [providerName] = model.split('/');
  
  if (providers.has(providerName)) {
    return providers.get(providerName)!;
  }
  
  let provider: LLMProvider;
  
  switch (providerName) {
    case 'ollama':
      provider = new OllamaProvider();
      break;
    case 'claude':
      provider = new AnthropicProvider();
      break;
    default:
      // Default to Ollama for unknown providers
      provider = new OllamaProvider();
  }
  
  providers.set(providerName, provider);
  return provider;
}

/**
 * Run a job based on its session type
 */
export async function runJobRunner(job: CronJob): Promise<JobResult> {
  console.log(`[CronRunner] Starting job "${job.name}" (${job.session} session)`);
  
  const startTime = Date.now();
  
  try {
    let result: JobResult;
    
    if (job.session === "isolated") {
      result = await runIsolatedSession(job);
    } else {
      result = await runMainSession(job);
    }
    
    // Send notification if configured
    await sendNotification(job, result);
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResult: JobResult = {
      success: false,
      output: "",
      tokensUsed: 0,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
    
    // Send error notification
    await sendNotification(job, errorResult);
    
    return errorResult;
  }
}

/**
 * Run job in isolated session (separate context)
 * 
 * Creates a fresh conversation with just the job message.
 * No history pollution, different model possible.
 */
async function runIsolatedSession(job: CronJob): Promise<JobResult> {
  const sessionId = `cron:${job.id}`;
  const model = job.model || "kimi-k2.5:cloud";
  
  console.log(`[CronRunner] Isolated session: ${sessionId}, model: ${model}`);
  
  const startTime = Date.now();
  
  try {
    const provider = getProvider(model);
    
    // Build system prompt with persona context if available
    const systemPrompt = buildSystemPrompt(job);
    
    // Build messages
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: job.message },
    ];
    
    // Determine temperature and max tokens based on thinking level
    const temperature = getTemperature(job.thinkingLevel);
    const maxTokens = getMaxTokens(job.thinkingLevel);
    
    // Call LLM
    const response = await provider.chat({
      model,
      messages,
      temperature,
      maxTokens,
      stream: false,
    });
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      output: response.content,
      tokensUsed: response.usage?.inputTokens || 0 + (response.usage?.outputTokens || 0),
      duration,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    console.error(`[CronRunner] Isolated session error: ${errorMsg}`);
    
    return {
      success: false,
      output: "",
      tokensUsed: 0,
      duration,
      error: errorMsg,
    };
  }
}

/**
 * Run job in main session (shared context)
 * 
 * Injects job into main session as a system event.
 * Has full conversation context but may be delayed.
 */
async function runMainSession(job: CronJob): Promise<JobResult> {
  console.log(`[CronRunner] Main session: injecting event`);
  
  const startTime = Date.now();
  
  try {
    // For now, treat main session as isolated but flag it
    // TODO: Integrate with actual main session context
    const result = await runIsolatedSession(job);
    
    // Mark as main session in output
    return {
      ...result,
      output: `[Scheduled Task]\n${result.output}`,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      output: "",
      tokensUsed: 0,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build system prompt for isolated sessions
 */
function buildSystemPrompt(job: CronJob): string {
  const parts: string[] = [
    `You are 0xKobold, an AI coding assistant running as a scheduled task.`,
    ``,
    `Task: ${job.name}`,
    `Session Type: ${job.session}`,
    `Model: ${job.model || "default"}`,
  ];
  
  if (job.thinkingLevel) {
    parts.push(`Thinking Level: ${job.thinkingLevel}`);
  }
  
  parts.push(`
Guidelines:
- Be concise but complete
- Focus on the specific task requested
- If you need tools, use them appropriately
- Report any errors clearly
`);
  
  return parts.join('\n');
}

/**
 * Get temperature based on thinking level
 */
function getTemperature(level?: string): number {
  switch (level) {
    case 'fast':
      return 0.3; // More deterministic
    case 'deep':
      return 0.8; // More creative
    case 'normal':
    default:
      return 0.7;
  }
}

/**
 * Get max tokens based on thinking level
 */
function getMaxTokens(level?: string): number {
  switch (level) {
    case 'fast':
      return 1024;
    case 'deep':
      return 4096;
    case 'normal':
    default:
      return 2048;
  }
}

/**
 * Execute a system event job (no LLM)
 * 
 * For jobs that just need to trigger something in the main session
 * without LLM processing.
 */
export async function runSystemEvent(
  job: CronJob
): Promise<JobResult> {
  console.log(`[CronRunner] System event: ${job.message}`);
  
  const startTime = Date.now();
  
  try {
    // TODO: Emit event to main session
    // This should trigger a system event in the agent
    
    return {
      success: true,
      output: job.message,
      tokensUsed: 0,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    return {
      success: false,
      output: "",
      tokensUsed: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pre-job validation
 */
export function validateJob(job: CronJob): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!job.name || job.name.trim().length === 0) {
    errors.push("Job name is required");
  }
  
  if (!job.message || job.message.trim().length === 0) {
    errors.push("Job message is required");
  }
  
  if (!job.cronExpression && !job.at) {
    errors.push("Either cron expression or at timestamp is required");
  }
  
  if (job.nextRunAt <= 0) {
    errors.push("Next run time must be in the future");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
