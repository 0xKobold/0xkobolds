/**
 * Heartbeat Check-in - v0.2.0
 * 
 * Check-in prompts and idle detection.
 */

import { CheckInType } from './scheduler.js';

export interface CheckInPrompt {
  type: CheckInType;
  message: string;
  emoji: string;
  actions: string[];
}

export const CHECKIN_PROMPTS: Record<CheckInType, CheckInPrompt[]> = {
  morning: [
    {
      type: 'morning',
      message: "Good morning! Ready to tackle today's challenges?",
      emoji: '🌅',
      actions: ['plan', 'review', 'ask'],
    },
    {
      type: 'morning',
      message: 'Morning! What are we working on today?',
      emoji: '☕',
      actions: ['list', 'prioritize', 'start'],
    },
  ],
  evening: [
    {
      type: 'evening',
      message: "Evening check-in! How did today's work go?",
      emoji: '🌆',
      actions: ['review', 'summarize', 'prepare'],
    },
    {
      type: 'evening',
      message: 'Time to wrap up! Want to review what we accomplished?',
      emoji: '📝',
      actions: ['summarize', 'commit', 'reflect'],
    },
  ],
  periodic: [
    {
      type: 'periodic',
      message: 'Quick check-in! How are things going?',
      emoji: '⏰',
      actions: ['continue', 'pause', 'review'],
    },
  ],
  idle: [
    {
      type: 'idle',
      message: "You've been idle for a while. Need anything?",
      emoji: '💤',
      actions: ['resume', 'new_task', 'status'],
    },
    {
      type: 'idle',
      message: 'Welcome back! where were we?',
      emoji: '👋',
      actions: ['context', 'continue', 'review'],
    },
  ],
  nurture: [
    {
      type: 'nurture',
      message: "How's your day going? Need any help?",
      emoji: '🤗',
      actions: ['help', 'chat', 'dismiss'],
    },
    {
      type: 'nurture',
      message: 'Just checking in! Anything on your mind?',
      emoji: '💭',
      actions: ['brainstorm', 'vent', 'dismiss'],
    },
    {
      type: 'nurture',
      message: "Want to review today's progress?",
      emoji: '📊',
      actions: ['review', 'ignore', 'schedule'],
    },
  ],
};

/**
 * Get a random check-in prompt for the type
 */
export function getCheckInPrompt(type: CheckInType): CheckInPrompt {
  const prompts = CHECKIN_PROMPTS[type];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

/**
 * Format check-in message with emoji
 */
export function formatCheckInMessage(prompt: CheckInPrompt): string {
  return `${prompt.emoji} ${prompt.message}`;
}

/**
 * Build check-in response
 */
export interface CheckInResponse {
  type: CheckInType;
  message: string;
  actions: CheckInAction[];
}

export interface CheckInAction {
  id: string;
  label: string;
  description: string;
}

const ACTION_DEFINITIONS: Record<string, CheckInAction> = {
  plan: { id: 'plan', label: 'Plan', description: 'Create a plan for today' },
  review: { id: 'review', label: 'Review', description: 'Review recent work' },
  ask: { id: 'ask', label: 'Ask', description: 'Ask a question' },
  list: { id: 'list', label: 'List Tasks', description: 'Show task list' },
  prioritize: { id: 'prioritize', label: 'Prioritize', description: 'Prioritize tasks' },
  start: { id: 'start', label: 'Start', description: 'Start working' },
  summarize: { id: 'summarize', label: 'Summarize', description: 'Summarize work' },
  commit: { id: 'commit', label: 'Commit', description: 'Commit changes' },
  reflect: { id: 'reflect', label: 'Reflect', description: 'Reflect on the day' },
  continue: { id: 'continue', label: 'Continue', description: 'Continue current work' },
  pause: { id: 'pause', label: 'Pause', description: 'Take a break' },
  resume: { id: 'resume', label: 'Resume', description: 'Resume work' },
  new_task: { id: 'new_task', label: 'New Task', description: 'Start new task' },
  status: { id: 'status', label: 'Status', description: 'Show current status' },
  context: { id: 'context', label: 'Context', description: 'Review context' },
  help: { id: 'help', label: 'Help', description: 'Get help' },
  chat: { id: 'chat', label: 'Chat', description: 'Just chat' },
  dismiss: { id: 'dismiss', label: 'Dismiss', description: 'Dismiss check-in' },
  brainstorm: { id: 'brainstorm', label: 'Brainstorm', description: 'Brainstorm ideas' },
  vent: { id: 'vent', label: 'Vent', description: 'Discuss concerns' },
  ignore: { id: 'ignore', label: 'Ignore', description: 'Ignore for now' },
  schedule: { id: 'schedule', label: 'Schedule', description: 'Schedule for later' },
};

/**
 * Build check-in response with actions
 */
export function buildCheckInResponse(
  type: CheckInType,
  customMessage?: string,
  payload?: Record<string, unknown>
): CheckInResponse {
  const prompt = getCheckInPrompt(type);
  const message = customMessage || formatCheckInMessage(prompt);
  
  // Add idle time to message if provided
  if (payload?.idleMinutes) {
    message.concat(` (idle for ${payload.idleMinutes} minutes)`);
  }

  const actions = prompt.actions
    .map((id) => ACTION_DEFINITIONS[id])
    .filter((action): action is CheckInAction => action !== undefined);

  return {
    type,
    message,
    actions,
  };
}

/**
 * Handle check-in action
 */
export function handleCheckInAction(
  actionId: string,
  _type: CheckInType
): { message: string; suggestedAction?: string } {
  switch (actionId) {
    case 'dismiss':
      return { message: 'Check-in dismissed. See you later!' };
    case 'plan':
      return {
        message: "Let's plan! What would you like to work on?",
        suggestedAction: 'switch_to_plan_mode',
      };
    case 'review':
      return {
        message: 'Reviewing recent work...',
        suggestedAction: 'show_recent_changes',
      };
    case 'continue':
      return { message: 'Continuing from where we left off...' };
    case 'help':
      return { message: "I'm here to help! What do you need?" };
    case 'brainstorm':
      return { message: "Let's brainstorm! What's on your mind?", suggestedAction: 'brainstorm' };
    case 'vent':
      return { message: "I'm all ears. What's bothering you?", suggestedAction: 'just_listen' };
    default:
      return { message: `Executing ${actionId}...` };
  }
}

/**
 * Detect if user is idle based on last interaction
 */
export function detectIdle(
  lastInteraction: Date,
  thresholdMinutes: number
): { isIdle: boolean; idleMinutes: number } {
  const idleMs = Date.now() - lastInteraction.getTime();
  const idleMinutes = Math.floor(idleMs / 60000);
  return {
    isIdle: idleMinutes >= thresholdMinutes,
    idleMinutes,
  };
}

/**
 * Get time-appropriate greeting
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
