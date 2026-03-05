import { createInterface } from "node:readline";
import { KoboldClient } from "./client.js";

const client = new KoboldClient();

const COMMANDS: Record<string, { description: string; handler: (args: string[]) => Promise<void> }> = {
  help: {
    description: "Show this help message",
    handler: async () => {
      console.log("\nAvailable commands:");
      console.log("-".repeat(40));
      Object.entries(COMMANDS).forEach(([cmd, info]) => {
        console.log(`  ${cmd.padEnd(12)} ${info.description}`);
      });
      console.log("\nOr just type a message to chat with Kobold");
    }
  },
  quit: {
    description: "Exit the REPL",
    handler: async () => {
      console.log("\n👋 Goodbye!");
      process.exit(0);
    }
  },
  exit: {
    description: "Exit the REPL",
    handler: async () => {
      console.log("\n👋 Goodbye!");
      process.exit(0);
    }
  },
  clear: {
    description: "Clear the screen",
    handler: async () => {
      console.clear();
    }
  },
  status: {
    description: "Check daemon status",
    handler: async () => {
      const connected = await client.connect();
      if (connected) {
        const health = await client.health();
        if (health) {
          console.log(`✓ Daemon is running`);
          console.log(`  Version: ${health.version}`);
          console.log(`  Uptime: ${Math.floor(health.uptime / 60)}m ${health.uptime % 60}s`);
          console.log(`  Status: ${health.status}`);
        } else {
          console.log("✓ Connected to daemon");
        }
      } else {
        console.log("✗ Daemon is not running");
        console.log("  Start it with: 0xkobold daemon start");
      }
    }
  },
  agents: {
    description: "List all agents",
    handler: async () => {
      const connected = await client.connect();
      if (!connected) {
        console.log("❌ Daemon is not running");
        return;
      }

      const response = await client.send({ type: "list_agents" });
      if (response.error) {
        console.error("❌ Error:", response.error);
      } else if (response.agents.length === 0) {
        console.log("No agents found");
      } else {
        console.log("\nAgents:");
        response.agents.forEach((agent: any) => {
          console.log(`  ${agent.id}: ${agent.name} (${agent.type})`);
        });
      }
    }
  },
  sessions: {
    description: "List active sessions",
    handler: async () => {
      const connected = await client.connect();
      if (!connected) {
        console.log("❌ Daemon is not running");
        return;
      }

      const response = await client.send({ type: "list_sessions" });
      if (response.error) {
        console.error("❌ Error:", response.error);
      } else if (response.sessions.length === 0) {
        console.log("No active sessions");
      } else {
        console.log("\nActive sessions:");
        response.sessions.forEach((session: any) => {
          console.log(`  ${session.id} - ${session.agent}`);
        });
      }
    }
  }
};

export async function startRepl(): Promise<void> {
  console.log("🐲 Welcome to 0xKobold Interactive Mode");
  console.log("Type 'help' for available commands or just chat away!\n");

  const connected = await client.connect();
  if (!connected) {
    console.log("⚠️  Warning: Daemon is not running");
    console.log("   Some features will be unavailable");
    console.log("   Start it with: 0xkobold daemon start\n");
  } else {
    console.log("✓ Connected to daemon\n");
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "🐲 > ",
    completer: (line: string) => {
      const hits = Object.keys(COMMANDS).filter((c) => c.startsWith(line));
      return [hits.length ? hits : Object.keys(COMMANDS), line];
    }
  });

  let sessionId: string | undefined;

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    const [command, ...args] = input.split(" ");

    if (COMMANDS[command]) {
      try {
        await COMMANDS[command].handler(args);
      } catch (error) {
        console.error("❌ Error:", error);
      }
    } else {
      const connected = await client.connect();
      if (!connected) {
        console.log("❌ Daemon is not running. Cannot send message.");
      } else {
        try {
          process.stdout.write("🐲 ... ");
          
          const response = await client.send({
            type: "chat",
            content: input,
            sessionId
          });

          process.stdout.write("\r       \r");

          if (response.error) {
            console.error("❌ Error:", response.error);
          } else {
            console.log(response.content);
            if (response.sessionId && !sessionId) {
              sessionId = response.sessionId;
            }
          }
        } catch (error) {
          process.stdout.write("\r       \r");
          console.error("❌ Failed to send message:", error);
        }
      }
    }

    rl.prompt();
  });

  rl.on("close", () => {
    client.disconnect();
    console.log("\n👋 Goodbye!");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    rl.close();
  });
}
