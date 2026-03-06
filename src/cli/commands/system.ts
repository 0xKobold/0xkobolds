/**
 * System Command
 * 
 * System service management (install, uninstall)
 */

import { Command } from "commander";
import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";

const SERVICE_NAME = "0xkobold";

export function createSystemCommand(): Command {
  const cmd = new Command("system")
    .description("System service management");

  cmd
    .command("install")
    .description("Install systemd service")
    .option("--user", "Install as user service (default)", true)
    .option("--system", "Install as system service (requires root)")
    .action(async (opts) => {
      await installService(opts.system);
    });

  cmd
    .command("uninstall")
    .description("Remove systemd service")
    .action(async () => {
      await uninstallService();
    });

  cmd
    .command("enable")
    .description("Enable auto-start on boot")
    .action(async () => {
      await runSystemctl("enable");
    });

  cmd
    .command("disable")
    .description("Disable auto-start")
    .action(async () => {
      await runSystemctl("disable");
    });

  return cmd;
}

async function installService(systemWide: boolean): Promise<void> {
  const serviceFile = generateServiceFile();
  
  let servicePath: string;
  if (systemWide) {
    servicePath = `/etc/systemd/system/${SERVICE_NAME}.service`;
    console.error("❌ System-wide installation requires root. Use --user (default) instead.");
    process.exit(1);
  } else {
    // User service
    const userDir = join(homedir(), ".config/systemd/user");
    if (!existsSync(userDir)) {
      mkdirSync(userDir, { recursive: true });
    }
    servicePath = join(userDir, `${SERVICE_NAME}.service`);
  }
  
  // Write service file
  writeFileSync(servicePath, serviceFile);
  console.log(`✅ Service file created: ${servicePath}`);
  
  // Reload systemd
  const proc = spawn("systemctl", ["--user", "daemon-reload"], {
    stdio: "inherit",
  });
  
  proc.on("close", (code) => {
    if (code === 0) {
      console.log("✅ Systemd configuration reloaded");
      console.log("\nNext steps:");
      console.log("  0xkobold start    # Start the service");
      console.log("  0xkobold status    # Check status");
    } else {
      console.error("❌ Failed to reload systemd");
    }
  });
}

async function uninstallService(): Promise<void> {
  const userDir = join(homedir(), ".config/systemd/user");
  const servicePath = join(userDir, `${SERVICE_NAME}.service`);
  
  if (!existsSync(servicePath)) {
    console.log("ℹ️ Service not installed");
    return;
  }
  
  // Stop if running
  await new Promise<void>((resolve) => {
    const proc = spawn("systemctl", ["--user", "stop", SERVICE_NAME]);
    proc.on("close", () => resolve());
  });
  
  // Remove service file
  unlinkSync(servicePath);
  console.log(`✅ Service file removed: ${servicePath}`);
  
  // Reload systemd
  const proc = spawn("systemctl", ["--user", "daemon-reload"], {
    stdio: "inherit",
  });
  
  proc.on("close", () => {
    console.log("✅ Service uninstalled");
  });
}

async function runSystemctl(action: string): Promise<void> {
  const proc = spawn("systemctl", ["--user", action, SERVICE_NAME], {
    stdio: "inherit",
  });
  
  proc.on("close", (code) => {
    if (code !== 0) {
      process.exit(1);
    }
  });
}

function generateServiceFile(): string {
  return `[Unit]
Description=0xKobold Gateway - Multi-Agent Platform
After=network-online.target

[Service]
Type=exec
ExecStart=%h/.bun/bin/bun run src/index.ts
WorkingDirectory=%h/Documents/code/0xKobolds
Restart=always
RestartSec=5
Environment="NODE_ENV=production"

[Install]
WantedBy=default.target
`;
}
