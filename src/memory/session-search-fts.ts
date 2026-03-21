/**
 * Session Search with FTS5 (Full-Text Search)
 * 
 * Hermes-style cross-session search with:
 * - FTS5 virtual tables for fast text search
 * - Cross-session search capability
 * - LLM summarization support
 * - Session lineage tracking
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = `${process.env.HOME || "~"}/.0xkobold/sessions.db`;

export interface SearchResult {
  sessionId: string;
  sessionKey: string;
  parentSessionId?: string;  // For lineage tracking
  title?: string;
  snippet: string;
  timestamp: number;
  rank: number;
  matchType: "content" | "title" | "summary";
}

export interface SessionLineage {
  sessionId: string;
  sessionKey: string;
  title?: string;
  parentId?: string;
  children: string[];
  createdAt: number;
  compressedAt?: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sessionIds?: string[];       // Limit to specific sessions
  minImportance?: number;
  dateRange?: { start: number; end: number };
  includeContent?: boolean;    // Include full content in results
  sessionType?: "all" | "current" | "archived";
}

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;

  mkdirSync(dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  
  // Create sessions table first (required for FTS5 external content)
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      rowid INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      session_key TEXT NOT NULL,
      content TEXT,
      title TEXT,
      summary TEXT,
      conversation_summary TEXT,
      skills_snapshot TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);
  
  // Create FTS5 virtual table for session content
  // Note: Using simple FTS5 without external content to avoid column issues
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      session_key,
      session_id,
      content,
      title,
      summary
    )
  `);
  
  // Create lineage tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS session_lineage (
      session_id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      parent_id TEXT,
      title TEXT,
      created_at INTEGER NOT NULL,
      compressed_at INTEGER,
      FOREIGN KEY (parent_id) REFERENCES session_lineage(session_id)
    )
  `);
  
  // Create index for lineage lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_lineage_parent 
    ON session_lineage(parent_id)
  `);
  
  return db;
}

/**
 * Initialize FTS5 tables and populate from existing sessions
 */
export function initFtsTables(): void {
  const db = getDb();
  
  // Populate FTS5 from existing sessions
  db.run(`
    INSERT OR REPLACE INTO sessions_fts(rowid, session_key, session_id, content, title, summary)
    SELECT 
      rowid,
      session_key,
      session_id,
      json_extract(skills_snapshot, '$.content') || ' ' || 
        COALESCE(conversation_summary, ''),
      NULL,
      conversation_summary
    FROM sessions
    WHERE conversation_summary IS NOT NULL 
       OR skills_snapshot IS NOT NULL
  `);
}

/**
 * Index session content for search
 */
export function indexSessionContent(
  sessionKey: string,
  sessionId: string,
  content: string,
  title?: string,
  summary?: string
): void {
  const db = getDb();
  
  db.run(`
    INSERT OR REPLACE INTO sessions_fts(session_key, session_id, content, title, summary)
    VALUES (?, ?, ?, ?, ?)
  `, [sessionKey, sessionId, content, title ?? null, summary ?? null]);
}

/**
 * Search across all sessions using FTS5
 */
export function searchSessions(query: string, options: SearchOptions = {}): SearchResult[] {
  const db = getDb();
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  
  // Sanitize query for FTS5
  const ftsQuery = query
    .replace(/['"]/g, '')
    .split(/\s+/)
    .map(term => `${term}*`)
    .join(' ');
  
  let sql = `
    SELECT 
      session_id,
      session_key,
      summary,
      title,
      bm25(sessions_fts) as rank
    FROM sessions_fts
    WHERE sessions_fts MATCH ?
  `;
  
  const params: (string | number)[] = [ftsQuery];
  
  // Note: sessionIds filter would need a join with sessions table
  // For now, we skip it in FTS query
  
  // Date range filter - skipped for FTS (would need separate tracking)
  
  sql += ` ORDER BY rank LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const rows = db.query(sql).all(...params) as Record<string, unknown>[];
  
  // Get lineage info and map results
  return rows.map(row => {
    const lineage = getSessionLineage(row.session_id as string);
    const parentSessionId = lineage.length > 1 ? lineage[0].sessionId : undefined;
    
    return {
      sessionId: row.session_id as string,
      sessionKey: row.session_key as string,
      parentSessionId,
      title: row.title as string | undefined,
      snippet: (row.summary as string)?.slice(0, 200) ?? '',
      timestamp: Date.now(),
      rank: row.rank as number,
      matchType: "content" as const,
    };
  });
}

/**
 * Get session lineage (parent chain)
 */
export function getSessionLineage(sessionId: string): SessionLineage[] {
  const db = getDb();
  
  // Get all ancestors
  const ancestors: SessionLineage[] = [];
  let currentId: string | undefined = sessionId;
  
  while (currentId) {
    const row = db.query(`
      SELECT session_id, session_key, parent_id, title, created_at, compressed_at
      FROM session_lineage
      WHERE session_id = ?
    `).get(currentId) as Record<string, unknown> | undefined;
    
    if (!row) break;
    
    ancestors.push({
      sessionId: row.session_id as string,
      sessionKey: row.session_key as string,
      parentId: row.parent_id as string | undefined,
      title: row.title as string | undefined,
      children: [],
      createdAt: row.created_at as number,
      compressedAt: row.compressed_at as number | undefined,
    });
    
    currentId = row.parent_id as string | undefined;
  }
  
  return ancestors.reverse();
}

/**
 * Get children of a session
 */
export function getSessionChildren(sessionId: string): SessionLineage[] {
  const db = getDb();
  
  const rows = db.query(`
    SELECT session_id, session_key, parent_id, title, created_at, compressed_at
    FROM session_lineage
    WHERE parent_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as Record<string, unknown>[];
  
  return rows.map(row => ({
    sessionId: row.session_id as string,
    sessionKey: row.session_key as string,
    parentId: row.parent_id as string | undefined,
    title: row.title as string | undefined,
    children: [],  // Can be populated recursively if needed
    createdAt: row.created_at as number,
    compressedAt: row.compressed_at as number | undefined,
  }));
}

/**
 * Register a session with lineage tracking
 */
export function registerSessionLineage(
  sessionId: string,
  sessionKey: string,
  parentId?: string,
  title?: string
): void {
  const db = getDb();
  
  db.run(`
    INSERT OR REPLACE INTO session_lineage(session_id, session_key, parent_id, title, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [sessionId, sessionKey, parentId ?? null, title ?? null, Date.now()]);
}

/**
 * Mark session as compressed (creates new lineage)
 */
export function markSessionCompressed(
  sessionId: string,
  compressedAt: number = Date.now()
): void {
  const db = getDb();
  
  db.run(`
    UPDATE session_lineage
    SET compressed_at = ?
    WHERE session_id = ?
  `, [compressedAt, sessionId]);
}

/**
 * Search with context from lineage
 */
export function searchWithLineageContext(
  query: string,
  currentSessionId: string,
  options: SearchOptions = {}
): { results: SearchResult[]; relatedSessions: SessionLineage[] } {
  // Get lineage for current session
  const lineage = getSessionLineage(currentSessionId);
  const lineageIds = lineage.map(l => l.sessionId);
  
  // Search with preference for related sessions
  const results = searchSessions(query, {
    ...options,
    sessionIds: options.sessionIds ?? lineageIds.length > 0 ? lineageIds : undefined,
  });
  
  return {
    results,
    relatedSessions: lineage,
  };
}

/**
 * Generate summary for cross-session recall (LLM-assisted)
 */
export function getSessionSummaryPrompt(sessionId: string): string {
  const lineage = getSessionLineage(sessionId);
  const recentSearches = searchSessions("", { limit: 5, sessionIds: [sessionId] });
  
  const lineageStr = lineage.map(l => 
    `${l.title ?? l.sessionKey} (${new Date(l.createdAt).toLocaleDateString()})`
  ).join(' → ');
  
  return `
# Session Context

## Current Session
Session: ${sessionId}
Lineage: ${lineageStr || 'None'}

## Recent Activity
${recentSearches.map(r => `- ${r.title ?? 'Untitled'}: ${r.snippet.slice(0, 100)}...`).join('\n')}

## Task
Based on this session context, provide relevant information for the current query.
`;
}

/**
 * Auto-title session based on content
 */
export function autoTitleSession(sessionId: string): string | null {
  const db = getDb();
  
  // Get session events for title generation
  const events = db.query(`
    SELECT content, type
    FROM session_events
    WHERE session_id = ?
    ORDER BY timestamp ASC
    LIMIT 10
  `).all(sessionId) as Record<string, unknown>[];
  
  if (events.length === 0) return null;
  
  // Simple heuristic: use first substantial content
  // Full LLM titling would be called from agent context
  for (const event of events) {
    const content = event.content as string;
    if (content.length > 20 && event.type === "thought") {
      // Take first line, limit to 50 chars
      const firstLine = content.split('\n')[0];
      const title = firstLine.slice(0, 50).trim();
      
      // Update lineage with title
      db.run(`
        UPDATE session_lineage SET title = ? WHERE session_id = ?
      `, [title, sessionId]);
      
      return title;
    }
  }
  
  return null;
}

export const sessionSearchFts = {
  init: initFtsTables,
  index: indexSessionContent,
  search: searchSessions,
  searchWithContext: searchWithLineageContext,
  getLineage: getSessionLineage,
  getChildren: getSessionChildren,
  register: registerSessionLineage,
  markCompressed: markSessionCompressed,
  autoTitle: autoTitleSession,
  getSummaryPrompt: getSessionSummaryPrompt,
};