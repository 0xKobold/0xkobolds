# 0xKobold Mode Manager

The Mode Manager extension provides plan/build workflow switching with different system prompts and tool restrictions. It supports extensible custom modes for advanced users.

## Quick Start

### From TUI (Interactive)

```
/plan      - Switch to plan mode (investigation)
/build     - Switch to build mode (implementation)
/mode      - Show current mode
/modes     - List all available modes
Ctrl+M     - Quick toggle between plan/build
```

### From CLI

```bash
# Switch modes
0xkobold mode plan     # Investigation mode
0xkobold mode build    # Implementation mode

# Check current mode
0xkobold mode show
0xkobold mode list
```

## Modes

### 🔍 Plan Mode

**Purpose:** Investigation, analysis, and planning

**System Prompt:** Focus on understanding the codebase thoroughly before making changes. Ask clarifying questions. Create detailed plans.

**Available Tools:**
- `read_file` / `read_file_with_line_numbers` - Read code
- `search_files` - Find patterns in codebase
- `web_search` / `web_fetch` / `view_web_document` - Research
- `ask_user` - Ask clarifying questions
- `search_and_replace` - Find patterns (read-only)

**Blocked:** File editing, shell execution, write operations

### 🔨 Build Mode (Default)

**Purpose:** Implementation and execution

**System Prompt:** Focus on delivering working code. Be concise. Test changes. Handle errors gracefully.

**Available Tools:** All tools including:
- File read/write/modification
- Shell execution
- Code generation
- Web research

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+M` | Toggle between plan/build mode |
| `/plan` | Chat command for plan mode |
| `/build` | Chat command for build mode |

## Configuration

Mode settings are stored in `~/.0xkobold/modes.json`:

```json
{
  "currentMode": "build",
  "customModes": []
}
```

## Creating Custom Modes

Create an extension file (see `examples/extensions/custom-modes.ts`):

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function myModeExtension(pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Switch to code review mode",
    handler: async () => {
      // Implement mode switching logic
      pi.ui.notify?.("Review mode activated", "info");
    },
  });
}
```

Then load it:

```bash
0xkobold tui --extension ./my-custom-mode.ts
```

### Mode Structure

```typescript
interface Mode {
  id: string;              // Unique identifier
  name: string;            // Display name
  description: string;     // Short description
  icon: string;            // Emoji or symbol
  systemPrompt: string;    // Instructions for the AI
  allowedTools: string[];  // Tool whitelist
  color: string;           // UI color theme
}
```

## How It Works

1. **Extension Loading:** The mode-manager extension registers on session start
2. **Command Registration:** `/plan`, `/build`, `/mode`, `/modes` commands are registered
3. **System Prompt:** Current mode's prompt is injected into the conversation
4. **Tool Filtering:** Before tool calls, the extension checks if the tool is allowed in current mode
5. **Status Bar:** Current mode is displayed in the TUI footer (when supported)
6. **Persistence:** Mode selection is saved to `~/.0xkobold/modes.json`

## Workflows

### Plan → Build Workflow

1. Start in **plan mode** to investigate the codebase
2. Research existing patterns and architecture
3. Create a detailed implementation plan
4. Switch to **build mode** with `Ctrl+M` or `/build`
5. Implement the changes
6. Return to **plan mode** if you need to re-analyze

### Plan-Only Workflow

For sensitive codebases where you want review before any changes:

1. Restrict yourself to **plan mode** for initial analysis
2. Review plans with team
3. Approve specific files/tools for editing
4. Then switch to **build mode**

## Extending

### Add New Modes

Edit `~/.0xkobold/modes.json`:

```json
{
  "currentMode": "build",
  "customModes": [
    {
      "id": "docs",
      "name": "Document",
      "description": "Writing documentation",
      "icon": "📝",
      "systemPrompt": "Focus on clear documentation...",
      "allowedTools": [
        "read_file",
        "write_file",
        "edit_file",
        "web_search"
      ],
      "color": "cyan"
    }
  ]
}
```

### Tool Whitelist

Match tool names partially:
```javascript
allowedTools: [
  "read_file",      // Matches "read_file", "read_file_with_line_numbers"
  "web",           // Matches "web_search", "web_fetch"
]
```

## Troubleshooting

**Mode doesn't persist:**
- Check `~/.0xkobold/modes.json` exists and is writable
- Verify no syntax errors in JSON

**Tools not restricted:**
- Extension might not be loaded (check logs)
- Tool names in whitelist must match actual tool IDs

**Keyboard shortcut not working:**
- Might conflict with terminal settings
- Use `/plan` and `/build` commands instead

## Development

The mode manager extension is at `src/extensions/core/mode-manager-extension.ts`.

Features to add:
- [ ] Custom mode editor UI
- [ ] Per-project mode overrides
- [ ] Mode-specific tool configurations
- [ ] Mode transition hooks
- [ ] Mode-specific keybindings
