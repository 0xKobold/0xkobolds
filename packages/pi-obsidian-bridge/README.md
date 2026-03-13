# 📓 Pi Obsidian Bridge

Obsidian vault integration for [pi-coding-agent](https://github.com/marioechler/pi-coding-agent).

Provides bidirectional sync between Obsidian vault tasks and your agent.

## Features

- 🏷️ **Tag-based discovery** - Finds tasks tagged `#kobold`
- 🔁 **Bidirectional sync** - Marks tasks complete back to Obsidian
- 📁 **Auto-vault creation** - Creates vault structure if not exists
- 🎯 **Standalone** - Works without 0xKobold framework
- 🔌 **Integrable** - Exposes bridge for scheduler integration

## Installation

```bash
# Via pi CLI
pi install npm:@0xkobold/pi-obsidian-bridge

# Or in pi-config.ts
extensions: ['npm:@0xkobold/pi-obsidian-bridge']
```

## Configuration

**Environment Variables:**
```bash
PI_OBSIDIAN_VAULT=~/.0xkobold/obsidian_vault  # Vault path (auto-created if not exists)
PI_OBSIDIAN_STORAGE=~/.0xkobold              # State storage
PI_OBSIDIAN_ENABLED=true                     # Enable/disable
PI_OBSIDIAN_TASKS_FILE=10-Action/Tasks.md  # Tasks file path
```

## Usage

### Standalone

```typescript
import { ObsidianBridge } from '@0xkobold/pi-obsidian-bridge';

const bridge = new ObsidianBridge({
  enabled: true,
  vaultPath: './my-vault',
  tasksFilePath: '10-Action/Tasks.md',
  storagePath: './.bridge-state',
});

await bridge.init();

// Poll for tasks
const tasks = await bridge.pollForTasks();
console.log(`Found ${tasks.length} tasks`);

// Get pending tasks
const pending = await bridge.getPendingTasks();

// Complete a task
await bridge.completeTask(tasks[0].id);
```

### With pi-coding-agent

```typescript
// Extension auto-registers tools:
// /obsidian_poll  - Poll for #kobold tasks
// /obsidian_tasks - List pending tasks  
// /obsidian_done  - Mark task complete
// /obsidian_status - Show bridge status

// Access bridge programmatically:
const bridge = (pi as any).obsidianBridge;

// Integrate with your scheduler
myScheduler.on('tick', () => {
  bridge.pollForTasks();
});
```

### With 0xKobold Heartbeat

In your Heartbeat.md, add:
```markdown
## Obsidian Integration

The Obsidian Bridge is available at runtime:

```typescript
const bridge = (pi as any).obsidianBridge;
if (bridge) {
  await bridge.pollForTasks();
}
```
```

## Vault Structure

Auto-created at `PI_OBSIDIAN_VAULT`:

```
obsidian_vault/
├── .obsidian/          # Config
├── 00-Inbox/          # New notes
├── 01-Projects/       # Projects
├── 10-Action/
│   └── Tasks.md       # #kobold tasks here
└── 90-Archive/        # Completed
```

## Task Format

In `10-Action/Tasks.md`:
```markdown
## Active

- [ ] Review code #kobold
- [ ] Deploy feature #kobold #urgent

## Archive
```

## API

### `ObsidianBridge`

| Method | Description |
|--------|-------------|
| `init()` | Initialize vault |
| `pollForTasks()` | Scan for #kobold tasks |
| `getPendingTasks()` | Get pending list |
| `markInProgress(id)` | Mark task active |
| `completeTask(id)` | Mark complete in Obsidian |
| `getStatus()` | Get bridge status |

## Standalone Example

```typescript
// minimal.ts - No pi-coding-agent needed
import { ObsidianBridge } from '@0xkobold/pi-obsidian-bridge';

const bridge = new ObsidianBridge({
  enabled: true,
  vaultPath: './vault',
  tasksFilePath: 'Tasks.md',
  storagePath: './.state',
});

await bridge.init();
setInterval(() => bridge.pollForTasks(), 60000);
```

## Links

- [GitHub](https://github.com/0xKobold/pi-obsidian-bridge)
- [Obsidian](https://obsidian.md)

## License

MIT