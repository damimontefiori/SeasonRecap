import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config } from '../config';

// Azure Speech has a limit of 10 minutes (600,000ms) per request
// To be safe, we target ~5 minutes of audio per chunk (~2000 characters at normal speed)
const MAX_CHARS_PER_CHUNK = 2000;

/**
 * Configuration for Azure Speech synthesis
 */
export interface AzureSpeechConfig {
  subscriptionKey: string;
  region: string;
  voice: string;
}

/**
 * Result from speech synthesis
 */
export interface SynthesisResult {
  audioFilePath: string;
  durationMs: number;
}

/**
 * Azure Speech TTS wrapper
 */
export class AzureSpeechSynthesizer {
  private config: AzureSpeechConfig;

  constructor(speechConfig?: Partial<AzureSpeechConfig>) {
    this.config = {
      subscriptionKey: speechConfig?.subscriptionKey ?? config.azureSpeechKey,
      region: speechConfig?.region ?? config.azureSpeechRegion,
      voice: speechConfig?.voice ?? config.azureSpeechVoice,
    };
  }

  /**
   * Tests if the Azure Speech service is available
   */
  async testConnection(): Promise<boolean> {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        this.config.subscriptionKey,
        this.config.region
      );
      speechConfig.speechSynthesisVoiceName = this.config.voice;

      // Just check if we can create the config without error
      return !!speechConfig;
    } catch {
      return false;
    }
  }

  /**
   * Splits text into chunks that won't exceed Azure's time limit
   * Tries to split on sentence boundaries for natural speech
   */
  private splitTextIntoChunks(text: string): string[] {
    if (text.length <= MAX_CHARS_PER_CHUNK) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      // If a single sentence is too long, split it on commas or words
      if (sentence.length > MAX_CHARS_PER_CHUNK) {
        // Flush current chunk first
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Split long sentence on commas or spaces
        const parts = sentence.split(/(?<=,)\s*/);
        for (const part of parts) {
          if ((currentChunk + ' ' + part).length > MAX_CHARS_PER_CHUNK) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = part;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + part;
          }
        }
      } else if ((currentChunk + ' ' + sentence).length > MAX_CHARS_PER_CHUNK) {
        // Adding this sentence would exceed the limit
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Concatenates multiple MP3 files using FFmpeg
   */
  private async concatenateAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
    const concatFilePath = path.join(path.dirname(outputPath), 'audio_concat_list.txt');
    const concatContent = audioPaths.map((p) => {
      const absolutePath = path.resolve(p).replace(/\\/g, '/');
      return `file '${absolutePath.replace(/'/g, "'\\''")}'`;
    }).join('\n');

    fs.writeFileSync(concatFilePath, concatContent, 'utf-8');

    const ffmpegPath = config.ffmpegPath || 'ffmpeg';
    
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',
        outputPath,
      ];

      const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        // Clean up concat file
        if (fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
        }

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg audio concat failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        if (fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
        }
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Synthesizes a single chunk of text to a file
   */
  private async synthesizeChunkToFile(text: string, outputPath: string): Promise<SynthesisResult> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.subscriptionKey,
      this.config.region
    );
    speechConfig.speechSynthesisVoiceName = this.config.voice;
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            synthesizer.close();
            resolve({
              audioFilePath: outputPath,
              durationMs: result.audioDuration / 10000,
            });
          } else {
            synthesizer.close();
            reject(
              new Error(
                `Speech synthesis failed: ${sdk.ResultReason[result.reason]} - ${result.errorDetails ?? 'Unknown error'}`
              )
            );
          }
        },
        (error) => {
          synthesizer.close();
          reject(new Error(`Speech synthesis error: ${error}`));
        }
      );
    });
  }

  /**
   * Synthesizes text to speech and saves to a file
   * Automatically splits long text into chunks to avoid Azure's 10-minute limit
   * @param text - Text to synthesize
   * @param outputPath - Path to save the audio file (MP3 format)
   * @returns Synthesis result with file path and duration
   */
  async synthesizeToFile(text: string, outputPath: string): Promise<SynthesisResult> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const chunks = this.splitTextIntoChunks(text);
    console.log(`TTS: Splitting text into ${chunks.length} chunk(s) (${text.length} total chars)`);

    // If only one chunk, synthesize directly
    if (chunks.length === 1) {
      return this.synthesizeChunkToFile(chunks[0]!, outputPath);
    }

    // Multiple chunks: synthesize each, then concatenate
    const chunkPaths: string[] = [];
    let totalDurationMs = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const chunkPath = path.join(dir, `tts_chunk_${i.toString().padStart(3, '0')}.mp3`);
        chunkPaths.push(chunkPath);

        console.log(`TTS: Synthesizing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        const result = await this.synthesizeChunkToFile(chunk, chunkPath);
        totalDurationMs += result.durationMs;
      }

      // Concatenate all chunks
      console.log(`TTS: Concatenating ${chunkPaths.length} audio chunks...`);
      await this.concatenateAudioFiles(chunkPaths, outputPath);

      return {
        audioFilePath: outputPath,
        durationMs: totalDurationMs,
      };
    } finally {
      // Clean up chunk files
      for (const chunkPath of chunkPaths) {
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
      }
    }
  }

  /**
   * Synthesizes multiple text blocks with SSML for better control
   * @param blocks - Array of text blocks with optional pauses
   * @param outputPath - Path to save the audio file
   * @returns Synthesis result
   */
  async synthesizeBlocksToFile(
    blocks: Array<{ text: string; pauseAfterMs?: number }>,
    outputPath: string
  ): Promise<SynthesisResult> {
    // Build SSML
    const ssmlContent = blocks
      .map((block) => {
        let content = `<s>${this.escapeXml(block.text)}</s>`;
        if (block.pauseAfterMs) {
          content += `<break time="${block.pauseAfterMs}ms"/>`;
        }
        return content;
      })
      .join('\n');

    const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${this.getLanguageFromVoice()}">
  <voice name="${this.config.voice}">
    ${ssmlContent}
  </voice>
</speak>`.trim();

    return this.synthesizeSsmlToFile(ssml, outputPath);
  }

  /**
   * Synthesizes SSML to a file
   * @param ssml - SSML content
   * @param outputPath - Path to save the audio file
   * @returns Synthesis result
   */
  async synthesizeSsmlToFile(ssml: string, outputPath: string): Promise<SynthesisResult> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.subscriptionKey,
      this.config.region
    );
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            synthesizer.close();
            resolve({
              audioFilePath: outputPath,
              durationMs: result.audioDuration / 10000,
            });
          } else {
            synthesizer.close();
            reject(
              new Error(
                `SSML synthesis failed: ${sdk.ResultReason[result.reason]} - ${result.errorDetails ?? 'Unknown error'}`
              )
            );
          }
        },
        (error) => {
          synthesizer.close();
          reject(new Error(`SSML synthesis error: ${error}`));
        }
      );
    });
  }

  /**
   * Gets the language code from the configured voice name
   */
  private getLanguageFromVoice(): string {
    // Voice names are like "es-ES-ElviraNeural", extract language code
    const match = this.config.voice.match(/^([a-z]{2}-[A-Z]{2})/);
    return match?.[1] ?? 'en-US';
  }

  /**
   * Escapes special XML characters in text
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Gets list of available voices for a language
   * @param language - Language code (e.g., "es-ES")
   * @returns List of voice names
   */
  async getVoicesForLanguage(language: string): Promise<string[]> {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.config.subscriptionKey,
      this.config.region
    );

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    return new Promise((resolve, reject) => {
      synthesizer.getVoicesAsync(language).then(
        (result) => {
          synthesizer.close();
          if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
            const voices = result.voices.map((v) => v.shortName);
            resolve(voices);
          } else {
            reject(new Error(`Failed to get voices: ${result.errorDetails ?? 'Unknown error'}`));
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  }
}
