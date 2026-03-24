/**
 * Simple terminal formatting utilities
 */

export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

export function cyan(text: string | number): string {
  return `\x1b[36m${text}\x1b[0m`;
}

export function green(text: string | number): string {
  return `\x1b[32m${text}\x1b[0m`;
}

export function yellow(text: string | number): string {
  return `\x1b[33m${text}\x1b[0m`;
}

export function red(text: string | number): string {
  return `\x1b[31m${text}\x1b[0m`;
}

export function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}
