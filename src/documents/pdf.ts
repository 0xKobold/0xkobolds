/**
 * PDF Document Support - v0.3.0
 * 
 * Text extraction from PDF documents.
 */

import * as fs from "node:fs/promises";
import { Buffer } from "node:buffer";

export interface PDFConfig {
  maxPages?: number;
  extractText: boolean;
  extractMetadata: boolean;
}

export interface PDFExtractionResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
    pageCount?: number;
  };
  pages: Array<{
    pageNumber: number;
    text: string;
  }>;
}

class PDFExtractor {
  private config: PDFConfig;

  constructor(config: Partial<PDFConfig> = {}) {
    this.config = {
      maxPages: 100,
      extractText: true,
      extractMetadata: true,
      ...config,
    };
  }

  /**
   * Extract from file
   */
  async extractFromFile(filePath: string): Promise<PDFExtractionResult> {
    const buffer = await fs.readFile(filePath);
    return this.extractFromBuffer(buffer);
  }

  /**
   * Extract from buffer
   */
  async extractFromBuffer(buffer: Buffer): Promise<PDFExtractionResult> {
    // PDF magic number check
    if (buffer.slice(0, 5).toString() !== "%PDF-") {
      throw new Error("Invalid PDF file");
    }

    // Parse basic PDF structure
    const result: PDFExtractionResult = {
      text: "",
      metadata: {},
      pages: [],
    };

    // Extract text using regex (basic implementation)
    // In production, use pdf-parse or pdf-lib
    const textContent = this.extractTextFromPDF(buffer);
    
    result.text = textContent;
    result.pages = [{
      pageNumber: 1,
      text: textContent.slice(0, 5000), // First page preview
    }];

    // Extract metadata
    if (this.config.extractMetadata) {
      result.metadata = this.extractMetadata(buffer);
    }

    return result;
  }

  /**
   * Extract text using basic PDF parsing
   */
  private extractTextFromPDF(buffer: Buffer): string {
    const content = buffer.toString("latin1");
    
    // Find text streams (BT ... ET)
    const textRegex = /BT\s*((?:(?!ET).|\s)*)\s*ET/g;
    const matches = content.match(textRegex) || [];
    
    const extractedTexts: string[] = [];
    
    for (const match of matches) {
      // Extract Tj and TJ operands
      const text = match
        .replace(/BT|ET/g, "")
        .replace(/\[[^\]]*\]TJ/g, (m) => {
          // Handle TJ arrays
          const inner = m.slice(1, -3);
          return inner
            .split(" ")
            .filter((_, i) => i % 2 === 0)
            .join("");
        })
        .replace(/\([^)]*\)Tj/g, (m) => {
          // Handle Tj strings
          return m.slice(1, -3);
        })
        .replace(/\d+\.?\d*\s+\d+\.?\d*\s+Td/g, " ") // Position operators
        .replace(/\d+\.?\d*\s+TL/g, " ") // Line operators
        .replace(/\s+/g, " ")
        .trim();
      
      if (text) extractedTexts.push(text);
    }

    // Also try obj streams
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(content)) !== null) {
      const stream = streamMatch[1];
      // Check if it looks like text
      if (stream.includes("(") && stream.includes("Tj")) {
        const text = stream
          .replace(/\([^)]*\)Tj/g, (m) => m.slice(1, -3))
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 3) extractedTexts.push(text);
      }
    }

    return extractedTexts.join("\n").slice(0, 50000); // Limit output
  }

  /**
   * Extract metadata
   */
  private extractMetadata(buffer: Buffer): PDFExtractionResult["metadata"] {
    const content = buffer.toString("latin1");
    const metadata: PDFExtractionResult["metadata"] = {};

    // Title
    const titleMatch = content.match(/\/Title\s*\(([^)]+)\)/);
    if (titleMatch) metadata.title = this.unescapePDFString(titleMatch[1]);

    // Author
    const authorMatch = content.match(/\/Author\s*\(([^)]+)\)/);
    if (authorMatch) metadata.author = this.unescapePDFString(authorMatch[1]);

    // Subject
    const subjectMatch = content.match(/\/Subject\s*\(([^)]+)\)/);
    if (subjectMatch) metadata.subject = this.unescapePDFString(subjectMatch[1]);

    // Creator
    const creatorMatch = content.match(/\/Creator\s*\(([^)]+)\)/);
    if (creatorMatch) metadata.creator = this.unescapePDFString(creatorMatch[1]);

    // Producer
    const producerMatch = content.match(/\/Producer\s*\(([^)]+)\)/);
    if (producerMatch) metadata.producer = this.unescapePDFString(producerMatch[1]);

    // Page count
    const pagesMatch = content.match(/\/Count\s+(\d+)/);
    if (pagesMatch) metadata.pageCount = parseInt(pagesMatch[1], 10);

    // Keywords  
    const keywordsMatch = content.match(/\/Keywords\s*\(([^)]+)\)/);
    if (keywordsMatch) metadata.keywords = this.unescapePDFString(keywordsMatch[1]);

    return metadata;
  }

  /**
   * Unescape PDF string
   */
  private unescapePDFString(str: string): string {
    return str
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")");
  }

  /**
   * Get PDF info
   */
  async getInfo(filePath: string): Promise<PDFExtractionResult["metadata"]> {
    const buffer = await fs.readFile(filePath);
    return this.extractMetadata(buffer);
  }
}

// Helper functions
export async function extractPDF(
  filePath: string,
  config?: Partial<PDFConfig>
): Promise<PDFExtractionResult> {
  const extractor = new PDFExtractor(config);
  return extractor.extractFromFile(filePath);
}

export async function extractPDFText(filePath: string): Promise<string> {
  const result = await extractPDF(filePath, { extractMetadata: false });
  return result.text;
}

export { PDFExtractor };
export default PDFExtractor;
