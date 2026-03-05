/**
 * Task Manager Extension
 *
 * Kanban-style task management with states:
 * - Backlog: Ideas and future work
 * - Needs Assignment: Ready to start but unassigned
 * - In Progress: Actively being worked on
 * - Needs Review: Completed, awaiting review
 * - Blocked: Stalled, needs human intervention
 * - Done: Completed and verified
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";
import { parseArgs, CommonArgs } from "../command-args.js";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const TASK_DB = join(KOBOLD_DIR, "tasks.db");

type TaskStatus =
  | "backlog"
  | "needs-assignment"
  | "in-progress"
  | "needs-review"
  | "blocked"
  | "done";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  sessionId?: string;
  parentId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata: Record<string, unknown>;
}

interface TaskComment {
  id: string;
  taskId: string;
  author: string;
  content: string;
  timestamp: number;
}

const TASK_COLUMNS: { id: TaskStatus; label: string; emoji: string; color: string }[] =
  [
    { id: "backlog", label: "Backlog", emoji: "📋", color: "gray" },
    { id: "needs-assignment", label: "Needs Assignment", emoji: "👤", color: "blue" },
    { id: "in-progress", label: "In Progress", emoji: "🏗️", color: "yellow" },
    { id: "needs-review", label: "Needs Review", emoji: "👀", color: "purple" },
    { id: "blocked", label: "Blocked", emoji: "🚫", color: "red" },
    { id: "done", label: "Done", emoji: "✅", color: "green" },
  ];

let db: Database | null = null;
let currentSessionId: string | null = null;

/**
 * Initialize task database
 */
function initDatabase(): Database {
  if (db) return db;

  if (!existsSync(KOBOLD_DIR)) {
    mkdirSync(KOBOLD_DIR, { recursive: true });
  }

  db = new Database(TASK_DB);
  db.run("PRAGMA journal_mode = WAL;");

  // Tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'medium',
      assignee TEXT,
      session_id TEXT,
      parent_id TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      metadata TEXT,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Task comments
  db.run(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Task history (status changes)
  db.run(`
    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT,
      timestamp INTEGER NOT NULL,
      note TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)`);

  console.log("[TaskManager] Database initialized");
  return db;
}

/**
 * Generate task ID
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Task Manager Extension
 */
export default function taskManagerExtension(pi: ExtensionAPI) {
  const database = initDatabase();

  // Track current session
  pi.on("session_start", async (_event, ctx) => {
    currentSessionId = process.env.KOBOLD_SESSION_ID || null;
  });

  /**
   * Create a new task
   */
  function createTask(
    title: string,
    description: string = "",
    options: Partial<Task> = {}
  ): Task {
    const id = generateTaskId();
    const now = Date.now();

    const task: Task = {
      id,
      title,
      description,
      status: options.status || "backlog",
      priority: options.priority || "medium",
      assignee: options.assignee,
      sessionId: options.sessionId || currentSessionId || undefined,
      parentId: options.parentId,
      tags: options.tags || [],
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata || {},
    };

// @ts-ignore SQLite binding
    database.run(
      `INSERT INTO tasks (id, title, description, status, priority, assignee, session_id, parent_id, tags, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.id,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.assignee || null,
      task.sessionId || null,
      task.parentId || null,
      JSON.stringify(task.tags),
      task.createdAt,
      task.updatedAt,
      JSON.stringify(task.metadata)]
    );

    // Log creation in history
// @ts-ignore SQLite binding
    database.run(
      `INSERT INTO task_history (id, task_id, from_status, to_status, changed_by, timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`hist-${Date.now()}`,
      task.id,
      null,
      task.status,
      currentSessionId || "system",
      now,
      "Task created"]
    );

    return task;
  }

  /**
   * Get task by ID
   */
  function getTask(id: string): Task | null {
// @ts-ignore SQLite binding
    const row = database.query("SELECT * FROM tasks WHERE id = ?").get([id]) as any;
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignee: row.assignee,
      sessionId: row.session_id,
      parentId: row.parent_id,
      tags: JSON.parse(String(row.tags || "[]")),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      metadata: JSON.parse(String(row.metadata || "{}")),
    };
  }

  /**
   * Update task status
   */
  function updateTaskStatus(
    id: string,
    newStatus: TaskStatus,
    note?: string
  ): boolean {
    const task = getTask(id);
    if (!task) return false;

    const oldStatus = task.status;
    const now = Date.now();

// @ts-ignore SQLite binding
    database.run(
      `UPDATE tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?`,
      [newStatus,
      now,
      newStatus === "done" ? now : task.completedAt || null,
      id]
    );

    // Log in history
// @ts-ignore SQLite binding
    database.run(
      `INSERT INTO task_history (id, task_id, from_status, to_status, changed_by, timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`hist-${Date.now()}`,
      id,
      oldStatus,
      newStatus,
      currentSessionId || "system",
      now,
      note || `Moved from ${oldStatus} to ${newStatus}`]
    );

    return true;
  }

  /**
   * Assign task
   */
  function assignTask(id: string, assignee: string): boolean {
    const task = getTask(id);
    if (!task) return false;

// @ts-ignore SQLite binding
    database.run(
      `UPDATE tasks SET assignee = ?, updated_at = ? WHERE id = ?`,
      [assignee,
      Date.now(),
      id]
    );

    // Also move to in-progress if in backlog
    if (task.status === "backlog" || task.status === "needs-assignment") {
      updateTaskStatus(id, "in-progress", `Assigned to ${assignee}`);
    }

    return true;
  }

  /**
   * List tasks by status
   */
  function listTasks(filter?: {
    status?: TaskStatus;
    sessionId?: string;
    assignee?: string;
    tags?: string[];
  }): Task[] {
    let query = "SELECT * FROM tasks WHERE 1=1";
    const params: (string | number)[] = [];

    if (filter?.status) {
      query += " AND status = ?";
      params.push(filter.status);
    }

    if (filter?.sessionId) {
      query += " AND session_id = ?";
      params.push(filter.sessionId);
    }

    if (filter?.assignee) {
      query += " AND assignee = ?";
      params.push(filter.assignee);
    }

    query += " ORDER BY priority DESC, updated_at DESC";

    const rows = database.query(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignee: row.assignee,
      sessionId: row.session_id,
      parentId: row.parent_id,
      tags: JSON.parse(String(row.tags || "[]")),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      metadata: JSON.parse(String(row.metadata || "{}")),
    }));
  }

  /**
   * Get task board (all columns)
   */
  function getBoard(): Record<TaskStatus, Task[]> {
    const board: Record<TaskStatus, Task[]> = {
      backlog: [],
      "needs-assignment": [],
      "in-progress": [],
      "needs-review": [],
      blocked: [],
      done: [],
    };

    const tasks = listTasks();
    for (const task of tasks) {
      board[task.status].push(task);
    }

    return board;
  }

  /**
   * Add comment to task
   */
  function addComment(taskId: string, content: string): boolean {
// @ts-ignore SQLite binding
    database.run(
      `INSERT INTO task_comments (id, task_id, author, content, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [`comment-${Date.now()}`,
      taskId,
      currentSessionId || "system",
      content,
      Date.now()]
    );
    return true;
  }

  /**
   * Get task comments
   */
  function getComments(taskId: string): TaskComment[] {
    const rows = database
      .query(
        `SELECT * FROM task_comments WHERE task_id = ? ORDER BY timestamp`
      )
      .all(taskId) as any[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      author: row.author,
      content: row.content,
      timestamp: row.timestamp,
    }));
  }

  // ═════════════════════════════════════════════════════════════════
  // COMMANDS
  // ═════════════════════════════════════════════════════════════════

  pi.registerCommand("task", {
    description: "Create a new task",
  // @ts-ignore Command args property
    args: [
      { name: "title", description: "Task title", required: true },
      { name: "description", description: "Task description", required: false },
    ],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        CommonArgs.title,
        CommonArgs.description,
      ]);
      const title = parsed.title;
      const description = parsed.description || "";

      if (!title) {
        ctx.ui?.notify?.("Usage: /task <title> [description]", "warning");
        return;
      }

      const task = createTask(title, description, {
        sessionId: currentSessionId || undefined,
      });

      ctx.ui?.notify?.(
        `✅ Created task: ${task.title}\nID: ${task.id.slice(0, 20)}...\nStatus: ${task.status}`,
        "success"
      );
    },
  });

  pi.registerCommand("tasks", {
    description: "Show task board",
    handler: async (_args, ctx) => {
      const board = getBoard();

      const lines: string[] = ["📋 Task Board\n"];

      for (const col of TASK_COLUMNS) {
        const tasks = board[col.id];
        lines.push(`${col.emoji} ${col.label} (${tasks.length})`);

        if (tasks.length === 0) {
          lines.push("   (empty)");
        } else {
          for (const task of tasks.slice(0, 5)) {
            const assignee = task.assignee ? ` @${task.assignee}` : "";
            const priority = task.priority === "critical" ? "🔴" : task.priority === "high" ? "🟡" : "";
            lines.push(`   ${priority} ${task.title.slice(0, 40)}${assignee}`);
          }
          if (tasks.length > 5) {
            lines.push(`   ... and ${tasks.length - 5} more`);
          }
        }
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("task-show", {
    description: "Show task details",
  // @ts-ignore Command args property
    args: [{ name: "id", description: "Task ID (or first few characters)", required: true }],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [CommonArgs.id]);
      const searchId = parsed.id;
      if (!searchId) {
        ctx.ui?.notify?.("Usage: /task-show <task-id>", "warning");
        return;
      }

      // Try exact match first, then prefix match
      let task = getTask(searchId);
      if (!task) {
        // Search by prefix
        const all = listTasks();
        task = all.find((t) => t.id.startsWith(searchId)) || null;
      }

      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${searchId}`, "error");
        return;
      }

      const col = TASK_COLUMNS.find((c) => c.id === task!.status);
      const comments = getComments(task.id);

      let details =
        `📝 ${task.title}\n` +
        `ID: ${task.id}\n` +
        `Status: ${col?.emoji} ${col?.label}\n` +
        `Priority: ${task.priority}\n` +
        `Assignee: ${task.assignee || "unassigned"}\n` +
        `Tags: ${task.tags.join(", ") || "none"}\n` +
        `Created: ${new Date(task.createdAt).toLocaleString()}\n\n` +
        `Description:\n${task.description || "(no description)"}`;

      if (comments.length > 0) {
        details += `\n\nComments (${comments.length}):`;
        for (const comment of comments.slice(-3)) {
          const time = new Date(comment.timestamp).toLocaleTimeString();
          details += `\n  [${time}] ${comment.content.slice(0, 60)}`;
        }
      }

      ctx.ui?.notify?.(details, "info");
    },
  });

  pi.registerCommand("task-move", {
    description: "Move task to a different column",
  // @ts-ignore Command args property
    args: [
      { name: "id", description: "Task ID", required: true },
      { name: "status", description: "New status (backlog|needs-assignment|in-progress|needs-review|blocked|done)", required: true },
    ],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "id", description: "Task ID", required: true },
        { name: "status", description: "New status", required: true },
      ]);
      const id = parsed.id!;
      const status = parsed.status!;
      const validStatuses: TaskStatus[] = [
        "backlog",
        "needs-assignment",
        "in-progress",
        "needs-review",
        "blocked",
        "done",
      ];

      if (!validStatuses.includes(status)) {
        ctx.ui?.notify?.(`Invalid status. Use: ${validStatuses.join(", ")}`, "error");
        return;
      }

      // Find task by prefix
      const all = listTasks();
      const task = all.find((t) => t.id.startsWith(id));

      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      updateTaskStatus(task.id, status as TaskStatus);
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Moved "${task.title.slice(0, 30)}..." to ${status}`, "success");
    },
  });

  pi.registerCommand("task-assign", {
    description: "Assign task to someone",
  // @ts-ignore Command args property
    args: [
      { name: "id", description: "Task ID", required: true },
      { name: "assignee", description: "Who to assign to", required: true },
    ],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "id", description: "Task ID", required: true },
        { name: "assignee", description: "Who to assign to", required: true },
      ]);
      const id = parsed.id!;
      const assignee = parsed.assignee!;

      const all = listTasks();
      const task = all.find((t) => t.id.startsWith(id));

      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      assignTask(task.id, assignee);
      ctx.ui?.notify?.(
        `Assigned "${task.title.slice(0, 30)}..." to ${assignee}`,
        "success"
      );
    },
  });

  pi.registerCommand("task-comment", {
    description: "Add comment to task",
  // @ts-ignore Command args property
    args: [
      { name: "id", description: "Task ID", required: true },
      { name: "content", description: "Comment text", required: true },
    ],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "id", description: "Task ID", required: true },
        { name: "content", description: "Comment text", required: true },
      ]);
      const id = parsed.id!;
      const content = parsed.content!;

      const all = listTasks();
      const task = all.find((t) => t.id.startsWith(id));

      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      addComment(task.id, content);
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Comment added to "${task.title.slice(0, 30)}..."`, "success");
    },
  });

  pi.registerCommand("task-delete", {
    description: "Delete a task",
  // @ts-ignore Command args property
    args: [{ name: "id", description: "Task ID", required: true }],
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [CommonArgs.id]);
      const id = parsed.id!;

      const all = listTasks();
      const task = all.find((t) => t.id.startsWith(id));

      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

// @ts-ignore SQLite binding
      database.run("DELETE FROM tasks WHERE id = ?", task.id);
      // @ts-ignore Notify type
      // @ts-ignore Notify type
      ctx.ui?.notify?.(`Deleted: ${task.title}`, "success");
    },
  });

  // ═════════════════════════════════════════════════════════════════
  // TOOLS
  // ═════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "task_breakdown",
    description: "Break down a request into subtasks and create them",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        request: { type: "string", description: "The original request" },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["request", "subtasks"],
    },
    async execute(args: any) {
      const { request, subtasks } = args as {
        request: string;
        subtasks: Array<{ title: string; description?: string; priority?: string }>;
      };

      const parentTask = createTask(request, "Auto-generated from breakdown", {
        status: "in-progress",
        sessionId: currentSessionId || undefined,
      });

      const created: Task[] = [];
      for (const st of subtasks) {
        const child = createTask(st.title, st.description || "", {
          parentId: parentTask.id,
          priority: (st.priority as any) || "medium",
          status: "backlog",
          sessionId: currentSessionId || undefined,
        });
        created.push(child);
      }

      return {
        content: [
          {
            type: "text",
            text: `Created ${created.length} subtasks for: ${request}\n\n${created
              .map((t) => `- ${t.title}`)
              .join("\n")}`,
          },
        ],
        details: {
          parentTask: parentTask.id,
          subtasks: created.map((t) => ({ id: t.id, title: t.title })),
        },
      };
    },
  });

  pi.registerTool({
    name: "task_list",
    description: "List tasks by status",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["backlog", "needs-assignment", "in-progress", "needs-review", "blocked", "done"],
        },
        limit: { type: "number", default: 20 },
      },
    },
    async execute(args: any) {
      const tasks = listTasks(
        args.status ? { status: args.status as TaskStatus } : undefined
      ).slice(0, (args.limit as number) || 20);

      return {
        content: [
          {
            type: "text",
            text:
              tasks.length === 0
                ? "No tasks found"
                : tasks.map((t) => `[${t.status}] ${t.title}`).join("\n"),
          },
        ],
        details: { count: tasks.length, tasks },
      };
    },
  });

  pi.registerTool({
    name: "task_update",
    description: "Update task status or assignee",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        status: {
          type: "string",
          enum: ["backlog", "needs-assignment", "in-progress", "needs-review", "blocked", "done"],
        },
        assignee: { type: "string" },
        note: { type: "string" },
      },
      required: ["taskId"],
    },
    async execute(args: any) {
      const { taskId, status, assignee, note } = args;

      const task = getTask(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: "Task not found" }],
          details: { error: "not_found", taskId },
        };
      }

      if (status) {
        updateTaskStatus(taskId, status as TaskStatus, note);
      }

      if (assignee) {
        assignTask(taskId, assignee);
      }

      return {
        content: [{ type: "text", text: `Updated task: ${task.title}` }],
        details: { taskId, status, assignee },
      };
    },
  });

  // Status bar item
  // @ts-ignore ExtensionAPI property
  pi.registerStatusBarItem("tasks", {
    render() {
      const counts = getBoard();
      const inProgress = counts["in-progress"].length;
      const blocked = counts["blocked"].length;

      if (blocked > 0) {
        return `🚫 ${blocked} blocked`;
      }
      if (inProgress > 0) {
        return `🏗️ ${inProgress} active`;
      }
      return "";
    },
  });

  console.log("[TaskManager] Extension loaded with Kanban workflow");
}
