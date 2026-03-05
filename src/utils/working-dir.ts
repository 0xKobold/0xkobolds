/**
 * Working Directory Utilities
 *
 * Centralized handling of KOBOLD_WORKING_DIR for --local mode support.
 * All file operations should use these utilities to respect the local workspace.
 */

import { resolve, normalize } from "path";

/**
 * Get the effective working directory.
 * Uses KOBOLD_WORKING_DIR env var if set, otherwise falls back to process.cwd()
 */
export function getWorkingDir(): string {
  return process.env.KOBOLD_WORKING_DIR || process.cwd();
}

/**
 * Resolve a path relative to the working directory.
 * Handles both relative and absolute paths safely.
 */
export function resolvePath(inputPath: string): string {
  const workingDir = getWorkingDir();

  // If already absolute, normalize it
  if (inputPath.startsWith("/")) {
    return normalize(inputPath);
  }

  // Resolve relative to working directory
  return resolve(workingDir, inputPath);
}

/**
 * Validate that a resolved path stays within the working directory.
 * Returns null if valid, error message if invalid.
 */
export function validatePathWithinWorkspace(
  inputPath: string
): { valid: true; resolvedPath: string } | { valid: false; error: string; resolvedPath: string } {
  try {
    const resolvedPath = resolvePath(inputPath);
    const workingDir = getWorkingDir();

    // Check for directory traversal (resolved path escapes working dir)
    if (!resolvedPath.startsWith(workingDir) && !resolvedPath.startsWith("/tmp")) {
      return {
        valid: false,
        error: `Path "${inputPath}" escapes working directory`,
        resolvedPath,
      };
    }

    return { valid: true, resolvedPath };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid path: ${error}`,
      resolvedPath: inputPath,
    };
  }
}

/**
 * Get relative path from working directory for display purposes.
 */
export function getRelativePath(absolutePath: string): string {
  const workingDir = getWorkingDir();
  if (absolutePath.startsWith(workingDir)) {
    return absolutePath.slice(workingDir.length).replace(/^\//, "") || ".";
  }
  return absolutePath;
}

/**
 * Check if we're in local mode (KOBOLD_WORKING_DIR is set and differs from process.cwd())
 */
export function isLocalMode(): boolean {
  return !!(
    process.env.KOBOLD_WORKING_DIR &&
    process.env.KOBOLD_WORKING_DIR !== process.cwd()
  );
}
