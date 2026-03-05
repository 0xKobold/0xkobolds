import { Command } from "commander";
import { KoboldClient } from "../client.js";
import { createInterface } from "node:readline";

const client = new KoboldClient();

const sendCommand = new Command("send")
  .description("Send a message to the daemon")
  .argument("<message>", "Message to send")
  .option("-s, --session <id>", "Session ID")
  .option("-a, --agent <id>", "Agent ID to use")
  .option("--no-stream", "Disable streaming response")
  .action(async (message, options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running. Start it with: 0xkobold daemon start");
        process.exit(1);
      }

      const response = await client.send({
        type: "chat",
        content: message,
        sessionId: options.session,
        agentId: options.agent,
        stream: options.stream
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      console.log(response.content);
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const sessionCommand = new Command("session")
  .description("Manage chat sessions")
  .addCommand(
    new Command("list")
      .description("List active sessions")
      .action(async () => {
        try {
          const connected = await client.connect();
          if (!connected) {
            console.error("❌ Daemon is not running");
            process.exit(1);
          }

          const response = await client.send({
            type: "list_sessions"
          });

          if (response.error) {
            console.error("❌ Error:", response.error);
            process.exit(1);
          }

          if (response.sessions.length === 0) {
            console.log("No active sessions");
            return;
          }

          console.log("Active sessions:");
          response.sessions.forEach((session: any) => {
            console.log(`  ${session.id} - ${session.agent} (${session.startedAt})`);
          });
        } catch (error) {
          console.error("❌ Failed to list sessions:", error);
          process.exit(1);
        } finally {
          client.disconnect();
        }
      })
  )
  .addCommand(
    new Command("new")
      .description("Create a new session")
      .option("-a, --agent <id>", "Agent ID")
      .action(async (options) => {
        try {
          const connected = await client.connect();
          if (!connected) {
            console.error("❌ Daemon is not running");
            process.exit(1);
          }

          const response = await client.send({
            type: "create_session",
            agentId: options.agent
          });

          if (response.error) {
            console.error("❌ Error:", response.error);
            process.exit(1);
          }

          console.log(`✓ Session created: ${response.sessionId}`);
        } catch (error) {
          console.error("❌ Failed to create session:", error);
          process.exit(1);
        } finally {
          client.disconnect();
        }
      })
  );

const historyCommand = new Command("history")
  .description("View chat history")
  .option("-s, --session <id>", "Session ID")
  .option("-n, --limit <number>", "Limit number of messages", "20")
  .action(async (options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running");
        process.exit(1);
      }

      const response = await client.send({
        type: "get_history",
        sessionId: options.session,
        limit: parseInt(options.limit)
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      if (response.messages.length === 0) {
        console.log("No messages found");
        return;
      }

      response.messages.forEach((msg: any) => {
        const role = msg.role === "user" ? "You" : "Kobold";
        console.log(`\n[${role}]: ${msg.content}`);
      });
    } catch (error) {
      console.error("❌ Failed to get history:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const interactiveCommand = new Command("interactive")
  .description("Start interactive chat session")
  .option("-s, --session <id>", "Session ID")
  .option("-a, --agent <id>", "Agent ID")
  .action(async (options) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "🐲 > "
    });

    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running. Start it with: 0xkobold daemon start");
        rl.close();
        process.exit(1);
      }

      console.log("🐲 0xKobold Interactive Chat");
      console.log("Type 'exit' or 'quit' to exit\n");

      let sessionId = options.session;

      rl.prompt();

      rl.on("line", async (line) => {
        const input = line.trim();

        if (input === "exit" || input === "quit") {
          rl.close();
          return;
        }

        if (!input) {
          rl.prompt();
          return;
        }

        try {
          process.stdout.write("🐲 ... ");
          
          const response = await client.send({
            type: "chat",
            content: input,
            sessionId,
            agentId: options.agent
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
          console.error("❌ Failed:", error);
        }

        rl.prompt();
      });

      rl.on("close", () => {
        client.disconnect();
        console.log("\n👋 Goodbye!");
        process.exit(0);
      });

    } catch (error) {
      console.error("❌ Connection failed:", error);
      rl.close();
      process.exit(1);
    }
  });

export const chatCommand = new Command("chat")
  .description("Chat with 0xKobold")
  .argument("[message]", "Message to send")
  .option("-s, --session <id>", "Session ID")
  .option("-a, --agent <id>", "Agent ID")
  .option("-i, --interactive", "Start interactive mode")
  .action(async (message, options) => {
    if (options.interactive) {
      await interactiveCommand.parseAsync([]);
    } else if (message) {
      await sendCommand.parseAsync([message]);
    } else {
      console.log("Usage:");
      console.log("  0xkobold chat \"Hello!\"          Send a quick message");
      console.log("  0xkobold chat --interactive      Start interactive mode");
      console.log("  0xkobold chat send <message>     Send a message");
      console.log("  0xkobold chat session list         List sessions");
      console.log("  0xkobold chat history              View history");
      console.log("\nRun '0xkobold chat --help' for more options");
    }
  });

chatCommand.addCommand(sendCommand);
chatCommand.addCommand(sessionCommand);
chatCommand.addCommand(historyCommand);
chatCommand.addCommand(interactiveCommand);
