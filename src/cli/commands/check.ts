/**
 * Check Command - v0.3.0
 *
 * Check for duplicate implementations before adding new code.
 */

import { Command } from "commander";
import { getDuplicateDetector } from "../../skills/index.js";

export const checkCommand = new Command("check")
  .description("Check for existing implementations before adding new code")
  .argument("<description>", "Description of what you want to add")
  .option("-f, --function <name>", "Check for function")
  .option("-c, --class <name>", "Check for class")
  .option("-s, --signature <signature>", "Function signature to compare")
  .option("--similarity <threshold>", "Similarity threshold (0.0-1.0)", "0.7")
  .option("--max-results <n>", "Max results to show", "5")
  .action(async (description: string, options) => {
    console.log("🔍 Checking for existing implementations...\n");

    const detector = getDuplicateDetector({
      scanPaths: ["src", "lib"],
      similarityThreshold: parseFloat(options.similarity),
      maxResults: parseInt(options.maxResults),
      excludePatterns: ["node_modules", ".git", "test", "*.test.ts"],
    });

    let result;

    if (options.function) {
      console.log(`Checking for function: ${options.function}`);
      result = await detector.checkFunction(
        options.function,
        options.signature || "",
      );
    } else if (options.class) {
      console.log(`Checking for class: ${options.class}`);
      const methods = options.signature
        ? options.signature.split(",").map((m: string) => m.trim())
        : undefined;
      result = await detector.checkClass(options.class, methods);
    } else {
      console.log(`Checking: ${description}`);
      result = await detector.check(description);
    }

    console.log("\n" + "=".repeat(60));
    console.log("RESULTS");
    console.log("=".repeat(60));

    if (result.exists) {
      console.log(`\n⚠️  EXISTING IMPLEMENTATION FOUND`);
      console.log(`   Confidence: ${Math.round(result.confidence * 100)}%\n`);
    } else if (result.matches.length > 0) {
      console.log(`\n⚡ SIMILAR IMPLEMENTATIONS FOUND`);
      console.log(`   Best match: ${Math.round(result.confidence * 100)}%\n`);
    } else {
      console.log(`\n✅ NO EXISTING IMPLEMENTATION FOUND`);
      console.log(`   Safe to proceed with implementation.\n`);
    }

    if (result.matches.length > 0) {
      console.log("Similar files:");
      result.matches.forEach((match, i) => {
        console.log(
          `  ${i + 1}. ${match.file}:${match.line} (${Math.round(match.similarity * 100)}%)`,
        );
        console.log(`     ${match.snippet.slice(0, 60)}...`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("SUGGESTION");
    console.log("=".repeat(60));
    console.log(result.suggestion);

    // Return exit code
    process.exit(result.exists && result.confidence > 0.9 ? 1 : 0);
  });
