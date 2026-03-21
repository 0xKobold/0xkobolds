#!/usr/bin/env bun
/**
 * Migrate cron DB schema - adds notify columns
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";

const dbPath = join(homedir(), ".0xkobold", "cron.db");
console.log(`Checking ${dbPath}...`);

const db = new Database(dbPath);

// Check if columns exist
const columns = db.query("PRAGMA table_info(cron_jobs)").all() as any[];
const colNames = columns.map((c) => c.name);

console.log("Existing columns:", colNames.join(", "));

// Add missing columns
const missing = [];

if (!colNames.includes("stagger")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN stagger INTEGER DEFAULT 0");
  missing.push("stagger");
}

if (!colNames.includes("exact")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN exact INTEGER DEFAULT 0");
  missing.push("exact");
}

if (!colNames.includes("notify_channel")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN notify_channel TEXT");
  missing.push("notify_channel");
}

if (!colNames.includes("notify_recipient")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN notify_recipient TEXT");
  missing.push("notify_recipient");
}

if (!colNames.includes("notify_on_success")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN notify_on_success INTEGER DEFAULT 1");
  missing.push("notify_on_success");
}

if (!colNames.includes("notify_on_error")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN notify_on_error INTEGER DEFAULT 1");
  missing.push("notify_on_error");
}

if (!colNames.includes("notify_prefix")) {
  db.exec("ALTER TABLE cron_jobs ADD COLUMN notify_prefix TEXT");
  missing.push("notify_prefix");
}

if (missing.length === 0) {
  console.log("✅ Schema is up to date!");
} else {
  console.log(`✅ Added columns: ${missing.join(", ")}`);
}

db.close();
