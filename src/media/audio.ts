/**
 * Audio Transcription - v0.3.0
 * 
 * Speech-to-text using Whisper API or local inference.
 */

import OpenAI from "openai";
import * as fs from "node:fs/promises";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";

export interface AudioConfig {
  provider: "openai" | "local";
  apiKey?: string;
  model?: string;
  language?: string;
  responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
}

export interface TranscriptionResult {
  text: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
  duration?: number;
  confidence?: number;
}

export class AudioTranscriber {
  private config: AudioConfig;
  private openai?: OpenAI;

  constructor(config: AudioConfig) {
    this.config = {
      model: config.provider === "openai" ? "whisper-1" : "base",
      responseFormat: "json",
      ...config,
    };

    if (config.provider === "openai" && config.apiKey) {
      this.openai = new OpenAI({ apiKey: config.apiKey });
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribeFile(audioPath: string): Promise<TranscriptionResult> {
    if (this.config.provider === "openai") {
      return this.transcribeWithOpenAI(audioPath);
    }
    return this.transcribeLocal(audioPath);
  }

  /**
   * Transcribe audio buffer
   */
  async transcribeBuffer(audioBuffer: Buffer, filename = "audio.mp3"): Promise<TranscriptionResult> {
    // Save to temp file
    const tempPath = `/tmp/transcribe-${Date.now()}-${filename}`;
    await fs.writeFile(tempPath, audioBuffer);
    
    try {
      return await this.transcribeFile(tempPath);
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Transcribe with OpenAI Whisper
   */
  private async transcribeWithOpenAI(audioPath: string): Promise<TranscriptionResult> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized");
    }

    const file = await fs.openAsBlob(audioPath);
    
    const response = await this.openai.audio.transcriptions.create({
      file: file as any,
      model: this.config.model!,
      language: this.config.language,
      response_format: this.config.responseFormat as any,
    });

    const result: TranscriptionResult = {
      text: typeof response === "string" ? response : response.text,
      language: this.config.language,
    };

    // Parse verbose JSON if available
    if (typeof response === "object" && "segments" in response) {
      result.segments = (response as any).segments?.map((seg: any) => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text,
      }));
      result.duration = (response as any).duration;
    }

    return result;
  }

  /**
   * Local transcription (placeholder for future local Whisper)
   */
  private async transcribeLocal(audioPath: string): Promise<TranscriptionResult> {
    // Placeholder: would use local whisper.cpp or similar
    throw new Error("Local transcription not yet implemented. Use OpenAI provider.");
  }

  /**
   * Convert audio format using ffmpeg
   */
  async convertAudio(inputPath: string, outputFormat: "mp3" | "wav" | "ogg" = "mp3"): Promise<string> {
    const outputPath = inputPath.replace(/\.[^.]+$/, `.${outputFormat}`);
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-ar", "16000",
        "-ac", "1",
        "-f", outputFormat,
        outputPath,
      ]);

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on("error", (err) => {
        if (err.message.includes("ENOENT")) {
          reject(new Error("ffmpeg not found. Install ffmpeg to convert audio."));
        } else {
          reject(err);
        }
      });
    });
  }
}

// Helper functions
export async function transcribeAudio(
  audioPath: string,
  config: AudioConfig
): Promise<TranscriptionResult> {
  const transcriber = new AudioTranscriber(config);
  return transcriber.transcribeFile(audioPath);
}

export async function transcribeVoiceNote(
  audioPath: string,
  apiKey: string
): Promise<string> {
  const result = await transcribeAudio(audioPath, {
    provider: "openai",
    apiKey,
  });
  return result.text;
}
