/**
 * Block Streaming - v0.2.0
 * 
 * Response streaming with block chunking and human-like pacing.
 * Part of Phase 5.1: Response Streaming
 */

import { EventEmitter } from "events";

export interface Block {
  type: "text" | "code" | "tool" | "thinking" | "final";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface StreamConfig {
  minDelayMs: number;
  maxDelayMs: number;
  blockSeparator: string;
  enablePacing: boolean;
  chunkSize: number;
}

class BlockStreamer extends EventEmitter {
  private config: StreamConfig;
  private buffer: string = "";
  private blocks: Block[] = [];
  private streaming = false;

  constructor(config: Partial<StreamConfig> = {}) {
    super();
    this.config = {
      minDelayMs: 50,
      maxDelayMs: 300,
      blockSeparator: "\n\n",
      enablePacing: true,
      chunkSize: 100,
      ...config,
    };
  }

  /**
   * Feed content to stream
   */
  feed(content: string): void {
    this.buffer += content;
    this.processBuffer();
  }

  /**
   * Process buffer into blocks
   */
  private processBuffer(): void {
    // Split by separator
    const parts = this.buffer.split(this.config.blockSeparator);
    
    // Keep last part in buffer (may be incomplete)
    this.buffer = parts.pop() || "";

    // Process complete blocks
    for (const part of parts) {
      if (part.trim()) {
        const block = this.parseBlock(part);
        this.blocks.push(block);
        this.emit("block", block);
      }
    }
  }

  /**
   * Parse raw text into typed block
   */
  private parseBlock(text: string): Block {
    // Detect code blocks
    if (text.startsWith("```")) {
      return {
        type: "code",
        content: text,
      };
    }

    // Detect tool calls
    if (text.includes("< tool") || text.includes("<tool")) {
      return {
        type: "tool",
        content: text,
      };
    }

    // Detect thinking blocks
    if (text.includes("<thinking>") || text.includes("< thinking >")) {
      return {
        type: "thinking",
        content: text,
      };
    }

    // Detect final blocks
    if (text.includes("<final>") || text.includes("< final >")) {
      return {
        type: "final",
        content: text,
      };
    }

    return {
      type: "text",
      content: text,
    };
  }

  /**
   * Start streaming with pacing
   */
  async start(): Promise<void> {
    if (this.streaming) return;
    this.streaming = true;

    this.emit("start");

    // Process any remaining buffer
    if (this.buffer.trim()) {
      const block = this.parseBlock(this.buffer);
      this.blocks.push(block);
      this.emit("block", block);
      this.buffer = "";
    }

    // Stream blocks with pacing
    if (this.config.enablePacing) {
      for (const block of this.blocks) {
        await this.streamBlock(block);
      }
    }

    this.emit("end");
    this.streaming = false;
  }

  /**
   * Stream a single block with human-like delays
   */
  private async streamBlock(block: Block): Promise<void> {
    const chars = block.content.length;
    const estimatedReadTime = chars * 20; // 20ms per char
    const delay = Math.min(
      this.config.maxDelayMs,
      Math.max(this.config.minDelayMs, estimatedReadTime)
    );

    // Emit with delay for natural pacing
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.emit("ready", block);
  }

  /**
   * Flush remaining content
   */
  flush(): Block[] {
    this.processBuffer();
    if (this.buffer.trim()) {
      const block = this.parseBlock(this.buffer);
      this.blocks.push(block);
      this.buffer = "";
    }
    return [...this.blocks];
  }

  /**
   * Get all blocks
   */
  getBlocks(): Block[] {
    return [...this.blocks];
  }

  /**
   * Clear streamer
   */
  clear(): void {
    this.buffer = "";
    this.blocks = [];
    this.streaming = false;
  }
}

/**
 * Create streamer
 */
export function createStreamer(config?: Partial<StreamConfig>): BlockStreamer {
  return new BlockStreamer(config);
}

/**
 * Chunk text into manageable pieces
 */
export function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Calculate human-like reading delay
 */
export function calculateDelay(text: string, wpm = 200): number {
  const words = text.split(/\\s+/).length;
  const minutes = words / wpm;
  return Math.max(500, minutes * 60 * 1000); // At least 500ms
}

export default createStreamer;
