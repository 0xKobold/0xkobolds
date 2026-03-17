/**
 * Natural Language Cron Parser - v0.1.0
 * 
 * Parse natural language schedules like:
 * - "daily report at 8am"
 * - "weekly backup on sunday midnight"
 * - "remind me in 30 minutes"
 * - "every hour"
 * - "at 5pm tomorrow"
 * 
 * Based on Hermes natural language scheduling
 */

import { CronJob, SessionType } from "./types.js";

/**
 * Parsed schedule result
 */
export interface ParsedSchedule {
  /** Cron expression (for recurring) */
  cronExpression?: string;
  
  /** One-shot: absolute timestamp (ms) */
  at?: number;
  
  /** One-shot: relative duration (ms) */
  atDuration?: number;
  
  /** Human-readable description */
  description: string;
  
  /** Original input */
  original: string;
  
  /** Is recurring? */
  recurring: boolean;
}

/**
 * Time component
 */
interface TimeComponents {
  hour?: number;
  minute?: number;
  second?: number;
  ampm?: "am" | "pm";
}

/**
 * Date component
 */
interface DateComponents {
  year?: number;
  month?: number;
  day?: number;
  dayOfWeek?: number;
}

/**
 * Duration component
 */
interface DurationComponents {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

/**
 * Named time zones for common offsets
 */
const TIMEZONE_OFFSETS: Record<string, number> = {
  utc: 0,
  gmt: 0,
  est: -5,
  edt: -4,
  cst: -6,
  cdt: -5,
  mst: -7,
  mdt: -6,
  pst: -8,
  pdt: -7,
};

/**
 * Day names to day of week (0 = Sunday)
 */
const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Month names to month (1-12)
 */
const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Unit names to milliseconds
 */
const UNIT_MS: Record<string, number> = {
  millisecond: 1,
  milliseconds: 1,
  ms: 1,
  second: 1000,
  seconds: 1000,
  sec: 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  min: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  wk: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
  yr: 365 * 24 * 60 * 60 * 1000,
};

/**
 * Patterns for natural language parsing
 */
const PATTERNS = {
  // "daily at 8am", "every day at 8:30am"
  daily: /(?:daily|every\s+day)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  
  // "hourly", "every hour"
  hourly: /(?:hourly|every\s+hour)\b/i,
  
  // "weekly on sunday", "every week on monday at 9am"
  weekly: /(?:weekly|every\s+week)\s+(?:on\s+)?(\w+)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  
  // "monthly on the 15th", "every month on the 1st at noon"
  monthly: /(?:monthly|every\s+month)\s+(?:on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?)\s*(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  
  // "in 5 minutes", "in 2 hours", "in 3 days"
  inDuration: /in\s+(\d+)\s+(milliseconds?|seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i,
  
  // "at 5pm", "at 3:30pm"
  atTime: /at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  
  // "tomorrow at 9am"
  tomorrow: /tomorrow(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  
  // "next monday", "next friday at 5pm"
  nextDay: /next\s+(\w+)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  
  // "every 30 minutes", "every 2 hours"
  everyInterval: /every\s+(\d+)\s+(minutes?|hours?|days?|weeks?)\b/i,
  
  // "noon", "midnight"
  namedTime: /\b(noon|midnight)\b/i,
  
  // Cron expression (validate)
  cron: /^(\*|[\d,\/-]+)\s+(\*|[\d,\/-]+)\s+(\*|[\d,\/-]+)\s+(\*|[\d,\/-]+)\s+(\*|[\d,\/-]+)$/,
};

/**
 * Parse natural language schedule
 */
export function parseNaturalSchedule(text: string): ParsedSchedule {
  const input = text.trim().toLowerCase();
  
  // First, check if it's already a cron expression
  if (PATTERNS.cron.test(text.trim())) {
    return {
      cronExpression: text.trim(),
      description: `Cron: ${text.trim()}`,
      original: text,
      recurring: true,
    };
  }
  
  // Try each pattern
  let result: ParsedSchedule | null = null;
  
  // Daily
  result = tryDaily(input, text);
  if (result) return result;
  
  // Hourly
  result = tryHourly(input, text);
  if (result) return result;
  
  // Weekly
  result = tryWeekly(input, text);
  if (result) return result;
  
  // Monthly
  result = tryMonthly(input, text);
  if (result) return result;
  
  // "In X duration"
  result = tryInDuration(input, text);
  if (result) return result;
  
  // "Tomorrow"
  result = tryTomorrow(input, text);
  if (result) return result;
  
  // "Next <day>"
  result = tryNextDay(input, text);
  if (result) return result;
  
  // "Every X minutes/hours"
  result = tryEveryInterval(input, text);
  if (result) return result;
  
  // "At <time>" (one-shot today/tomorrow)
  result = tryAtTime(input, text);
  if (result) return result;
  
  // Named times (noon, midnight)
  result = tryNamedTime(input, text);
  if (result) return result;
  
  // Default: couldn't parse
  return {
    description: `Could not parse: ${text}`,
    original: text,
    recurring: false,
  };
}

/**
 * Try to parse "daily at X"
 */
function tryDaily(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.daily);
  if (!match) return null;
  
  const hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  
  const { hour: hour24, minute: minute24 } = normalizeTime(hour, minute, ampm);
  
  // Cron: minute hour * * *
  const cronExpression = `${minute24} ${hour24} * * *`;
  
  return {
    cronExpression,
    description: `Daily at ${formatTime(hour24, minute24)}`,
    original,
    recurring: true,
  };
}

/**
 * Try to parse "hourly"
 */
function tryHourly(input: string, original: string): ParsedSchedule | null {
  if (!PATTERNS.hourly.test(input)) return null;
  
  // Cron: 0 * * * *
  return {
    cronExpression: "0 * * * *",
    description: "Every hour",
    original,
    recurring: true,
  };
}

/**
 * Try to parse "weekly on <day>"
 */
function tryWeekly(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.weekly);
  if (!match) return null;
  
  const dayName = match[1].toLowerCase();
  const dayOfWeek = DAY_NAMES[dayName];
  
  if (dayOfWeek === undefined) return null;
  
  let hour = 0, minute = 0;
  let hour24 = 0, minute24 = 0;
  
  if (match[2]) {
    hour = parseInt(match[2], 10);
    minute = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4]?.toLowerCase();
    ({ hour: hour24, minute: minute24 } = normalizeTime(hour, minute, ampm));
  } else {
    hour24 = 0;
    minute24 = 0;
  }
  
  // Cron: minute hour * * dayOfWeek
  const cronExpression = `${minute24} ${hour24} * * ${dayOfWeek}`;
  
  const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  
  return {
    cronExpression,
    description: `Weekly on ${dayNameCap}${match[2] ? ` at ${formatTime(hour24, minute24)}` : ""}`,
    original,
    recurring: true,
  };
}

/**
 * Try to parse "monthly on the X"
 */
function tryMonthly(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.monthly);
  if (!match) return null;
  
  const dayOfMonth = parseInt(match[1], 10);
  
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;
  
  let hour24 = 0, minute24 = 0;
  
  if (match[2]) {
    const hour = parseInt(match[2], 10);
    const minute = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4]?.toLowerCase();
    ({ hour: hour24, minute: minute24 } = normalizeTime(hour, minute, ampm));
  }
  
  // Cron: minute hour day * *
  const cronExpression = `${minute24} ${hour24} ${dayOfMonth} * *`;
  
  return {
    cronExpression,
    description: `Monthly on day ${dayOfMonth}${match[2] ? ` at ${formatTime(hour24, minute24)}` : ""}`,
    original,
    recurring: true,
  };
}

/**
 * Try to parse "in X duration"
 */
function tryInDuration(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.inDuration);
  if (!match) return null;
  
  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = UNIT_MS[unit];
  
  if (!ms) return null;
  
  const durationMs = count * ms;
  
  return {
    atDuration: durationMs,
    description: `In ${count} ${match[2]}`,
    original,
    recurring: false,
  };
}

/**
 * Try to parse "tomorrow"
 */
function tryTomorrow(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.tomorrow);
  if (!match) return null;
  
  // Calculate tomorrow at midnight
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  if (match[1]) {
    // "tomorrow at X"
    const hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3]?.toLowerCase();
    const { hour: hour24, minute: minute24 } = normalizeTime(hour, minute, ampm);
    tomorrow.setHours(hour24, minute24, 0, 0);
  }
  
  return {
    at: tomorrow.getTime(),
    description: match[1] 
      ? `Tomorrow at ${formatTime(tomorrow.getHours(), tomorrow.getMinutes())}`
      : "Tomorrow",
    original,
    recurring: false,
  };
}

/**
 * Try to parse "next <day>"
 */
function tryNextDay(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.nextDay);
  if (!match) return null;
  
  const dayName = match[1].toLowerCase();
  const dayOfWeek = DAY_NAMES[dayName];
  
  if (dayOfWeek === undefined) return null;
  
  // Calculate next occurrence
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysUntil);
  
  let hour24 = 0, minute24 = 0;
  
  if (match[2]) {
    const hour = parseInt(match[2], 10);
    const minute = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4]?.toLowerCase();
    ({ hour: hour24, minute: minute24 } = normalizeTime(hour, minute, ampm));
    nextDate.setHours(hour24, minute24, 0, 0);
  } else {
    nextDate.setHours(0, 0, 0, 0);
  }
  
  const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  
  return {
    at: nextDate.getTime(),
    description: `Next ${dayNameCap}${match[2] ? ` at ${formatTime(hour24, minute24)}` : ""}`,
    original,
    recurring: false,
  };
}

/**
 * Try to parse "every X minutes/hours"
 */
function tryEveryInterval(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.everyInterval);
  if (!match) return null;
  
  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  if (unit.startsWith("min")) {
    // Cron: */N * * * *
    return {
      cronExpression: `*/${count} * * * *`,
      description: `Every ${count} minute${count > 1 ? "s" : ""}`,
      original,
      recurring: true,
    };
  }
  
  if (unit.startsWith("hour")) {
    // Cron: 0 */N * * *
    return {
      cronExpression: `0 */${count} * * *`,
      description: `Every ${count} hour${count > 1 ? "s" : ""}`,
      original,
      recurring: true,
    };
  }
  
  if (unit.startsWith("day")) {
    // Cron: 0 0 */N * *
    return {
      cronExpression: `0 0 */${count} * *`,
      description: `Every ${count} day${count > 1 ? "s" : ""}`,
      original,
      recurring: true,
    };
  }
  
  if (unit.startsWith("week")) {
    // Every N weeks = every N*7 days
    return {
      cronExpression: `0 0 */${count * 7} * *`,
      description: `Every ${count} week${count > 1 ? "s" : ""}`,
      original,
      recurring: true,
    };
  }
  
  return null;
}

/**
 * Try to parse "at <time>"
 */
function tryAtTime(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.atTime);
  if (!match) return null;
  
  const hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  
  const { hour: hour24, minute: minute24 } = normalizeTime(hour, minute, ampm);
  
  // Calculate today/tomorrow
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour24, minute24, 0, 0);
  
  // If time has passed, assume tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  
  return {
    at: target.getTime(),
    description: `At ${formatTime(hour24, minute24)}`,
    original,
    recurring: false,
  };
}

/**
 * Try to parse named times (noon, midnight)
 */
function tryNamedTime(input: string, original: string): ParsedSchedule | null {
  const match = input.match(PATTERNS.namedTime);
  if (!match) return null;
  
  const named = match[1].toLowerCase();
  const now = new Date();
  const target = new Date(now);
  
  if (named === "noon") {
    target.setHours(12, 0, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return {
      at: target.getTime(),
      description: "At noon",
      original,
      recurring: false,
    };
  }
  
  if (named === "midnight") {
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + 1);
    return {
      at: target.getTime(),
      description: "At midnight",
      original,
      recurring: false,
    };
  }
  
  return null;
}

/**
 * Normalize time to 24-hour format
 */
function normalizeTime(hour: number, minute: number, ampm?: string): { hour: number; minute: number } {
  let hour24 = hour;
  
  if (ampm === "pm" && hour !== 12) {
    hour24 = hour + 12;
  } else if (ampm === "am" && hour === 12) {
    hour24 = 0;
  }
  
  return { hour: hour24, minute };
}

/**
 * Format time for display
 */
function formatTime(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "pm" : "am";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute.toString().padStart(2, "0")}${ampm}`;
}

/**
 * Create a cron job from natural language
 */
export function createCronFromNL(
  text: string,
  options: {
    name?: string;
    message?: string;
    session?: SessionType;
    timezone?: string;
  } = {}
): Partial<CronJob> | null {
  const parsed = parseNaturalSchedule(text);
  
  if (!parsed.cronExpression && !parsed.at && !parsed.atDuration) {
    return null;
  }
  
  const job: Partial<CronJob> = {
    name: options.name || `Job at ${new Date().toISOString()}`,
    message: options.message || text,
    session: options.session || "isolated",
    timezone: options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  
  if (parsed.cronExpression) {
    job.cronExpression = parsed.cronExpression;
    job.nextRunAt = getNextRun(parsed.cronExpression, job.timezone);
  } else if (parsed.at) {
    job.at = parsed.at;
    job.nextRunAt = parsed.at;
  } else if (parsed.atDuration) {
    job.atDuration = parsed.atDuration;
    job.nextRunAt = Date.now() + parsed.atDuration;
  }
  
  return job;
}

/**
 * Get next run time from cron expression
 */
function getNextRun(cronExpression: string, timezone: string): number {
  const parts = cronExpression.split(/\s+/);
  if (parts.length !== 5) return Date.now();
  
  // Simplified: calculate next run (would use proper cron parser in production)
  // For now, just return current time + 1 minute
  return Date.now() + 60 * 1000;
}

export default parseNaturalSchedule;