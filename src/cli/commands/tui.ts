import { Command } from "commander";
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";

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

    // Write context file ONLY when using --local mode
    // This prevents regular runs from showing wrong directory
    if (options.local) {
      const contextFile = resolve(globalWorkspace, ".active-context");
      try {
        if (!existsSync(globalWorkspace)) {
          mkdirSync(globalWorkspace, { recursive: true });
        }
        writeFileSync(contextFile, JSON.stringify({
          workingDir: cwd,
          isLocal: true,
          timestamp: Date.now(),
        }, null, 2));

        // Broadcast to gateway if available
        try {
          await fetch("http://127.0.0.1:18789/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "tui.context_changed",
              workingDir: cwd,
              isLocal: true,
            }),
          });
        } catch {
          // Gateway not running, ignore
        }
      } catch {
        // Ignore write errors
      }
    } else {
      // Clear any stale local context when running in global mode
      const contextFile = resolve(globalWorkspace, ".active-context");
      try {
        if (existsSync(contextFile)) {
          unlinkSync(contextFile);
        }
      } catch {
        // Ignore errors
      }
    }

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
