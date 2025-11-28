import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Represents a clip to be extracted from a video
 */
export interface VideoClip {
  videoPath: string;
  startTime: number; // seconds
  endTime: number; // seconds
  outputPath?: string;
}

/**
 * FFmpeg wrapper for video processing operations
 */
export class FFmpegProcessor {
  private ffmpegPath: string;

  constructor(ffmpegPath?: string) {
    this.ffmpegPath = ffmpegPath ?? (config.ffmpegPath || 'ffmpeg');
  }

  /**
   * Checks if FFmpeg is available in the system
   * @returns True if FFmpeg is available
   */
  isAvailable(): boolean {
    try {
      execSync(`${this.ffmpegPath} -version`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the FFmpeg version string
   * @returns Version string or null if not available
   */
  getVersion(): string | null {
    try {
      const output = execSync(`${this.ffmpegPath} -version`, { encoding: 'utf-8' });
      const match = output.match(/ffmpeg version ([^\s]+)/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts a clip from a video file
   * @param clip - Clip specification
   * @param outputPath - Output file path
   * @returns Promise that resolves when extraction is complete
   */
  async extractClip(clip: VideoClip, outputPath: string): Promise<void> {
    const duration = clip.endTime - clip.startTime;

    const args = [
      '-y', // Overwrite output file
      '-ss',
      clip.startTime.toString(),
      '-i',
      clip.videoPath,
      '-t',
      duration.toString(),
      '-c',
      'copy', // Copy without re-encoding
      '-avoid_negative_ts',
      'make_zero',
      outputPath,
    ];

    await this.runFFmpeg(args);
  }

  /**
   * Concatenates multiple video clips into a single file
   * Uses the concat demuxer for fast concatenation without re-encoding
   * @param clipPaths - Array of paths to clip files
   * @param outputPath - Output file path
   */
  async concatenateClips(clipPaths: string[], outputPath: string): Promise<void> {
    // Create a temporary concat file
    const concatFilePath = path.join(path.dirname(outputPath), 'concat_list.txt');
    const concatContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');

    fs.writeFileSync(concatFilePath, concatContent, 'utf-8');

    try {
      const args = [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatFilePath,
        '-c',
        'copy',
        outputPath,
      ];

      await this.runFFmpeg(args);
    } finally {
      // Clean up concat file
      if (fs.existsSync(concatFilePath)) {
        fs.unlinkSync(concatFilePath);
      }
    }
  }

  /**
   * Concatenates clips with re-encoding (for incompatible formats)
   * @param clipPaths - Array of paths to clip files
   * @param outputPath - Output file path
   */
  async concatenateClipsWithReencode(clipPaths: string[], outputPath: string): Promise<void> {
    const concatFilePath = path.join(path.dirname(outputPath), 'concat_list.txt');
    const concatContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');

    fs.writeFileSync(concatFilePath, concatContent, 'utf-8');

    try {
      const args = [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatFilePath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        outputPath,
      ];

      await this.runFFmpeg(args);
    } finally {
      if (fs.existsSync(concatFilePath)) {
        fs.unlinkSync(concatFilePath);
      }
    }
  }

  /**
   * Removes audio from a video file
   * @param inputPath - Input video path
   * @param outputPath - Output video path
   */
  async removeAudio(inputPath: string, outputPath: string): Promise<void> {
    const args = ['-y', '-i', inputPath, '-c:v', 'copy', '-an', outputPath];

    await this.runFFmpeg(args);
  }

  /**
   * Mixes an audio track with a video file
   * @param videoPath - Input video path (can be muted)
   * @param audioPath - Audio file to mix
   * @param outputPath - Output video path
   */
  async mixAudioWithVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<void> {
    const args = [
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-shortest',
      outputPath,
    ];

    await this.runFFmpeg(args);
  }

  /**
   * Gets video duration in seconds
   * @param videoPath - Path to video file
   * @returns Duration in seconds
   */
  async getDuration(videoPath: string): Promise<number> {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ];

    const ffprobePath = this.ffmpegPath.replace('ffmpeg', 'ffprobe');
    const output = await this.runCommand(ffprobePath, args);
    const duration = parseFloat(output.trim());

    if (isNaN(duration)) {
      throw new Error(`Could not determine duration for ${videoPath}`);
    }

    return duration;
  }

  /**
   * Runs FFmpeg with the given arguments
   * @param args - Command line arguments
   * @returns Promise that resolves when command completes
   */
  private runFFmpeg(args: string[]): Promise<string> {
    return this.runCommand(this.ffmpegPath, args);
  }

  /**
   * Runs a command with the given arguments
   * @param command - Command to run
   * @param args - Command line arguments
   * @returns Promise that resolves with stdout when command completes
   */
  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        reject(new Error(`Failed to start command: ${err.message}`));
      });
    });
  }
}

/**
 * Processes a list of clips into a single output video
 * @param clips - Array of video clips to process
 * @param outputPath - Final output video path
 * @param workDir - Working directory for temporary files
 * @param ffmpeg - FFmpeg processor instance
 */
export async function processClipsToVideo(
  clips: VideoClip[],
  outputPath: string,
  workDir: string,
  ffmpeg: FFmpegProcessor = new FFmpegProcessor()
): Promise<void> {
  // Ensure work directory exists
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  // Extract individual clips
  const clipPaths: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (!clip) continue;

    const clipPath = path.join(workDir, `clip_${i.toString().padStart(4, '0')}.mp4`);
    clipPaths.push(clipPath);

    console.info(`Extracting clip ${i + 1}/${clips.length} from ${path.basename(clip.videoPath)}`);
    await ffmpeg.extractClip(clip, clipPath);
  }

  // Concatenate all clips
  console.info('Concatenating clips...');
  try {
    await ffmpeg.concatenateClips(clipPaths, outputPath);
  } catch {
    console.info('Fast concatenation failed, trying with re-encoding...');
    await ffmpeg.concatenateClipsWithReencode(clipPaths, outputPath);
  }

  // Clean up temporary clips
  for (const clipPath of clipPaths) {
    if (fs.existsSync(clipPath)) {
      fs.unlinkSync(clipPath);
    }
  }
}
