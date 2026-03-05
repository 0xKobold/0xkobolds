/**
 * Custom Mode Extension Example
 *
 * This shows how to register your own custom modes.
 * Save this as an extension file and load it via pi-coding-agent.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function customModesExtension(pi: ExtensionAPI) {
  // Register a custom "debug" mode
  pi.registerCommand("debug", {
    description: "Switch to DEBUG mode",
    handler: async () => {
      // Mode configuration
      const debugMode = {
        id: "debug",
        name: "Debug",
        description: "Debug mode with verbose logging",
        icon: "🐛",
        systemPrompt: `You are in DEBUG MODE. Focus on debugging and troubleshooting.

Your role:
- Analyze error messages carefully
- Step through code execution mentally
- Check for common bugs and edge cases
- Provide detailed explanations of what might be wrong
- Suggest specific debugging steps

You can use read tools and web search for documentation.`,
        allowedTools: [
          "read_file",
          "read_file_with_line_numbers",
          "search_files",
          "web_search",
          "web_fetch",
          "ask_user",
        ],
        color: "yellow",
      };

      // The mode manager extension will handle switching
      // For now, we just notify
      pi.ui.notify?.("Debug mode activated", "info");
      pi.ui.notify?.(debugMode.systemPrompt, "info");
    },
  });

  // Register a custom "review" mode
  pi.registerCommand("review", {
    description: "Switch to CODE REVIEW mode",
    handler: async () => {
      const reviewMode = {
        id: "review",
        name: "Review",
        description: "Code review mode for PRs and changes",
        icon: "👀",
        systemPrompt: `You are in CODE REVIEW MODE. Focus on reviewing code changes.

Your role:
- Analyze code for bugs, security issues, and anti-patterns
- Check for proper error handling
- Verify naming conventions and code style
- Look for performance optimizations
- Ensure tests are adequate
- Be constructive in feedback

Focus on:
1. Correctness - Does it work?
2. Security - Are there vulnerabilities?
3. Maintainability - Is it readable?
4. Performance - Are there inefficiencies?
5. Testing - Is it well-tested?`,
        allowedTools: [
          "read_file",
          "read_file_with_line_numbers",
          "search_files",
          "web_search",
          "ask_user",
        ],
        color: "purple",
      };

      pi.ui.notify?.("Code review mode activated", "info");
      pi.ui.notify?.(reviewMode.systemPrompt, "info");
    },
  });

  console.log("Custom modes extension loaded: debug, review");
}
