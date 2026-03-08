/**
 * Extension Scaffold Extension
 *
 * Makes it easier to create new 0xKobold extensions by providing:
 * - Command to scaffold new extensions
 * - Template generators for common patterns
 * - Type helpers and utilities
 *
 * Usage:
 *   /ext-scaffold my-extension "A cool extension that does things"
 *   Creates: src/extensions/core/my-extension.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname, basename } from "path";

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═════════════════════════════════════════════════════════════════════════════

const EXTENSION_TEMPLATE = (name: string, description: string, author: string) => `/**
 * ${description}
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function ${toCamelCase(name)}Extension(pi: ExtensionAPI) {
    // ═════════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═════════════════════════════════════════════════════════════════════════
    
    const CONFIG = {
        // Add your configuration here
    };

    // ═════════════════════════════════════════════════════════════════════════
    // LIFECYCLE HOOKS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.on("session_start", async (event, ctx) => {
        console.log("[${name}] Session started:", event.name);
    });

    pi.on("session_end", async (event) => {
        console.log("[${name}] Session ended:", event.name);
    });

    pi.on("turn_start", async () => {
        // Called at the start of each turn
    });

    pi.on("turn_end", async () => {
        // Called at the end of each turn
    });

    // ═════════════════════════════════════════════════════════════════════════
    // USER COMMANDS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.registerCommand("${name}", {
        description: "${description}",
        handler: async (args, ctx) => {
            // Command implementation
            ctx.ui?.notify?.("Command executed!", "info");
        },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // AGENT TOOLS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.registerTool({
        name: "${name.replace(/-/g, "_")}_tool",
        label: "${name}_tool",
        description: "A tool provided by the ${name} extension",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {
                param1: {
                    type: "string",
                    description: "First parameter description",
                },
            },
            required: ["param1"],
        },
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const { param1 } = params as { param1: string };
            
            try {
                // Tool implementation
                const result = \`Processed: \${param1}\`;
                
                return {
                    content: [{ type: "text", text: result }],
                    details: { success: true, param1 },
                };
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: "text", text: \`Error: \${errorMsg}\` }],
                    details: { success: false, error: errorMsg },
                };
            }
        },
    });

    console.log("[${name}] Extension loaded - ${author}");
}
`;

const TOOL_ONLY_TEMPLATE = (name: string, description: string) => `/**
 * ${description}
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function ${toCamelCase(name)}Extension(pi: ExtensionAPI) {
    // ═════════════════════════════════════════════════════════════════════════
    // AGENT TOOLS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.registerTool({
        name: "${name.replace(/-/g, "_")}",
        label: "${name}",
        description: "${description}",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
            return {
                content: [{ type: "text", text: "Tool executed!" }],
                details: { success: true },
            };
        },
    });

    console.log("[${name}] Tool extension loaded");
}
`;

const COMMAND_ONLY_TEMPLATE = (name: string, description: string) => `/**
 * ${description}
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function ${toCamelCase(name)}Extension(pi: ExtensionAPI) {
    // ═════════════════════════════════════════════════════════════════════════
    // USER COMMANDS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.registerCommand("${name}", {
        description: "${description}",
        handler: async (args, ctx) => {
            ctx.ui?.notify?.("Command executed!", "info");
        },
    });

    console.log("[${name}] Command extension loaded");
}
`;

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

function toCamelCase(str: string): string {
    return str
        .replace(/[-_]+(.)?/g, (_, char) => char ? char.toUpperCase() : "")
        .replace(/^./, char => char.toLowerCase());
}

function toPascalCase(str: string): string {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function sanitizeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

// ═════════════════════════════════════════════════════════════════════════════
// EXTENSION LOADER
// ═════════════════════════════════════════════════════════════════════════════

export default function extensionScaffoldExtension(pi: ExtensionAPI) {
    
    // ═════════════════════════════════════════════════════════════════════════
    // COMMANDS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.registerCommand("ext-scaffold", {
        description: "Scaffold a new extension (usage: /ext-scaffold [name] [description] --type=full|tool|command)",
        handler: async (args, ctx) => {
            const parsed = parseArgs(args);
            const { name, description, type } = parsed;
            
            if (!name) {
                ctx.ui?.notify?.(
                    "Usage: /ext-scaffold [name] [description] [--type=full|tool|command]\n" +
                    "Examples:\n" +
                    "  /ext-scaffold my-tool \"Does something cool\"\n" +
                    "  /ext-scaffold my-cmd \"A command\" --type=command",
                    "warning"
                );
                return;
            }

            const safeName = sanitizeFilename(name);
            const safeDesc = description || `Extension: ${safeName}`;
            
            try {
                // Determine target directory
                // Try relative to current working directory first, then fall back
                const possiblePaths = [
                    resolve(process.cwd(), "src", "extensions", "core"),
                    resolve(__dirname), // Current directory
                    resolve(dirname(__dirname), "core"), // Parent extensions/core
                ];
                
                let targetDir = possiblePaths.find(p => existsSync(dirname(p)));
                if (!targetDir) {
                    targetDir = possiblePaths[1]!; // Fallback to current
                }
                
                const filePath = resolve(targetDir, `${safeName}-extension.ts`);
                
                if (existsSync(filePath)) {
                    ctx.ui?.notify?.(`Extension already exists: ${basename(filePath)}`, "warning");
                    return;
                }

                // Generate content based on type
                let content: string;
                const author = "0xKobold";
                
                switch (type) {
                    case "tool":
                        content = TOOL_ONLY_TEMPLATE(safeName, safeDesc);
                        break;
                    case "command":
                        content = COMMAND_ONLY_TEMPLATE(safeName, safeDesc);
                        break;
                    case "full":
                    default:
                        content = EXTENSION_TEMPLATE(safeName, safeDesc, author);
                        break;
                }

                // Write file
                writeFileSync(filePath, content, "utf-8");
                
                ctx.ui?.notify?.(
                    `✅ Created extension: ${basename(filePath)}\n` +
                    `   Location: ${filePath}\n` +
                    `   Type: ${type || "full"}\n\n` +
                    `   Next steps:\n` +
                    `   1. Edit the file to implement your extension\n` +
                    `   2. Restart 0xKobold to load it`,
                    "info"
                );
                
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                ctx.ui?.notify?.(`Error creating extension: ${errorMsg}`, "error");
            }
        },
    });

    pi.registerCommand("ext-list", {
        description: "List all built-in extensions",
        handler: async (_args, ctx) => {
            try {
                const { readdir } = await import("fs/promises");
                const coreDir = resolve(__dirname);
                const files = await readdir(coreDir);
                
                const extensions = files
                    .filter(f => f.endsWith("-extension.ts"))
                    .map(f => f.replace("-extension.ts", ""))
                    .sort();
                
                const list = extensions.map((ext, i) => `  ${i + 1}. ${ext}`).join("\n");
                
                ctx.ui?.notify?.(
                    `📦 Built-in Extensions (${extensions.length}):\n\n${list}`,
                    "info"
                );
                
            } catch (error) {
                ctx.ui?.notify?.("Failed to list extensions", "error");
            }
        },
    });

    pi.registerCommand("ext-help", {
        description: "Show extension development help",
        handler: async (_args, ctx) => {
            ctx.ui?.notify?.(
                "📚 Extension Development Quick Reference:\n\n" +
                "Commands:\n" +
                "  /ext-scaffold [name] [desc] [--type]  Create new extension\n" +
                "  /ext-list                            List built-in extensions\n" +
                "  /ext-help                            Show this help\n\n" +
                "Extension Types:\n" +
                "  --type=full    Full extension (commands + tools + hooks) [default]\n" +
                "  --type=tool    Tool-only extension\n" +
                "  --type=command Command-only extension\n\n" +
                "Lifecycle Hooks:\n" +
                "  pi.on('session_start', ... )  When session begins\n" +
                "  pi.on('session_end', ... )    When session ends\n" +
                "  pi.on('turn_start', ... )     When agent turn starts\n" +
                "  pi.on('turn_end', ... )       When agent turn ends\n\n" +
                "API:\n" +
                "  pi.registerCommand(name, { description, handler })\n" +
                "  pi.registerTool({ name, description, parameters, execute })\n" +
                "  pi.setSessionName(name), pi.getSessionName()\n" +
                "  ctx.ui.notify(message, type)",
                "info"
            );
        },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // AGENT TOOLS
    // ═════════════════════════════════════════════════════════════════════════
    
    pi.registerTool({
        name: "create_extension",
        label: "create_extension",
        description: "Create a new extension scaffold. Use this when the user wants to create a new extension or when they say they want to extend functionality in a modular way.",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Extension name (kebab-case, e.g., 'my-tool', 'image-processor')",
                },
                description: {
                    type: "string",
                    description: "Brief description of what the extension does",
                },
                type: {
                    type: "string",
                    enum: ["full", "tool", "command"],
                    description: "Extension template type",
                    default: "full",
                },
            },
            required: ["name", "description"],
        },
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const { name, description, type = "full" } = params as { 
                name: string; 
                description: string; 
                type?: "full" | "tool" | "command";
            };
            
            try {
                const safeName = sanitizeFilename(name);
                const coreDir = resolve(__dirname);
                const filePath = resolve(coreDir, `${safeName}-extension.ts`);
                
                if (existsSync(filePath)) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: `⚠️ Extension already exists: ${safeName}-extension.ts` 
                        }],
                        details: { success: false, exists: true, path: filePath },
                    };
                }

                // Select template
                let content: string;
                const author = "0xKobold";
                
                switch (type) {
                    case "tool":
                        content = TOOL_ONLY_TEMPLATE(safeName, description);
                        break;
                    case "command":
                        content = COMMAND_ONLY_TEMPLATE(safeName, description);
                        break;
                    default:
                        content = EXTENSION_TEMPLATE(safeName, description, author);
                }

                writeFileSync(filePath, content, "utf-8");
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `✅ Created ${type} extension: ${safeName}-extension.ts\n\n` +
                              `The extension has been scaffolded with:\n` +
                              (type === "full" ? 
                                  `  - Lifecycle hooks (session_start, session_end, etc.)\n` +
                                  `  - A command: /${safeName}\n` +
                                  `  - A tool: ${safeName.replace(/-/g, "_")}_tool\n` :
                               type === "tool" ?
                                  `  - A tool: ${safeName.replace(/-/g, "_")}\n` :
                                  `  - A command: /${safeName}\n`) +
                              `\nFile location: ${filePath}\n\n` +
                              `Next steps:\n` +
                              `1. Edit the file to implement your logic\n` +
                              `2. Restart 0xKobold to load the extension`
                    }],
                    details: { 
                        success: true, 
                        name: safeName, 
                        type, 
                        path: filePath 
                    },
                };
                
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: "text", text: `❌ Error: ${errorMsg}` }],
                    details: { success: false, error: errorMsg },
                };
            }
        },
    });

    pi.registerTool({
        name: "list_extensions",
        label: "list_extensions",
        description: "List all available built-in extensions. Use this when the user wants to see what extensions are available.",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {},
        },
        async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
            try {
                const { readdir, readFile } = await import("fs/promises");
                const coreDir = resolve(__dirname);
                const files = await readdir(coreDir);
                
                const extensions = await Promise.all(
                    files
                        .filter(f => f.endsWith("-extension.ts"))
                        .map(async f => {
                            const content = await readFile(resolve(coreDir, f), "utf-8");
                            const descMatch = content.match(/\\*\\s*([^\\n]+(?:does|provides|handles)[^\\n]*)/i);
                            return {
                                name: f.replace("-extension.ts", ""),
                                filename: f,
                                description: descMatch ? descMatch[1].trim() : "No description",
                            };
                        })
                );
                
                const sorted = extensions.sort((a, b) => a.name.localeCompare(b.name));
                const list = sorted.map(e => `  • ${e.name}: ${e.description}`).join("\n");
                
                return {
                    content: [{ 
                        type: "text", 
                        text: `📦 Available Extensions (${sorted.length}):\n\n${list}` 
                    }],
                    details: { success: true, count: sorted.length, extensions: sorted },
                };
                
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: "text", text: `❌ Error: ${errorMsg}` }],
                    details: { success: false, error: errorMsg },
                };
            }
        },
    });

    console.log("[ExtensionScaffold] Extension loaded - /ext-scaffold, /ext-list, /ext-help");
}

// ═════════════════════════════════════════════════════════════════════════════
// ARGUMENT PARSER
// ═════════════════════════════════════════════════════════════════════════════

function parseArgs(input: string): { name: string; description: string; type: "full" | "tool" | "command"; } {
    const parts = input.trim().split(/\\s+/);
    
    // Find type flag
    const typeIndex = parts.findIndex(p => p.startsWith("--type="));
    let type: "full" | "tool" | "command" = "full";
    if (typeIndex !== -1) {
        const typeValue = parts[typeIndex].replace("--type=", "").toLowerCase();
        if (["full", "tool", "command"].includes(typeValue)) {
            type = typeValue as "full" | "tool" | "command";
        }
        parts.splice(typeIndex, 1);
    }
    
    // First non-flag is name
    const name = parts[0] || "";
    
    // Everything else before type flag is description
    const description = parts.slice(1).join(" ") || "";
    
    return { name, description, type };
}
