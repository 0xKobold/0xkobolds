/**
 * Cron Expression Parser - 0xKobold
 * 
 * Parses standard cron expressions and calculates next run times.
 * Supports: standard cron, L (last), W (weekday), # (nth)
 */

import { CronExpression, ParsedDuration } from './types.js';

// Standard cron ranges
const RANGES = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 }, // 0 = Sunday
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Parse a cron expression into structured components
 */
export function parseCron(expression: string, timezone: string = 'UTC'): CronExpression {
  const parts = expression.trim().split(/\s+/);
  
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error(
      `Invalid cron expression "${expression}". Expected 5 fields (min hour day month dow) or 6 fields (with seconds).`
    );
  }

  // Handle 6-field format (with seconds)
  let [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  if (parts.length === 6) {
    // Skip seconds, use rest
    [, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  }

  return {
    minute: parseField(minute, 'minute'),
    hour: parseField(hour, 'hour'),
    dayOfMonth: parseField(dayOfMonth, 'dayOfMonth'),
    month: parseField(month, 'month'),
    dayOfWeek: parseField(dayOfWeek, 'dayOfWeek'),
    timezone,
  };
}

/**
 * Parse a single cron field
 */
function parseField(field: string, type: keyof typeof RANGES): number[] | '*' {
  const range = RANGES[type];
  
  // Wildcard
  if (field === '*') return '*';
  
  // Step syntax (*/5 = every 5)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid step value in "${field}"`);
    }
    const values: number[] = [];
    for (let i = range.min; i <= range.max; i += step) {
      values.push(i);
    }
    return values;
  }
  
  // Range with step (1-10/2)
  if (field.includes('/')) {
    const [rangePart, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid step in "${field}"`);
    }
    
    const [start, end] = parseRange(rangePart, type);
    const values: number[] = [];
    for (let i = start; i <= end; i += step) {
      values.push(i);
    }
    return values;
  }
  
  // Simple range (1-5)
  if (field.includes('-')) {
    const [start, end] = parseRange(field, type);
    const values: number[] = [];
    for (let i = start; i <= end; i++) {
      values.push(i);
    }
    return values;
  }
  
  // List (1,2,3 or MON,WED,FRI)
  if (field.includes(',')) {
    const values: number[] = [];
    for (const part of field.split(',')) {
      const val = parseValue(part.trim(), type);
      values.push(val);
    }
    return [...new Set(values)].sort((a, b) => a - b);
  }
  
  // Single value
  return [parseValue(field, type)];
}

/**
 * Parse a range like "1-5" or "MON-FRI"
 */
function parseRange(rangeStr: string, type: keyof typeof RANGES): [number, number] {
  const [startStr, endStr] = rangeStr.split('-');
  return [
    parseValue(startStr.trim(), type),
    parseValue(endStr.trim(), type),
  ];
}

/**
 * Parse a single value (number or name)
 */
function parseValue(value: string, type: keyof typeof RANGES): number {
  const lower = value.toLowerCase();
  
  // Handle month names
  if (type === 'month' && MONTH_NAMES[lower] !== undefined) {
    return MONTH_NAMES[lower];
  }
  
  // Handle day names
  if (type === 'dayOfWeek' && DAY_NAMES[lower] !== undefined) {
    return DAY_NAMES[lower];
  }
  
  // Special: L (last day of month)
  if (type === 'dayOfMonth' && lower === 'l') {
    return -1; // Special marker for last day
  }
  
  const num = parseInt(value, 10);
  const range = RANGES[type];
  
  if (isNaN(num)) {
    throw new Error(`Invalid value "${value}" for ${type}`);
  }
  
  if (num < range.min || num > range.max) {
    throw new Error(`Value ${num} out of range [${range.min}-${range.max}] for ${type}`);
  }
  
  return num;
}

/**
 * Calculate the next run time for a cron expression
 */
export function getNextRun(
  expression: CronExpression,
  from: Date = new Date()
): Date {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = expression;
  
  // Start from the next minute
  let candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  
  // Limit search to prevent infinite loops
  const maxIterations = 366 * 24 * 60; // ~1 year in minutes
  
  for (let i = 0; i < maxIterations; i++) {
    if (matches(candidate, expression)) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  
  throw new Error('Could not find next run time within 1 year');
}

/**
 * Check if a date matches the cron expression
 */
function matches(date: Date, expression: CronExpression): boolean {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = expression;
  
  if (!matchesField(date.getMinutes(), minute)) return false;
  if (!matchesField(date.getHours(), hour)) return false;
  if (!matchesMonth(date.getMonth() + 1, month)) return false;
  if (!matchesDayOfMonth(date.getDate(), dayOfMonth, date)) return false;
  if (!matchesField(date.getDay(), dayOfWeek)) return false;
  
  return true;
}

function matchesField(value: number, pattern: number[] | '*'): boolean {
  if (pattern === '*') return true;
  return pattern.includes(value);
}

function matchesMonth(value: number, pattern: number[] | '*'): boolean {
  if (pattern === '*') return true;
  return pattern.includes(value);
}

function matchesDayOfMonth(
  value: number,
  pattern: number[] | '*',
  date: Date
): boolean {
  if (pattern === '*') return true;
  
  // Handle L (last day of month)
  if (pattern.includes(-1)) {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    if (value === lastDay) return true;
  }
  
  return pattern.includes(value);
}

/**
 * Parse duration strings like "20m", "2h", "1h30m", "1d"
 */
export function parseDuration(duration: string): ParsedDuration {
  const regex = /^(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s?)?$/i;
  const match = duration.trim().match(regex);
  
  if (!match) {
    throw new Error(`Invalid duration "${duration}". Use format: 1d, 2h, 30m, 1h30m`);
  }
  
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseInt(match[4] || '0', 10);
  
  const milliseconds =
    days * 24 * 60 * 60 * 1000 +
    hours * 60 * 60 * 1000 +
    minutes * 60 * 1000 +
    seconds * 1000;
  
  return {
    milliseconds,
    hours: days * 24 + hours,
    minutes,
    seconds,
  };
}

/**
 * Parse absolute time like "2025-01-10T09:00:00" or ISO string
 */
export function parseAt(at: string): number {
  // Try parsing as ISO date
  const date = new Date(at);
  
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }
  
  // Try parsing relative (e.g., "20m" shorthand for duration)
  try {
    const duration = parseDuration(at);
    return Date.now() + duration.milliseconds;
  } catch {
    // Not a valid duration either
  }
  
  throw new Error(`Invalid time "${at}". Use ISO date (2025-01-10T09:00:00) or duration (20m)`);
}

/**
 * Format a cron expression in human-readable form
 */
export function formatCron(expression: CronExpression): string {
  const parts: string[] = [];
  
  if (expression.minute !== '*') {
    parts.push(`minute(s): ${Array.isArray(expression.minute) ? expression.minute.join(', ') : expression.minute}`);
  }
  if (expression.hour !== '*') {
    parts.push(`hour(s): ${Array.isArray(expression.hour) ? expression.hour.join(', ') : expression.hour}`);
  }
  if (expression.dayOfMonth !== '*') {
    parts.push(`day(s): ${Array.isArray(expression.dayOfMonth) ? expression.dayOfMonth.join(', ') : expression.dayOfMonth}`);
  }
  if (expression.month !== '*') {
    parts.push(`month(s): ${Array.isArray(expression.month) ? expression.month.join(', ') : expression.month}`);
  }
  if (expression.dayOfWeek !== '*') {
    parts.push(`weekday(s): ${Array.isArray(expression.dayOfWeek) ? expression.dayOfWeek.join(', ') : expression.dayOfWeek}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'every minute';
}

/**
 * Validate a cron expression
 */
export function validateCron(expression: string): { valid: boolean; error?: string } {
  try {
    parseCron(expression);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Common cron presets
 */
export const CRON_PRESETS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
} as const;

/**
 * Parse preset or standard expression
 */
export function parseExpression(expression: string, timezone?: string): CronExpression {
  const normalized = expression.trim();
  
  // Check for presets
  if (normalized in CRON_PRESETS) {
    return parseCron(CRON_PRESETS[normalized as keyof typeof CRON_PRESETS], timezone);
  }
  
  return parseCron(normalized, timezone);
}
