import { Command } from "commander";
import { runEmbeddedAgent, initEmbeddedMode } from "../../agent/index.js";
import * as path from "path";

export function createEmbeddedCommand(): Command {
  const cmd = new Command("embedded");
  
  cmd
    .description("Run in embedded mode with custom system prompt")
    .option("-w, --workspace <dir>", "Workspace directory", process.cwd())
    .option("-m, --mode <mode>", "Mode: plan or build", "build")
    .argument("[prompt]", "Initial prompt")
    .action(async (prompt: string, options: any) => {
      const workspaceDir = path.resolve(options.workspace);
      
      console.log("🐉 0xKobold - Embedded Mode");
      console.log(`Workspace: ${workspaceDir}`);
      console.log(`Mode: ${options.mode}`);
      console.log("");

      // Initialize with bootstrap files
      await initEmbeddedMode(workspaceDir);
      
      if (prompt) {
        // Run with prompt
        const result = await runEmbeddedAgent({
          prompt,
          cwd: workspaceDir,
          workspaceDir,
          mode: options.mode,
        });
        
        console.log("\n" + result.text);
      } else {
        // Interactive mode would start here
        console.log("Bootstrap files ready. Start with: 0xkobold embedded 'your prompt'");
      }
    });

  return cmd;
}
