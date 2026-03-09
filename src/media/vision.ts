/**
 * Vision/Image Support - v0.3.0
 * 
 * Image analysis using Claude Vision or GPT-4V.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs/promises";
import { Buffer } from "node:buffer";

export interface VisionConfig {
  provider: "claude" | "openai";
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface ImageAnalysisResult {
  description: string;
  objects: string[];
  text?: string;
  confidence: number;
  rawResponse: unknown;
}

export class VisionAnalyzer {
  private config: VisionConfig;
  private anthropic?: Anthropic;

  constructor(config: VisionConfig) {
    this.config = {
      model: config.provider === "claude" ? "claude-3-opus-20240229" : "gpt-4-vision-preview",
      maxTokens: 4000,
      ...config,
    };

    if (config.provider === "claude") {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
    }
  }

  /**
   * Analyze image file
   */
  async analyzeImage(imagePath: string, prompt: string = "Describe this image."): Promise<ImageAnalysisResult> {
    const imageBuffer = await fs.readFile(imagePath);
    return this.analyzeBuffer(imageBuffer, prompt);
  }

  /**
   * Analyze image from URL
   */
  async analyzeUrl(imageUrl: string, prompt: string = "Describe this image."): Promise<ImageAnalysisResult> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    return this.analyzeBuffer(imageBuffer, prompt);
  }

  /**
   * Analyze image buffer
   */
  async analyzeBuffer(imageBuffer: Buffer, prompt: string): Promise<ImageAnalysisResult> {
    if (this.config.provider === "claude") {
      return this.analyzeWithClaude(imageBuffer, prompt);
    }
    throw new Error(`Provider ${this.config.provider} not yet implemented`);
  }

  /**
   * Analyze with Claude
   */
  private async analyzeWithClaude(imageBuffer: Buffer, prompt: string): Promise<ImageAnalysisResult> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized");
    }

    const base64Image = imageBuffer.toString("base64");
    const mediaType = this.detectMediaType(imageBuffer);

    const response = await this.anthropic.messages.create({
      model: this.config.model!,
      max_tokens: this.config.maxTokens!,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    // Parse structured response
    return {
      description: content.text,
      objects: this.extractObjects(content.text),
      text: this.extractTextContent(content.text),
      confidence: 0.95, // Claude doesn't provide explicit confidence
      rawResponse: response,
    };
  }

  /**
   * Detect media type from buffer
   */
  private detectMediaType(buffer: Buffer): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
    if (buffer[8] === 0x57 && buffer[9] === 0x45) return "image/webp";
    return "image/jpeg"; // default
  }

  /**
   * Extract objects from description
   */
  private extractObjects(description: string): string[] {
    const commonObjects = [
      "person", "people", "face", "car", "building", "tree", "animal",
      "food", "furniture", "text", "logo", "sign", "nature", "indoor"
    ];
    return commonObjects.filter(obj => 
      description.toLowerCase().includes(obj)
    );
  }

  /**
   * Extract text content
   */
  private extractTextContent(description: string): string | undefined {
    const textMatch = description.match(/["']([^"']+)["']/);
    return textMatch?.[1];
  }
}

// Helper function
export async function analyzeImage(
  imagePath: string,
  config: VisionConfig,
  prompt?: string
): Promise<ImageAnalysisResult> {
  const analyzer = new VisionAnalyzer(config);
  return analyzer.analyzeImage(imagePath, prompt);
}
