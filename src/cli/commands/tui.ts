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
  .option("-r, --remote <url>", "Connect to remote gateway instead of local (e.g., wss://vps.example.com:7777)")
  .option("--token <token>", "Authentication token for remote gateway")
  .action(async (options) => {
    // The main TUI entry point - check for source first (dev), then compiled (prod)
    const packageRoot = resolve(__dirname, "../../..");
    const devEntry = resolve(packageRoot, "src/index.ts");
    const prodEntry = resolve(packageRoot, "dist/src/index.js");
    
    // Use source if available (development), otherwise compiled (production/npm)
    const tuiEntryPoint = existsSync(devEntry) ? devEntry : prodEntry;
    const isCompiled = tuiEntryPoint === prodEntry;

    // Determine working directory: global workspace by default, or current dir with --local
    const globalWorkspace = resolve(homedir(), ".0xkobold");
    const cwd = options.local ? process.cwd() : globalWorkspace;

    // Remote gateway mode
    if (options.remote) {
      console.log(`🌐 Remote Gateway Mode: ${options.remote}`);
      console.log(`📁 Local Working Directory: ${cwd}`);
      console.log(`🧠 AI Processing: Remote (VPS)\n`);
    } else {
      console.log(`🐉 Starting 0xKobold TUI (${options.local ? "local" : "global"} workspace)...`);
      if (options.local) {
        console.log(`📁 Working in: ${cwd}\n`);
      } else {
        console.log(`📁 Global workspace: ${cwd}\n`);
      }
    }

    // Write context file for local mode tracking
    if (options.local || options.remote) {
      const contextFile = resolve(globalWorkspace, ".active-context");
      try {
        if (!existsSync(globalWorkspace)) {
          mkdirSync(globalWorkspace, { recursive: true });
        }
        writeFileSync(contextFile, JSON.stringify({
          workingDir: cwd,
          isLocal: options.local || !!options.remote,
          remoteGateway: options.remote || null,
          timestamp: Date.now(),
        }, null, 2));

        // Broadcast to local gateway if available (only in non-remote mode)
        if (!options.remote) {
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
      const args = [tuiEntryPoint];
      
      // Pass through --local flag if set (for the entry point to handle)
      if (options.local) {
        args.push("--local");
      }

      // Add any custom extensions if provided
      if (options.extensions) {
        for (const ext of options.extensions) {
          args.push("--extension", ext);
        }
      }

      // Use bun for .ts files, node for compiled .js files
      const runner = isCompiled ? "node" : "bun";
      
      if (isCompiled) {
        console.log(`[Using compiled entry point: ${tuiEntryPoint}]`);
      }

      const child = spawn(runner, args, {
        stdio: "inherit",
        shell: true,
        // Always run from package root so extensions resolve correctly
        cwd: packageRoot,
        env: {
          ...process.env,
          // Set working directory for file operations (tools, etc.)
          KOBOLD_WORKING_DIR: cwd,
          // Session identification
          KOBOLD_SESSION_TYPE: "tui",
          // Remote gateway configuration
          KOBOLD_REMOTE_GATEWAY: options.remote || "",
          KOBOLD_REMOTE_TOKEN: options.token || "",
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
