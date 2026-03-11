/**
 * 🐉 Community Extension Manager
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

const KOBOLD_DIR = path.join(homedir(), '.0xkobold');

const BUILTIN_EXTENSIONS = [
  'pi-subagents',
  'pi-messenger',
  'pi-web-access',
  'pi-memory-md',
  'pi-librarian',
  'pi-extmgr',
];

async function getManifest() {
  try {
    const manifestPath = path.join(KOBOLD_DIR, 'community-extensions.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { extensions: {} };
  }
}

export default async function register(pi: ExtensionAPI) {
  // Register /ext command
  pi.registerCommand("ext", {
    description: "Manage community extensions",
    async handler(_args: string, ctx: ExtensionContext) {
      const manifest = await getManifest();
      
      ctx.ui.notify("🐉 Community Extensions Manager", "info");
      console.log("Installed:", Object.keys(manifest.extensions || {}).join(", "));
      
      // Show which ones are loaded
      console.log("Built-in:", BUILTIN_EXTENSIONS.join(", "));
    },
  });
  
  console.log("[🐉 ExtensionManager] /ext command registered");
}
