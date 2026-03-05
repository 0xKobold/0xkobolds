/**
 * Test script for web_fetch and web_search tools
 * Run with: bun run test-web-tools.ts
 */

console.log("Testing web_fetch and web_search tools...\n");

// Simulate the tool call structure that the framework might send
const testCases = [
  {
    name: "Direct object",
    args: { url: "https://openrouter.ai/models", max_length: 1000 },
  },
  {
    name: "Nested in parameters",
    args: { parameters: { url: "https://openrouter.ai/models", max_length: 1000 } },
  },
  {
    name: "Array style",
    args: [{ url: "https://openrouter.ai/models", max_length: 1000 }],
  },
];

// Test the argument extraction logic
function extractArgs(args: any) {
  const url = args?.url || args?.parameters?.url || args?.[0]?.url;
  const max_length = args?.max_length || args?.parameters?.max_length || args?.[0]?.max_length || 5000;
  return { url, max_length };
}

console.log("Testing argument extraction:");
for (const testCase of testCases) {
  const result = extractArgs(testCase.args);
  console.log(`\n${testCase.name}:`);
  console.log(`  Input: ${JSON.stringify(testCase.args).slice(0, 60)}...`);
  console.log(`  Extracted URL: ${result.url}`);
  console.log(`  Valid: ${result.url?.startsWith("http") ? "✅" : "❌"}`);
}

console.log("\n\n✅ If all test cases show valid URLs, the fix should work!");
console.log("🔄 Restart the agent to apply the updated extension.");
