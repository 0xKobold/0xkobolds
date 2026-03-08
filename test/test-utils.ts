/**
 * Test Utilities - CI Detection
 */

export const isCI = (): boolean => {
  return process.env.CI === 'true' || 
         process.env.GITEA_ACTIONS === 'true' ||
         process.env.GITHUB_ACTIONS === 'true';
};

/**
 * Skip tests in CI environment
 * Use for tests that require:
 * - Home directory access
 * - Subprocess spawning
 * - Real filesystem operations
 */
export const describeIfNotCI = (name: string, fn: () => void) => {
  if (isCI()) {
    console.log(`[CI Skip] ${name}`);
    return;
  }
  // Use global describe if available, otherwise noop
  if (typeof describe !== 'undefined') {
    describe(name, fn);
  }
};

/**
 * Wrap a test to skip in CI
 */
export const skipIfCI = <T extends (...args: any[]) => any>(fn: T): T | (() => void) => {
  if (isCI()) {
    console.log(`[CI Skip] Skipping test that requires local environment`);
    return () => {};
  }
  return fn;
};
