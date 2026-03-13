/**
 * Context Graph Memory
 * 
 * Hybrid: Vector for discovery + Graph for precision
 * Best for: CRM, Research, ERC-8004 agent identity
 * 
 * Nodes: Agents, concepts, entities
 * Edges: Relationships (trusts, attests, has_skill, etc.)
 */

import { Database } from "bun:sqlite";

export interface GraphNode {
  id: string;
  type: "agent" | "concept" | "entity" | "skill" | "domain";
  label: string;
  properties: Record<string, any>;
  embedding?: number[];
  createdAt: string;
  accessCount: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  properties: Record<string, any>;
  weight: number;  // 0-1, computed from usage
  createdAt: string;
  lastAccessed: string;
}

export interface GraphConfig {
  // Discovery
  vectorSearchK: number;    // Top K for vector similarity
  edgeTraversalDepth: number;
  
  // Precision
  minEdgeWeight: number;     // 0-1
  maxResults: number;
}

const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  vectorSearchK: 10,
  edgeTraversalDepth: 2,
  minEdgeWeight: 0.3,
  maxResults: 20,
};

export class ContextGraph {
  private db: Database;
  private config: GraphConfig;

  constructor(db: Database, config?: Partial<GraphConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_GRAPH_CONFIG, ...config };
  }

  /**
   * Initialize graph schema
   */
  initSchema(): void {
    // Nodes
    this.db.run(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        properties TEXT,           -- JSON
        embedding BLOB,            -- Serialized float array
        created_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0
      )
    `);

    // Edges
    this.db.run(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        properties TEXT,           -- JSON
        weight REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        last_accessed TEXT,
        FOREIGN KEY (source_id) REFERENCES graph_nodes(id),
        FOREIGN KEY (target_id) REFERENCES graph_nodes(id)
      )
    `);

    // Full-text search for nodes
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS graph_nodes_fts
      USING fts5(id, label, content_rowid=rowid)
    `);

    // Triggers for FTS sync
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS graph_nodes_insert_fts
      AFTER INSERT ON graph_nodes BEGIN
        INSERT INTO graph_nodes_fts(rowid, label) VALUES (new.rowid, new.label);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS graph_nodes_delete_fts
      AFTER DELETE ON graph_nodes BEGIN
        DELETE FROM graph_nodes_fts WHERE rowid = old.rowid;
      END
    `);

    // Indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_edges_relation ON graph_edges(relation)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_edges_weight ON graph_edges(weight)`);

    console.log("[ContextGraph] Schema initialized");
  }

  /**
   * Add node
   */
  addNode(
    type: GraphNode["type"],
    label: string,
    properties: Record<string, any> = {},
    embedding?: number[]
  ): string {
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.db.query(`
      INSERT INTO graph_nodes (id, type, label, properties, embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      type,
      label,
      JSON.stringify(properties),
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
      new Date().toISOString()
    );

    return id;
  }

  /**
   * Add edge
   */
  addEdge(
    sourceId: string,
    targetId: string,
    relation: string,
    properties: Record<string, any> = {},
    weight = 1.0
  ): string {
    const id = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.db.query(`
      INSERT INTO graph_edges (id, source_id, target_id, relation, properties, weight, created_at, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sourceId,
      targetId,
      relation,
      JSON.stringify(properties),
      weight,
      new Date().toISOString(),
      new Date().toISOString()
    );

    return id;
  }

  /**
   * Hybrid search: Vector + Graph traversal
   */
  search(
    query: string,
    queryEmbedding: number[],
    options: {
      nodeTypes?: string[];
      relations?: string[];
      depth?: number;
    } = {}
  ): Array<{
    node: GraphNode;
    similarity: number;
    connectedNodes: Array<{ node: GraphNode; relation: string; weight: number }>;
  }> {
    const results = new Map<string, {
      node: GraphNode;
      similarity: number;
      connectedNodes: Array<{ node: GraphNode; relation: string; weight: number }>;
    }>();

    // Stage 1: Vector search (discovery)
    const vectorMatches = this.vectorSearch(queryEmbedding, options.nodeTypes);
    
    for (const match of vectorMatches) {
      const node = this.getNode(match.nodeId);
      if (node) {
        results.set(match.nodeId, {
          node,
          similarity: match.similarity,
          connectedNodes: [],
        });
      }
    }

    // Stage 2: Text search (backup)
    const textMatches = this.textSearch(query);
    
    for (const match of textMatches) {
      if (!results.has(match.id)) {
        const node = this.getNode(match.id);
        if (node) {
          results.set(match.id, {
            node,
            similarity: 0.7, // Base score for text match
            connectedNodes: [],
          });
        }
      }
    }

    // Stage 3: Graph traversal (precision)
    const depth = options.depth || this.config.edgeTraversalDepth;
    
    for (const [nodeId, result] of results) {
      // Traverse edges
      const connected = this.traverseEdges(nodeId, depth, options.relations);
      result.connectedNodes = connected.filter(c => 
        results.has(c.node.id) || // Prioritize nodes already in results
        c.weight >= this.config.minEdgeWeight
      ).slice(0, 5); // Top 5 connections

      // Update access count
      this.db.query(`UPDATE graph_nodes SET access_count = access_count + 1 WHERE id = ?`).run(nodeId);
    }

    // Sort by similarity + connectedness
    const sorted = Array.from(results.values()).sort((a, b) => {
      const connectedBonusA = a.connectedNodes.length * 0.1;
      const connectedBonusB = b.connectedNodes.length * 0.1;
      return (b.similarity + connectedBonusB) - (a.similarity + connectedBonusA);
    });

    return sorted.slice(0, this.config.maxResults);
  }

  /**
   * Get path between two nodes
   */
  getPath(sourceId: string, targetId: string, maxDepth = 5): {
    path: Array<{ node: GraphNode; edge: GraphEdge }>;
    totalWeight: number;
  } | null {
    // BFS for shortest path
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: Array<{ node: GraphNode; edge: GraphEdge }>; weight: number }> = [];
    
    const source = this.getNode(sourceId);
    if (!source) return null;

    queue.push({ nodeId: sourceId, path: [], weight: 1.0 });
    visited.add(sourceId);

    while (queue.length > 0) {
      const { nodeId, path, weight } = queue.shift()!;

      if (nodeId === targetId) {
        return { path, totalWeight: weight };
      }

      if (path.length >= maxDepth) continue;

      // Get outgoing edges
      const edges = this.db.query(`
        SELECT * FROM graph_edges WHERE source_id = ? ORDER BY weight DESC
      `).all(nodeId) as any[];

      for (const edge of edges) {
        if (visited.has(edge.target_id)) continue;
        
        visited.add(edge.target_id);
        const target = this.getNode(edge.target_id);
        
        if (target) {
          queue.push({
            nodeId: edge.target_id,
            path: [...path, { node: target, edge: this.rowToEdge(edge) }],
            weight: weight * (edge.weight || 1.0),
          });
        }
      }
    }

    return null;
  }

  /**
   * ERC-8004: Agent identity and trust
   */
  registerAgentIdentity(
    agentId: string,
    attributes: {
      publicKey?: string;
      domain?: string;
      skills?: string[];
      reputation?: number;
    }
  ): string {
    // Check if exists
    const existing = this.db.query(`SELECT id FROM graph_nodes WHERE properties LIKE ?`).get(`%"agentId":"${agentId}"%`) as any;
    
    if (existing) {
      // Update
      this.db.query(`UPDATE graph_nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify({ agentId, ...attributes }),
        existing.id
      );
      return existing.id;
    }

    // Create new
    return this.addNode("agent", `Agent ${agentId.slice(0, 8)}`, {
      agentId,
      ...attributes,
    });
  }

  /**
   * ERC-8004: Trust attestation
   */
  addTrustAttestation(
    sourceAgentId: string,
    targetAgentId: string,
    trustLevel: number,  // 0-1
    attestationId?: string
  ): string {
    // Find nodes
    const source = this.findAgentNode(sourceAgentId);
    const target = this.findAgentNode(targetAgentId);

    if (!source || !target) {
      throw new Error("Agent nodes not found");
    }

    return this.addEdge(source, target, "TRUSTS", {
      trustLevel,
      attestationId,
    }, trustLevel);
  }

  /**
   * ERC-8004: Skill attestation
   */
  addSkillAttestation(
    agentId: string,
    skillName: string,
    level: "novice" | "intermediate" | "expert",
    verifiedBy?: string
  ): { nodeId: string; edgeId: string } {
    // Find or create skill node
    let skillNode = this.db.query(`SELECT id FROM graph_nodes WHERE type = 'skill' AND label = ?`).get(skillName) as any;
    
    if (!skillNode) {
      skillNode = { id: this.addNode("skill", skillName, { category: "agent_skill" }) };
    }

    // Find agent
    const agentNode = this.findAgentNode(agentId);
    if (!agentNode) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Add HAS_SKILL edge
    const edgeId = this.addEdge(agentNode, skillNode.id, "HAS_SKILL", {
      level,
      verifiedBy,
    }, level === "expert" ? 1.0 : level === "intermediate" ? 0.7 : 0.4);

    return { nodeId: skillNode.id, edgeId };
  }

  /**
   * Update edge weights based on access patterns
   */
  async reweightEdges(): Promise<void> {
    // Increase weight for frequently traversed edges
    const edges = this.db.query(`
      SELECT * FROM graph_edges WHERE last_accessed > datetime('now', '-7 days')
    `).all() as any[];

    for (const edge of edges) {
      const newWeight = Math.min(1.0, edge.weight * 1.1); // 10% boost
      this.db.query(`UPDATE graph_edges SET weight = ? WHERE id = ?`).run(newWeight, edge.id);
    }

    // Decay old edges
    const oldEdges = this.db.query(`
      SELECT * FROM graph_edges WHERE last_accessed < datetime('now', '-30 days')
    `).all() as any[];

    for (const edge of oldEdges) {
      const newWeight = Math.max(0.1, edge.weight * 0.9); // 10% decay
      this.db.query(`UPDATE graph_edges SET weight = ? WHERE id = ?`).run(newWeight, edge.id);
    }
  }

  // Private helpers
  private vectorSearch(embedding: number[], nodeTypes?: string[]): Array<{ nodeId: string; similarity: number }> {
    const results: Array<{ nodeId: string; similarity: number }> = [];
    
    // Get all nodes with embeddings (limit for performance)
    const query = nodeTypes
      ? `SELECT id, embedding FROM graph_nodes WHERE type IN (${nodeTypes.map(() => '?').join(',')}) AND embedding IS NOT NULL`
      : `SELECT id, embedding FROM graph_nodes WHERE embedding IS NOT NULL`;
    
    const params = nodeTypes ? [...nodeTypes] : [];
    const rows = this.db.query(query).all(...params) as any[];

    for (const row of rows) {
      const nodeEmbedding = row.embedding 
        ? Array.from(new Float32Array(row.embedding.buffer || row.embedding))
        : [];
      const similarity = this.cosineSimilarity(embedding, nodeEmbedding);
      
      if (similarity > 0.5) { // Threshold
        results.push({ nodeId: row.id, similarity });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, this.config.vectorSearchK);
  }

  private textSearch(query: string): Array<{ id: string; score: number }> {
    const rows = this.db.query(`
      SELECT rowid, rank FROM graph_nodes_fts WHERE label MATCH ? LIMIT ?
    `).all(query, this.config.vectorSearchK) as any[];

    return rows.map(r => ({ id: r.rowid, score: r.rank }));
  }

  private traverseEdges(
    nodeId: string,
    depth: number,
    relations?: string[]
  ): Array<{ node: GraphNode; relation: string; weight: number }> {
    if (depth === 0) return [];

    const results: Array<{ node: GraphNode; relation: string; weight: number }> = [];
    
    const query = relations
      ? `SELECT * FROM graph_edges WHERE source_id = ? AND relation IN (${relations.map(() => '?').join(',')})`
      : `SELECT * FROM graph_edges WHERE source_id = ?`;
    
    const params = relations ? [nodeId, ...relations] : [nodeId];
    const edges = this.db.query(query).all(...params) as any[];

    for (const edge of edges) {
      const target = this.getNode(edge.target_id);
      if (target) {
        results.push({ node: target, relation: edge.relation, weight: edge.weight });
        
        // Recursive traversal
        if (depth > 1) {
          const deeper = this.traverseEdges(edge.target_id, depth - 1, relations);
          results.push(...deeper);
        }
      }

      // Update last_accessed
      this.db.query(`UPDATE graph_edges SET last_accessed = ? WHERE id = ?`)
        .run(new Date().toISOString(), edge.id);
    }

    return results;
  }

  private getNode(id: string): GraphNode | null {
    const row = this.db.query(`SELECT * FROM graph_nodes WHERE id = ?`).get(id) as any;
    
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      label: row.label,
      properties: JSON.parse(row.properties || '{}'),
      createdAt: row.created_at,
      accessCount: row.access_count,
    };
  }

  private findAgentNode(agentId: string): string | null {
    const row = this.db.query(`
      SELECT id FROM graph_nodes 
      WHERE type = 'agent' AND properties LIKE ?
    `).get(`%"agentId":"${agentId}"%`) as any;
    
    return row?.id || null;
  }

  private rowToEdge(row: any): GraphEdge {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relation: row.relation,
      properties: JSON.parse(row.properties || '{}'),
      weight: row.weight,
      createdAt: row.created_at,
      lastAccessed: row.last_accessed,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export { DEFAULT_GRAPH_CONFIG };