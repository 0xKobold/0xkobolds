import { Command } from "commander";
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const tuiCommand = new Command()
  .name("tui")
  .description("Start the 0xKobold Terminal UI (interactive mode)")
  .option("-e, --extensions <paths...>", "Additional extension paths to load")
  .option("-l, --local", "Use current directory as workspace (default: global ~/.0xkobold)")
  .action(async (options) => {
    // The main TUI entry point is src/index.ts (relative to package root)
    const packageRoot = resolve(__dirname, "../../..");
    const tuiEntryPoint = resolve(packageRoot, "src/index.ts");

    // Determine working directory: global workspace by default, or current dir with --local
    const globalWorkspace = resolve(homedir(), ".0xkobold");
    const cwd = options.local ? process.cwd() : globalWorkspace;

    try {
      console.log(`🐉 Starting 0xKobold TUI (${options.local ? "local" : "global"} workspace)...\n`);

      const args = [tuiEntryPoint];

      // Add any custom extensions if provided
      if (options.extensions) {
        for (const ext of options.extensions) {
          args.push("--extension", ext);
        }
      }

      const child = spawn("bun", args, {
        stdio: "inherit",
        shell: true,
        // Always run from package root so extensions resolve correctly
        cwd: packageRoot,
        env: {
          ...process.env,
          // Set working directory for file operations (tools, etc.)
          // Config stays in default pi location (~/.pi/agent/)
          KOBOLD_WORKING_DIR: cwd,
        },
      });

      child.on("exit", (code) => {
        process.exit(code ?? 0);
      });

      child.on("error", (err) => {
        console.error("Failed to start TUI:", err.message);
        process.exit(1);
      });
    } catch (error) {
      console.error("Failed to start TUI:", error);
      process.exit(1);
    }
  });
