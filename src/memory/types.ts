/**
 * Memory Types
 * Shared types for memory architecture
 */

export type MemoryCategory = 
  | "decision" 
  | "fact" 
  | "task" 
  | "context" 
  | "error" 
  | "learning" 
  | "preference"
  | "greeting"  // Ephemeral - won't be stored
  | "filler";   // Ephemeral - won't be stored

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  timestamp: string;
  category: MemoryCategory;
  tags: string[];
  project?: string;
  importance: number;
  accessCount: number;
  lastAccessed: string;
  sessionId?: string;
  
  // New fields for tiered memory
  sourceResourceId?: string;  // Link to raw resource
  itemIds?: string[];          // Links to extracted items
  categoryId?: string;         // Parent category
}

export interface MemoryResource {
  id: string;
  sessionId: string;
  rawContent: string;
  timestamp: string;
  processed: boolean;
  extractedItems: string[];
}

export interface MemoryItem {
  id: string;
  resourceId: string;
  content: string;      // Atomic fact
  category: MemoryCategory;
  extractedAt: string;
  categoryId?: string;  // Which summary file
}

export interface TieredCategory {
  id: string;
  name: string;         // e.g., "user_preferences", "project_context"
  summary: string;      // Evolving markdown summary
  itemCount: number;
  lastUpdated: string;
  autoCondensed: boolean;
}

export interface MemoryCheckpoint {
  id: string;
  sessionId: string;
  stateData: string;    // Serialized JSON
  createdAt: string;
  
  // Metadata
  messageCount: number;
  memoryThreadId: string;
  conversationSummary?: string;
}

export interface MemoryConflict {
  id: string;
  itemAId: string;
  itemBId: string;
  itemAContent: string;
  itemBContent: string;
  detectedAt: string;
  detectedBy: "llm" | "rule" | "user";
  
  // Resolution
  resolvedAt?: string;
  resolution?: "keep_a" | "keep_b" | "merge" | "archive_both";
  resolutionNote?: string;
  resolvedBy?: string;
}

export interface MemoryAudit {
  totalMemories: number;
  byCategory: Record<MemoryCategory, number>;
  byDate: {
    last24h: number;
    lastWeek: number;
    lastMonth: number;
    older: number;
  };
  topTags: Array<{ tag: string; count: number }>;
  conflictsPending: number;
  memoriesLastAccessed: string[];
}