/**
 * Cron Job Runner - 0xKobold
 * 
 * Executes cron jobs in isolated or main sessions.
 * Isolated = fresh context, Main = shares conversation history
 */

import { CronJob, JobResult } from "./types.js";

/**
 * Run a job based on its session type
 */
export async function runJobRunner(job: CronJob): Promise<JobResult> {
  console.log(`[CronRunner] Starting job "${job.name}" (${job.session} session)`);
  
  const startTime = Date.now();
  
  try {
    if (job.session === "isolated") {
      return await runIsolatedSession(job);
    } else {
      return await runMainSession(job);
    }
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
 * Run job in isolated session (separate context)
 * 
 * Creates a fresh conversation with just the job message.
 * No history pollution, different model possible.
 */
async function runIsolatedSession(job: CronJob): Promise<JobResult> {
  const sessionId = `cron:${job.id}`;
  
  console.log(`[CronRunner] Isolated session: ${sessionId}`);
  
  // TODO: Integrate with actual LLM provider
  // For now, placeholder implementation
  
  const startTime = Date.now();
  
  try {
    // This is where you'd call the LLM with:
    // - Fresh context
    // - Job.model override (if specified)
    // - Job.message as the prompt
    // - Job.thinkingLevel if specified
    
    const model = job.model || "kimi-k2.5:cloud";
    
    // Placeholder: In real implementation, this would call your LLM provider
    const result = await executeLLMCall({
      sessionId,
      model,
      message: job.message,
      thinkingLevel: job.thinkingLevel,
      workingDir: job.workingDir,
      tokenLimit: job.tokenLimit,
    });
    
    return {
      success: true,
      output: result.output,
      tokensUsed: result.tokensUsed,
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
 * Run job in main session (shared context)
 * 
 * Injects job into main session as a system event.
 * Has full conversation context but may be delayed.
 */
async function runMainSession(job: CronJob): Promise<JobResult> {
  console.log(`[CronRunner] Main session: injecting event`);
  
  const startTime = Date.now();
  
  try {
    // TODO: Integrate with main session
    // This would:
    // 1. Emit an event that the main session picks up
    // 2. Main session processes the job
    // 3. Result is returned
    
    // For now, treat as isolated but with different logging
    return await runIsolatedSession(job);
    
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
 * Execute LLM call (placeholder)
 * 
 * TODO: Integrate with your actual LLM provider (Ollama, Claude, etc.)
 * This should:
 * 1. Load the appropriate provider based on model
 * 2. Set up isolated context
 * 3. Execute the prompt
 * 4. Return tokens used and cost
 */
interface LLMCallOptions {
  sessionId: string;
  model: string;
  message: string;
  thinkingLevel?: 'fast' | 'normal' | 'deep';
  workingDir?: string;
  tokenLimit?: number;
}

interface LLMCallResult {
  output: string;
  tokensUsed: number;
  cost?: number;
}

async function executeLLMCall(options: LLMCallOptions): Promise<LLMCallResult> {
  // TODO: Replace with actual LLM integration
  // This is a placeholder that simulates execution
  
  console.log(`[CronRunner] Executing LLM call:`);
  console.log(`  Model: ${options.model}`);
  console.log(`  Message: ${options.message.substring(0, 100)}...`);
  
  // Simulate processing
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  return {
    output: `[Cron Job Result]\\nExecuted at ${new Date().toISOString()}\\n\\n${options.message.substring(0, 200)}...`,
    tokensUsed: Math.floor(Math.random() * 500) + 100,
    cost: 0.001,
  };
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
