import { Command } from "commander";
import { KoboldClient } from "../client.js";

const client = new KoboldClient();

const listCommand = new Command("list")
  .description("List all agents")
  .option("-t, --type <type>", "Filter by type")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running. Start it with: 0xkobold daemon start");
        process.exit(1);
      }

      const response = await client.send({
        type: "list_agents",
        agentType: options.type
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(response.agents, null, 2));
      } else {
        if (response.agents.length === 0) {
          console.log("No agents found");
          return;
        }

        console.log("Agents:");
        console.log("-".repeat(80));
        response.agents.forEach((agent: any) => {
          console.log(`ID:       ${agent.id}`);
          console.log(`Name:     ${agent.name}`);
          console.log(`Type:     ${agent.type}`);
          console.log(`Status:   ${agent.status || "active"}`);
          console.log(`Created:  ${agent.createdAt}`);
          console.log(`Last Active: ${agent.lastActive || "never"}`);
          console.log("-".repeat(80));
        });
      }
    } catch (error) {
      console.error("❌ Failed to list agents:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const createCommand = new Command("create")
  .description("Create a new agent")
  .argument("<name>", "Agent name")
  .option("-t, --type <type>", "Agent type", "assistant")
  .option("-d, --description <desc>", "Agent description")
  .option("-p, --personality <file>", "Personality configuration file")
  .option("--json", "Output as JSON")
  .action(async (name, options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running");
        process.exit(1);
      }

      const config: any = {
        name,
        type: options.type,
        description: options.description
      };

      if (options.personality) {
        const { readFileSync } = await import("node:fs");
        config.personality = readFileSync(options.personality, "utf-8");
      }

      const response = await client.send({
        type: "create_agent",
        config
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        console.log(`✓ Agent created: ${response.agentId}`);
        console.log(`  Name: ${name}`);
        console.log(`  Type: ${options.type}`);
      }
    } catch (error) {
      console.error("❌ Failed to create agent:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const infoCommand = new Command("info")
  .description("Get agent information")
  .argument("<id>", "Agent ID")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running");
        process.exit(1);
      }

      const response = await client.send({
        type: "get_agent",
        agentId: id
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(response.agent, null, 2));
      } else {
        const agent = response.agent;
        console.log("Agent Information:");
        console.log("-".repeat(50));
        console.log(`ID:          ${agent.id}`);
        console.log(`Name:        ${agent.name}`);
        console.log(`Type:        ${agent.type}`);
        console.log(`Description: ${agent.description || "N/A"}`);
        console.log(`Created:     ${agent.createdAt}`);
        console.log(`Last Active: ${agent.lastActive || "never"}`);
        console.log(`Status:      ${agent.status || "active"}`);
        console.log("-".repeat(50));
      }
    } catch (error) {
      console.error("❌ Failed to get agent info:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const deleteCommand = new Command("delete")
  .description("Delete an agent")
  .argument("<id>", "Agent ID")
  .option("-f, --force", "Force deletion without confirmation")
  .action(async (id, options) => {
    try {
      if (!options.force) {
        const { createInterface } = await import("node:readline");
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(`Delete agent ${id}? [y/N] `, resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== "y") {
          console.log("Cancelled");
          return;
        }
      }

      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running");
        process.exit(1);
      }

      const response = await client.send({
        type: "delete_agent",
        agentId: id
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      console.log(`✓ Agent ${id} deleted`);
    } catch (error) {
      console.error("❌ Failed to delete agent:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const configureCommand = new Command("configure")
  .description("Configure an agent")
  .argument("<id>", "Agent ID")
  .option("-n, --name <name>", "New name")
  .option("-d, --description <desc>", "New description")
  .option("-s, --status <status>", "Set status (active/inactive)")
  .action(async (id, options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running");
        process.exit(1);
      }

      const updates: any = {};
      if (options.name) updates.name = options.name;
      if (options.description) updates.description = options.description;
      if (options.status) updates.status = options.status;

      if (Object.keys(updates).length === 0) {
        console.log("No changes specified");
        return;
      }

      const response = await client.send({
        type: "update_agent",
        agentId: id,
        updates
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      console.log(`✓ Agent ${id} updated`);
    } catch (error) {
      console.error("❌ Failed to update agent:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

const spawnCommand = new Command("spawn")
  .description("Spawn an agent to perform a task")
  .requiredOption("-n, --name <name>", "Agent name")
  .requiredOption("-t, --task <task>", "Task description")
  .action(async (options) => {
    try {
      const connected = await client.connect();
      if (!connected) {
        console.error("❌ Daemon is not running. Start it with: 0xkobold daemon start");
        process.exit(1);
      }

      console.log(`🚀 Spawning agent "${options.name}" for task: ${options.task}`);

      const response = await client.send({
        type: "spawn_agent",
        name: options.name,
        task: options.task
      });

      if (response.error) {
        console.error("❌ Error:", response.error);
        process.exit(1);
      }

      console.log(`✓ Agent spawned successfully`);
      console.log(`  Agent ID: ${response.agentId}`);
      console.log(`  Task ID: ${response.taskId}`);
    } catch (error) {
      console.error("❌ Failed to spawn agent:", error);
      process.exit(1);
    } finally {
      client.disconnect();
    }
  });

export const agentCommand = new Command("agent")
  .description("Manage 0xKobold agents")
  .addCommand(listCommand)
  .addCommand(createCommand)
  .addCommand(infoCommand)
  .addCommand(deleteCommand)
  .addCommand(configureCommand)
  .addCommand(spawnCommand);
