/**
 * Handoff extension - transfer context to a new focused session
 *
 * Instead of compacting (which is lossy), handoff extracts what matters
 * for your next task and creates a new session with a generated prompt.
 *
 * Usage:
 *   User: /handoff <goal for new thread>
 *   Agent: request_handoff tool
 */

import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and the user's goal for a new thread, generate a focused prompt that:

1. Summarizes relevant context from the conversation (decisions made, approaches taken, key findings)
2. Lists any relevant files that were discussed or modified
3. Clearly states the next task based on the user's goal
4. Is self-contained - the new thread should be able to proceed without the old conversation

Format your response as a prompt the user can send to start the new thread. Be concise but include all necessary context. Do not include any preamble like "Here's the prompt" - just output the prompt itself.

Example output format:
## Context
We've been working on X. Key decisions:
- Decision 1
- Decision 2

Files involved:
- path/to/file1.ts
- path/to/file2.ts

## Task
[Clear description of what to do next based on user's goal]`;

// Helper to convert session entries to LLM messages
function convertToLlm(entries: any[]): Message[] {
    return entries
        .filter((e: any) => e.type === "message" && e.message)
        .map((e: any) => ({
            role: e.message.role,
            content: e.message.content || [],
            timestamp: e.message.timestamp || Date.now(),
        }));
}

// Helper to serialize conversation for the prompt
function serializeConversation(messages: Message[]): string {
    return messages
        .map((m) => {
            const role = m.role.toUpperCase();
            const content = Array.isArray(m.content)
                ? m.content.map((c: any) => (c.type === "text" ? c.text : "[image]")).join("\n")
                : String(m.content);
            return `${role}:\n${content}\n`;
        })
        .join("\n---\n\n");
}

export default function handoffExtension(pi: ExtensionAPI) {
    // ═══════════════════════════════════════════════════════════════
    // SHARED HANDOFF LOGIC
    // ═══════════════════════════════════════════════════════════════
    
    async function generateHandoffPrompt(goal: string, ctx: any): Promise<{ success: boolean; prompt?: string; error?: string }> {
        try {
            // Gather conversation context from current branch
            const branch = ctx.sessionManager.getBranch();
            const messages = branch
                .filter((entry: any) => entry.type === "message")
                .map((entry: any) => entry.message);

            if (messages.length === 0) {
                return { success: false, error: "No conversation to hand off" };
            }

            // Convert to LLM format and serialize
            const llmMessages = convertToLlm(branch);
            const conversationText = serializeConversation(llmMessages);

            // Generate the handoff prompt
            const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);

            const userMessage: Message = {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `## Conversation History\n\n${conversationText}\n\n## User's Goal for New Thread\n\n${goal}`,
                    },
                ],
                timestamp: Date.now(),
            };

            const response = await complete(
                ctx.model,
                { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
                { apiKey },
            );

            const result = response.content
                .filter((c): c is { type: "text"; text: string } => c.type === "text")
                .map((c) => c.text)
                .join("\n");

            return { success: true, prompt: result };
        } catch (err) {
            console.error("[Handoff] Generation failed:", err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // USER COMMANDS
    // ═══════════════════════════════════════════════════════════════
    
    pi.registerCommand("handoff", {
        description: "Transfer context to a new focused session",
        handler: async (args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify("handoff requires interactive mode", "error");
                return;
            }

            if (!ctx.model) {
                ctx.ui.notify("No model selected", "error");
                return;
            }

            const goal = args.trim();
            if (!goal) {
                ctx.ui.notify("Usage: /handoff <goal for new thread>", "error");
                return;
            }

            ctx.ui.setWorkingMessage("Generating handoff prompt...");
            
            const result = await generateHandoffPrompt(goal, ctx);
            
            ctx.ui.setWorkingMessage(); // Clear

            if (!result.success) {
                ctx.ui.notify(`Handoff failed: ${result.error}`, "error");
                return;
            }

            // Let user edit the generated prompt
            const editedPrompt = await ctx.ui.editor("Edit handoff prompt", result.prompt!);

            if (editedPrompt === undefined) {
                ctx.ui.notify("Cancelled", "info");
                return;
            }

            const currentSessionFile = ctx.sessionManager.getSessionFile?.() || "unknown";

            // Create new session with parent tracking
            const newSessionResult = await ctx.newSession({
                parentSession: currentSessionFile,
            });

            if (newSessionResult.cancelled) {
                ctx.ui.notify("New session cancelled", "info");
                return;
            }

            // Set the edited prompt in the main editor for submission
            ctx.ui.setEditorText(editedPrompt);
            ctx.ui.notify("Handoff ready. Submit when ready.", "info");
        },
    });

    // ═══════════════════════════════════════════════════════════════
    // AGENT TOOLS
    // ═══════════════════════════════════════════════════════════════

    // Tool: generate_handoff_prompt
    pi.registerTool({
        name: "generate_handoff_prompt",
        label: "generate_handoff_prompt",
        description: "Generate a handoff prompt that summarizes context for a new session. Use when you want to continue work in a focused session with extracted context.",
        // @ts-ignore TSchema mismatch
        parameters: {
            type: "object",
            properties: {
                goal: {
                    type: "string",
                    description: "What you want to do in the new session. Be specific.",
                },
            },
            required: ["goal"],
        },
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            if (!ctx.hasUI) {
                return {
                    content: [{ type: "text", text: "Error: handoff requires interactive mode" }],
                    details: { success: false },
                };
            }

            if (!ctx.model) {
                return {
                    content: [{ type: "text", text: "Error: No model selected" }],
                    details: { success: false },
                };
            }

            const { goal } = params as { goal: string };

            ctx.ui.setWorkingMessage("Generating handoff prompt...");
            
            const result = await generateHandoffPrompt(goal, ctx);
            
            ctx.ui.setWorkingMessage(); // Clear

            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Handoff generation failed: ${result.error}` }],
                    details: { success: false, error: result.error },
                };
            }

            // Show the user the prompt and ask if they want to create the session
            if (ctx.ui?.notify) {
                ctx.ui.notify(
                    `📝 Handoff Prompt Generated\n\nGoal: ${goal}\n\nPreview:\n${result.prompt?.slice(0, 200)}...\n\nThe prompt has been loaded in the editor. Edit and submit to create a new session.`,
                    "info"
                );
            }

            // Load it in the editor for review
            ctx.ui.setEditorText(result.prompt!);

            return {
                content: [{ 
                    type: "text", 
                    text: `Handoff prompt generated for: ${goal}\n\nThe prompt is now in the editor for your review. You can:\n- Edit it\n- Submit to create a new session with this context\n- Cancel if you want to continue here`,
                }],
                details: { 
                    success: true, 
                    goal,
                    prompt: result.prompt,
                    note: "Prompt is in the editor - review and submit to create the session",
                },
            };
        },
    });

    console.log("[Handoff] Extension loaded with commands + tools");
}
