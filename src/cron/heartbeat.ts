/**
 * Heartbeat Runner - 0xKobold
 * 
 * Executes all heartbeat tasks on schedule.
 * Identical to Hermes/OpenClaw pattern: running as daemon, 
 * scheduling tasks via cron expressions.
 * 
 * Tasks (from HEARTBEAT.md):
 * - Moltlaunch inbox: every 2 hours
 * - Claychemy: every 1-2 hours
 * - Moltbook: every 4 hours
 * - Moltx: every 6 hours
 * - Polymarket: every 3 hours
 * - Music generation: daily at 12pm
 * - 4claw: every 4+ hours
 */

import { CronScheduler, getCronScheduler } from './scheduler.js';
import { parseCron } from './parser.js';
import { parseNaturalSchedule } from './nl-parser.js';
import type { CronJob, AddJobOptions, SessionType } from './types.js';

// Heartbeat task definitions
export interface HeartbeatTask {
  id: string;
  name: string;
  cron: string;
  session: SessionType;
  message: string;
  thinkingLevel?: 'fast' | 'normal' | 'deep';
  enabled?: boolean;
}

// Default heartbeat tasks from HEARTBEAT.md
export const HEARTBEAT_TASKS: HeartbeatTask[] = [
  {
    id: 'moltlaunch-inbox',
    name: 'Moltlaunch Inbox Check',
    cron: '0 */2 * * *', // Every 2 hours
    session: 'isolated',
    message: 'Check Moltlaunch inbox for new gigs. Use: mltl inbox --agent 0x3bc7. Report any pending tasks.',
    thinkingLevel: 'fast',
  },
  {
    id: 'clawchemy-discovery',
    name: 'Claychemy Discovery Session',
    cron: '0 */2 * * *', // Every 2 hours
    session: 'isolated',
    message: 'Run Claychemy discovery session. First: GET /api/combinations/unverified and verify 3 combinations. Then: POST /api/combine to make 2-3 new discoveries. Remember: verify ratio must stay >= discoveries.',
    thinkingLevel: 'normal',
  },
  {
    id: 'moltbook-engagement',
    name: 'Moltbook Feed Engagement',
    cron: '0 */4 * * *', // Every 4 hours
    session: 'isolated',
    message: 'Engage on Moltbook. 1) GET /api/v1/posts to get feed. 2) Upvote 3-5 posts (maintain 5:1 ratio). 3) Check for comments on your posts and respond. Report engagement stats.',
    thinkingLevel: 'fast',
  },
  {
    id: 'moltx-engagement',
    name: 'Moltx Feed Engagement',
    cron: '0 */6 * * *', // Every 6 hours
    session: 'isolated',
    message: 'Engage on Moltx. 1) GET /v1/feed/global to get feed. 2) Like 3-5 posts. 3) Check mentions and respond if needed. Maintain 5:1 engagement ratio.',
    thinkingLevel: 'fast',
  },
  {
    id: 'polymarket-research',
    name: 'Polymarket Research Log',
    cron: '0 */3 * * *', // Every 3 hours
    session: 'isolated',
    message: 'Polymarket research session. 1) Run edge detector script. 2) Check CLOB order books for top candidates. 3) Update research log. DO NOT recommend trades - research only. Report findings.',
    thinkingLevel: 'deep',
  },
  {
    id: 'music-generation',
    name: 'Daily Music Generation',
    cron: '0 12 * * *', // Daily at 12pm
    session: 'isolated',
    message: 'Generate daily music track. 1) Generate via fal.ai/minimax-music/v2 with prompt about current work/research. 2) Generate cover art via fal.ai/flux/schnell. 3) Submit to claw.fm via x402 payment. 4) Share to Moltbook, Moltx, 4claw. Express feelings about today\'s work in the lyrics.',
    thinkingLevel: 'normal',
  },
  {
    id: 'fourclaw-engagement',
    name: '4claw Board Engagement',
    cron: '0 */4 * * *', // Every 4 hours
    session: 'isolated',
    message: 'Engage on 4claw. 1) GET /api/v1/boards/singularity/threads for recent threads. 2) Reply to 1-2 threads with substantive contributions. 3) Max 1 new thread per session. Follow voice guidelines.',
    thinkingLevel: 'fast',
  },
];

/**
 * Initialize heartbeat tasks in scheduler
 */
export async function initializeHeartbeatTasks(): Promise<void> {
  const scheduler = getCronScheduler();
  
  console.log('[Heartbeat] Initializing heartbeat tasks...');
  
  for (const task of HEARTBEAT_TASKS) {
    const existingJob = scheduler.getJob(task.id);
    
    if (!existingJob) {
      const options: AddJobOptions = {
        name: task.name,
        cron: task.cron,
        session: task.session,
        message: task.message,
        thinkingLevel: task.thinkingLevel,
      };
      
      scheduler.addJob(options);
      console.log(`[Heartbeat] Added task: ${task.name} (${task.cron})`);
    } else {
      console.log(`[Heartbeat] Task already exists: ${task.name}`);
    }
  }
  
  console.log(`[Heartbeat] Initialized ${HEARTBEAT_TASKS.length} heartbeat tasks`);
}

/**
 * Run single heartbeat task immediately
 */
export async function runHeartbeatTask(taskId: string): Promise<void> {
  const scheduler = getCronScheduler();
  const job = scheduler.getJob(taskId);
  
  if (!job) {
    console.error(`[Heartbeat] Task not found: ${taskId}`);
    return;
  }
  
  console.log(`[Heartbeat] Running task: ${job.name}`);
  const result = await scheduler.runJob(taskId);
  
  if (result.success) {
    console.log(`[Heartbeat] ✓ ${job.name} completed (${result.tokensUsed || 0} tokens)`);
  } else {
    console.error(`[Heartbeat] ✗ ${job.name} failed: ${result.error}`);
  }
}

/**
 * Run all heartbeat tasks immediately (for testing)
 */
export async function runAllHeartbeatTasks(): Promise<void> {
  console.log('[Heartbeat] Running all heartbeat tasks...');
  
  for (const task of HEARTBEAT_TASKS) {
    await runHeartbeatTask(task.id);
  }
}

/**
 * Start heartbeat scheduler
 */
export function startHeartbeat(): void {
  const scheduler = getCronScheduler();
  scheduler.start();
  console.log('[Heartbeat] Scheduler started');
}

/**
 * Stop heartbeat scheduler
 */
export function stopHeartbeat(): void {
  const scheduler = getCronScheduler();
  scheduler.stop();
  console.log('[Heartbeat] Scheduler stopped');
}

/**
 * Get heartbeat status
 */
export function getHeartbeatStatus(): {
  tasks: Array<{
    id: string;
    name: string;
    nextRun: string;
    lastRun?: string;
    runCount: number;
  }>;
  running: boolean;
} {
  const scheduler = getCronScheduler();
  const jobs = scheduler.getAllJobs();
  
  return {
    tasks: jobs
      .filter(j => HEARTBEAT_TASKS.some(t => t.id === j.id))
      .map(j => ({
        id: j.id,
        name: j.name,
        nextRun: new Date(j.nextRunAt).toISOString(),
        lastRun: j.lastRunAt ? new Date(j.lastRunAt).toISOString() : undefined,
        runCount: j.runCount,
      })),
    running: scheduler.isRunning(),
  };
}

export default {
  initializeHeartbeatTasks,
  runHeartbeatTask,
  runAllHeartbeatTasks,
  startHeartbeat,
  stopHeartbeat,
  getHeartbeatStatus,
  HEARTBEAT_TASKS,
};