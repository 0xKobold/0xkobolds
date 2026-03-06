/**
 * Questionnaire Extension - Interactive user questions
 *
 * Provides question and questionnaire tools for getting user input:
 * - question: Single question with options
 * - questionnaire: Multiple questions with tab navigation
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// Option schema
const OptionSchema = Type.Object({
  label: Type.String({ description: "Display label for the option" }),
  description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
});

// Question tool params
const QuestionParams = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Array(OptionSchema, { description: "Options for the user to choose from" }),
});

// Questionnaire tool params
const QuestionnaireParams = Type.Object({
  questions: Type.Array(
    Type.Object({
      id: Type.String({ description: "Unique identifier for this question" }),
      label: Type.Optional(Type.String({ description: "Short label for display" })),
      prompt: Type.String({ description: "The full question text to display" }),
      options: Type.Array(OptionSchema, { description: "Available options to choose from" }),
      allowOther: Type.Optional(Type.Boolean({ description: "Allow 'Type something' option (default: true)" })),
    }),
    { description: "Questions to ask the user" }
  ),
});

export default function questionnaireExtension(pi: ExtensionAPI) {
  console.log("[Questionnaire] Extension loading...");
  
  try {
    // Single question tool
    console.log("[Questionnaire] Registering 'question' tool...");
    pi.registerTool({
    name: "question",
    label: "question",
    description: "Ask the user a single question with options. Use when you need user input to proceed.",
    parameters: QuestionParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Error: UI not available" }],
          details: { question: params.question, answer: null, wasCustom: false },
        };
      }

      const options = params.options.map((o) => o.label);
      const choice = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        let selected = 0;
        const allOptions = [...options, "Type something..."];

        return {
          render(width: number) {
            const lines: string[] = [];
            lines.push(theme.fg("accent", "─".repeat(width)));
            lines.push(` ${theme.fg("text", params.question)}`);
            lines.push("");

            allOptions.forEach((opt, i) => {
              const prefix = i === selected ? theme.fg("accent", "> ") : "  ";
              const text = i === selected ? theme.fg("accent", `${i + 1}. ${opt}`) : `${i + 1}. ${opt}`;
              lines.push(prefix + text);
            });

            lines.push("");
            lines.push(theme.fg("dim", " ↑↓ or j/k navigate • 1-9 select • Enter/Space confirm • Esc/q cancel"));
            lines.push(theme.fg("accent", "─".repeat(width)));
            return lines;
          },

          handleInput(data: string) {
            // Number keys 1-9 for direct selection
            const numMatch = data.match(/^[1-9]$/);
            if (numMatch) {
              const num = parseInt(data, 10) - 1;
              if (num >= 0 && num < allOptions.length) {
                if (num === allOptions.length - 1) {
                  // "Type something" selected
                  done("__custom__");
                } else {
                  done(options[num]);
                }
                return;
              }
            }

            if (data === "\x1b[A" || data === "k") {
              // Up or 'k' (vim style)
              selected = Math.max(0, selected - 1);
            } else if (data === "\x1b[B" || data === "j") {
              // Down or 'j' (vim style)
              selected = Math.min(allOptions.length - 1, selected + 1);
            } else if (data === "\r" || data === " ") {
              // Enter or Space to select
              if (selected === allOptions.length - 1) {
                done("__custom__");
              } else {
                done(options[selected]);
              }
            } else if (data === "\x1b" || data === "q") {
              // Escape or 'q' to cancel
              done(null);
            }
          },

          invalidate() {},
        };
      });

      if (choice === null) {
        return {
          content: [{ type: "text", text: "User cancelled" }],
          details: { question: params.question, answer: null, wasCustom: false },
        };
      }

      if (choice === "__custom__") {
        const custom = await ctx.ui.input("Your answer:");
        return {
          content: [{ type: "text", text: `User wrote: ${custom || "(no answer)"}` }],
          details: { question: params.question, answer: custom, wasCustom: true },
        };
      }

      return {
        content: [{ type: "text", text: `User selected: ${choice}` }],
        details: { question: params.question, answer: choice, wasCustom: false },
      };
    },
  });

    console.log("[Questionnaire] 'question' tool registered successfully");
  } catch (err) {
    console.error("[Questionnaire] Error registering 'question' tool:", err);
  }

  try {
    // Questionnaire tool for multiple questions
    console.log("[Questionnaire] Registering 'questionnaire' tool...");
    pi.registerTool({
    name: "questionnaire",
    label: "questionnaire",
    description: "Ask the user multiple questions. Use for clarifying requirements or getting multiple preferences.",
    parameters: QuestionnaireParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Error: UI not available" }],
          details: { questions: params.questions, answers: [], cancelled: true },
        };
      }

      const answers: { id: string; value: string; wasCustom: boolean }[] = [];

      for (const q of params.questions) {
        const options = q.options.map((o) => o.label);
        const allowOther = q.allowOther !== false;

        const choice = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
          let selected = 0;
          const allOptions = allowOther ? [...options, "Type something..."] : options;

          return {
            render(width: number) {
              const lines: string[] = [];
              lines.push(theme.fg("accent", "─".repeat(width)));
              lines.push(theme.fg("muted", ` Question ${answers.length + 1} of ${params.questions.length}`));
              lines.push(` ${theme.fg("text", q.prompt)}`);
              lines.push("");

              allOptions.forEach((opt, i) => {
                const prefix = i === selected ? theme.fg("accent", "> ") : "  ";
                const text = i === selected ? theme.fg("accent", `${i + 1}. ${opt}`) : `${i + 1}. ${opt}`;
                lines.push(prefix + text);
                const desc = q.options[i]?.description;
                if (desc) {
                  lines.push(`     ${theme.fg("muted", desc)}`);
                }
              });

              lines.push("");
              lines.push(theme.fg("dim", " ↑↓ or j/k navigate • 1-9 select • Enter/Space confirm • Esc/q cancel"));
              lines.push(theme.fg("accent", "─".repeat(width)));
              return lines;
            },

            handleInput(data: string) {
              // Number keys 1-9 for direct selection
              const numMatch = data.match(/^[1-9]$/);
              if (numMatch) {
                const num = parseInt(data, 10) - 1;
                if (num >= 0 && num < allOptions.length) {
                  if (allowOther && num === allOptions.length - 1) {
                    done("__custom__");
                  } else {
                    done(options[num]);
                  }
                  return;
                }
              }

              if (data === "\x1b[A" || data === "k") {
                // Up or 'k' (vim style)
                selected = Math.max(0, selected - 1);
              } else if (data === "\x1b[B" || data === "j") {
                // Down or 'j' (vim style)  
                selected = Math.min(allOptions.length - 1, selected + 1);
              } else if (data === "\r" || data === " ") {
                // Enter or Space to select
                if (allowOther && selected === allOptions.length - 1) {
                  done("__custom__");
                } else {
                  done(options[selected]);
                }
              } else if (data === "\x1b" || data === "q") {
                // Escape or 'q' to cancel
                done(null);
              }
            },

            invalidate() {},
          };
        });

        if (choice === null) {
          return {
            content: [{ type: "text", text: "User cancelled" }],
            details: { questions: params.questions, answers, cancelled: true },
          };
        }

        if (choice === "__custom__") {
          const custom = await ctx.ui.input(`Answer for: ${q.prompt}`);
          answers.push({ id: q.id, value: custom || "(no answer)", wasCustom: true });
        } else {
          answers.push({ id: q.id, value: choice, wasCustom: false });
        }
      }

      const summary = answers.map((a) => `${a.id}: ${a.value}`).join("\n");
      return {
        content: [{ type: "text", text: `Answers:\n${summary}` }],
        details: { questions: params.questions, answers, cancelled: false },
      };
    },
  });

    console.log("[Questionnaire] 'questionnaire' tool registered successfully");
  } catch (err) {
    console.error("[Questionnaire] Error registering 'questionnaire' tool:", err);
  }

  console.log("[Questionnaire] Extension loaded");
}
