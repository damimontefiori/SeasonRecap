import fs from 'fs';
import path from 'path';
import { Job, ClipSpec, targetLengthToMinutes } from '../jobs/types';
import { jobStore, JobStore } from '../jobs/jobStore';
import { parseSrtFile, EpisodeSubtitles, extractEpisodeIdFromFilename, generateSrtContent } from '../subtitles';
import {
  remapSubtitlesToClips,
  generateNarrativeSubtitles,
  ClipDefinition,
} from '../subtitles/subtitleUtils';
import { createLLMProvider, KeyMoment, SummarizationInput } from '../llm';
import { FFmpegProcessor, processClipsToVideo, VideoClip } from '../video';
import { AzureSpeechSynthesizer } from '../tts';
import { config } from '../config';

/**
 * Main pipeline for processing season summary jobs
 */
export class SummaryPipeline {
  private store: JobStore;
  private ffmpeg: FFmpegProcessor;

  constructor(store?: JobStore) {
    this.store = store ?? jobStore;
    this.ffmpeg = new FFmpegProcessor();
  }

  /**
   * Runs the complete pipeline for a job
   */
  async run(jobId: string): Promise<void> {
    const job = await this.store.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      await this.store.addLog(jobId, 'info', '🚀 Starting summary pipeline');
      
      // Stage 1: Validate inputs
      await this.validateInputs(job);

      // Stage 2: Parse subtitles
      const episodeSubtitles = await this.parseSubtitles(job);

      // Stage 3: Analyze with LLM
      const { moments, narrativeOutline, narrative } = await this.analyzeWithLLM(
        job,
        episodeSubtitles
      );

      // Stage 4: Generate clip specifications
      const clips = await this.generateClipSpecs(job, moments);

      // Stage 5: Process video (cut and concatenate)
      const videoPath = await this.processVideo(job, clips);

      // Stage 6: Generate SRT
      const srtPath = await this.generateSrt(job, clips, episodeSubtitles);

      // Mode B additional stages
      let narrativeSrtPath: string | undefined;
      let audioPath: string | undefined;

      if (job.config.mode === 'B' && narrative) {
        // Stage 7: Generate TTS
        audioPath = await this.generateTTS(job, narrative);

        // Stage 8: Mix audio with video
        const finalVideoPath = await this.mixAudio(job, videoPath, audioPath);

        // Generate narrative SRT
        narrativeSrtPath = await this.generateNarrativeSrt(job, narrative, clips);

        // Update video path to final version
        job.outputs = {
          ...job.outputs,
          videoPath: path.relative(config.outputsDir, finalVideoPath),
        };
      }

      // Update job with output paths
      job.outputs = {
        ...job.outputs,
        videoPath: job.outputs?.videoPath ?? path.relative(config.outputsDir, videoPath),
        srtPath: path.relative(config.outputsDir, srtPath),
        narrativeSrtPath: narrativeSrtPath
          ? path.relative(config.outputsDir, narrativeSrtPath)
          : undefined,
        audioPath: audioPath ? path.relative(config.outputsDir, audioPath) : undefined,
      };

      job.keyMoments = moments;
      job.narrativeOutline = narrativeOutline;
      job.narrative = narrative;
      
      // First save the job with all outputs
      await this.store.save(job);
      
      // Then update status (this also saves)
      await this.store.addLog(jobId, 'success', '✅ Pipeline completed successfully!');
      await this.store.updateStatus(jobId, 'completed', 'Summary generation complete', 100);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Pipeline failed for job ${jobId}:`, error);
      await this.store.setFailed(jobId, message);
      throw error;
    }
  }

  /**
   * Stage 1: Validate inputs
   */
  private async validateInputs(job: Job): Promise<void> {
    await this.store.updateStatus(job.id, 'validating', 'Validating input files', 0);
    await this.store.addLog(job.id, 'info', '🔍 Validating input files...');

    // Check FFmpeg availability
    if (!this.ffmpeg.isAvailable()) {
      throw new Error('FFmpeg is not available. Please install FFmpeg and add it to PATH.');
    }
    await this.store.addLog(job.id, 'success', '✓ FFmpeg is available');

    // Check for SRT files
    if (job.srtFiles.length === 0) {
      throw new Error('No SRT files uploaded');
    }
    await this.store.addLog(job.id, 'info', `Found ${job.srtFiles.length} SRT files`);

    // Check for video files - either uploaded or from local directory
    const hasUploadedVideos = job.videoFiles.length > 0;
    const hasLocalVideoDir = !!job.config.videoDirectory;

    if (!hasUploadedVideos && !hasLocalVideoDir) {
      throw new Error('No video files: either upload videos or specify a videoDirectory');
    }

    // If using local video directory, scan for video files
    if (hasLocalVideoDir && !hasUploadedVideos) {
      await this.store.addLog(job.id, 'info', `Scanning video directory: ${job.config.videoDirectory}`);
      await this.scanLocalVideoDirectory(job);
    }

    // Verify all SRT files exist
    for (const file of job.srtFiles) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.originalName}`);
      }
    }

    // Verify video files exist (either uploaded or local)
    const videoFiles = job.localVideoFiles ?? job.videoFiles;
    for (const file of videoFiles) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`Video file not found: ${file.path}`);
      }
    }

    await this.store.addLog(job.id, 'success', '✓ All input files validated');
    await this.store.updateProgress(job.id, 'Input validation complete', 100);
  }

  /**
   * Scans a local directory for video files and stores references in the job
   */
  private async scanLocalVideoDirectory(job: Job): Promise<void> {
    const videoDir = job.config.videoDirectory!;
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
    
    const files = fs.readdirSync(videoDir);
    const videoFiles: Array<{ path: string; episodeId?: string }> = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (videoExtensions.includes(ext)) {
        const fullPath = path.join(videoDir, file);
        const episodeId = extractEpisodeIdFromFilename(file) ?? undefined;
        videoFiles.push({ path: fullPath, episodeId });
      }
    }

    if (videoFiles.length === 0) {
      throw new Error(`No video files found in directory: ${videoDir}`);
    }

    job.localVideoFiles = videoFiles;
    await this.store.save(job);
    
    console.info(`Found ${videoFiles.length} video files in ${videoDir}`);
  }

  /**
   * Stage 2: Parse all SRT files
   */
  private async parseSubtitles(job: Job): Promise<Map<string, EpisodeSubtitles>> {
    await this.store.updateStatus(job.id, 'parsing', 'Parsing subtitle files', 0);
    await this.store.addLog(job.id, 'info', '📄 Parsing subtitle files...');

    const episodeSubtitles = new Map<string, EpisodeSubtitles>();
    const totalFiles = job.srtFiles.length;

    // Get video files (prefer local, fallback to uploaded)
    const videoFiles = this.getVideoFiles(job);

    for (let i = 0; i < job.srtFiles.length; i++) {
      const file = job.srtFiles[i];
      if (!file) continue;

      const progress = Math.round(((i + 1) / totalFiles) * 100);
      await this.store.updateProgress(
        job.id,
        `Parsing ${file.originalName}`,
        progress
      );

      const content = fs.readFileSync(file.path, 'utf-8');
      const episodeId = file.episodeId ?? extractEpisodeIdFromFilename(file.originalName) ?? `EP${(i + 1).toString().padStart(2, '0')}`;
      const entries = parseSrtFile(content, episodeId);

      // Find matching video file
      const videoFile = this.findMatchingVideoFromList(episodeId, videoFiles);

      episodeSubtitles.set(episodeId, {
        episodeId,
        episodeNumber: i + 1,
        videoFileName: videoFile ? path.basename(videoFile.path) : undefined,
        entries,
      });
      
      await this.store.addLog(job.id, 'info', `  Parsed ${file.originalName} (${entries.length} subtitles)`);
    }

    await this.store.addLog(job.id, 'success', `✓ Parsed ${totalFiles} subtitle files`);
    return episodeSubtitles;
  }

  /**
   * Stage 3: Analyze with LLM to select key moments
   */
  private async analyzeWithLLM(
    job: Job,
    episodeSubtitles: Map<string, EpisodeSubtitles>
  ): Promise<{
    moments: KeyMoment[];
    narrativeOutline: { intro: string; development: string; climax: string; resolution: string };
    narrative?: string;
  }> {
    await this.store.updateStatus(job.id, 'analyzing', 'Analyzing season with AI', 0);
    await this.store.addLog(job.id, 'info', `🤖 Analyzing with ${job.config.llmProvider.toUpperCase()}...`);

    const provider = createLLMProvider(job.config.llmProvider);

    // Convert map to array
    const subtitlesByEpisode = Array.from(episodeSubtitles.values()).sort(
      (a, b) => a.episodeNumber - b.episodeNumber
    );

    const targetMinutes = targetLengthToMinutes(job.config.targetLength, {
      short: config.targetDurationShort,
      medium: config.targetDurationMedium,
      long: config.targetDurationLong,
    });

    await this.store.addLog(job.id, 'info', `  Target duration: ${targetMinutes} minutes`);

    const input: SummarizationInput = {
      subtitlesByEpisode,
      targetDurationMinutes: targetMinutes,
      language: job.config.language,
      mode: job.config.mode,
      seriesName: job.config.seriesName,
      season: job.config.season,
    };

    await this.store.updateProgress(job.id, 'Selecting key moments with AI', 30);
    await this.store.addLog(job.id, 'info', '  Requesting key moments from AI...');
    const keyMomentsResult = await provider.selectKeyMoments(input);
    await this.store.addLog(job.id, 'success', `  ✓ AI selected ${keyMomentsResult.moments.length} key moments`);

    let narrative: string | undefined;

    if (job.config.mode === 'B') {
      await this.store.updateProgress(job.id, 'Generating narrative with AI', 70);
      await this.store.addLog(job.id, 'info', '  Generating narrative script...');
      const narrativeResult = await provider.generateNarrativeForSummary(
        keyMomentsResult.moments,
        job.config.language,
        { seriesName: job.config.seriesName, season: job.config.season }
      );
      narrative = narrativeResult.fullNarrative;
      await this.store.addLog(job.id, 'success', '  ✓ Narrative generated');
    }

    await this.store.updateProgress(job.id, 'AI analysis complete', 100);
    await this.store.addLog(job.id, 'success', '✓ AI analysis complete');

    return {
      moments: keyMomentsResult.moments,
      narrativeOutline: keyMomentsResult.narrativeOutline,
      narrative,
    };
  }

  /**
   * Stage 4: Generate clip specifications
   */
  private async generateClipSpecs(job: Job, moments: KeyMoment[]): Promise<ClipSpec[]> {
    await this.store.updateStatus(job.id, 'generating_clips', 'Generating clip list', 0);
    await this.store.addLog(job.id, 'info', '🎬 Generating clip specifications...');

    const clips: ClipSpec[] = [];
    const videoFiles = this.getVideoFiles(job);

    for (let i = 0; i < moments.length; i++) {
      const moment = moments[i];
      if (!moment) continue;

      const videoFile = this.findMatchingVideoFromList(moment.episodeId, videoFiles);
      if (!videoFile) {
        await this.store.addLog(job.id, 'warn', `  ⚠ No video file found for episode ${moment.episodeId}`);
        continue;
      }

      clips.push({
        episodeId: moment.episodeId,
        videoPath: videoFile.path,
        startTime: moment.startTime,
        endTime: moment.endTime,
        order: i + 1,
        moment,
      });
    }

    // Save clips JSON for reference
    const outputDir = this.store.getOutputDir(job.id);
    const clipsJsonPath = path.join(outputDir, 'clips.json');
    fs.writeFileSync(clipsJsonPath, JSON.stringify(clips, null, 2), 'utf-8');

    job.outputs = {
      ...job.outputs,
      clipsJsonPath: path.relative(config.outputsDir, clipsJsonPath),
    };
    await this.store.save(job);

    const totalDuration = clips.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
    await this.store.addLog(job.id, 'success', `✓ Generated ${clips.length} clips (total: ${Math.round(totalDuration / 60)} min)`);
    await this.store.updateProgress(job.id, `Generated ${clips.length} clips`, 100);

    return clips;
  }

  /**
   * Stage 5: Process video - cut and concatenate clips
   */
  private async processVideo(job: Job, clips: ClipSpec[]): Promise<string> {
    await this.store.updateStatus(job.id, 'processing_video', 'Processing video clips', 0);
    await this.store.addLog(job.id, 'info', '🎥 Processing video clips...');

    const outputDir = this.store.getOutputDir(job.id);
    const workDir = path.join(outputDir, 'temp');
    const outputPath = path.join(outputDir, `${job.config.seriesName}_S${job.config.season}_summary.mp4`);

    const videoClips: VideoClip[] = clips.map((clip) => ({
      videoPath: clip.videoPath,
      startTime: clip.startTime,
      endTime: clip.endTime,
    }));

    await this.store.addLog(job.id, 'info', `  Extracting ${videoClips.length} clips...`);
    await processClipsToVideo(videoClips, outputPath, workDir, this.ffmpeg);

    // Clean up temp directory
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true });
    }

    await this.store.addLog(job.id, 'success', '✓ Video processing complete');
    await this.store.updateProgress(job.id, 'Video processing complete', 100);

    return outputPath;
  }

  /**
   * Stage 6: Generate SRT file with remapped subtitles
   */
  private async generateSrt(
    job: Job,
    clips: ClipSpec[],
    episodeSubtitles: Map<string, EpisodeSubtitles>
  ): Promise<string> {
    await this.store.updateStatus(job.id, 'generating_srt', 'Generating subtitles', 0);
    await this.store.addLog(job.id, 'info', '📝 Generating subtitles...');

    const outputDir = this.store.getOutputDir(job.id);
    const srtPath = path.join(outputDir, `${job.config.seriesName}_S${job.config.season}_summary.srt`);

    // Convert clips to ClipDefinition format
    const clipDefinitions: ClipDefinition[] = clips.map((clip) => ({
      episodeId: clip.episodeId,
      videoPath: clip.videoPath,
      startTime: clip.startTime,
      endTime: clip.endTime,
      order: clip.order,
    }));

    // Create subtitle entries map
    const subtitleEntries = new Map(
      Array.from(episodeSubtitles.entries()).map(([id, ep]) => [id, ep.entries])
    );

    // Remap subtitles
    const remapped = remapSubtitlesToClips(clipDefinitions, subtitleEntries);

    // Generate SRT content
    const srtContent = generateSrtContent(remapped);
    fs.writeFileSync(srtPath, srtContent, 'utf-8');

    await this.store.addLog(job.id, 'success', `✓ Subtitles generated (${remapped.length} entries)`);
    await this.store.updateProgress(job.id, 'Subtitles generated', 100);

    return srtPath;
  }

  /**
   * Stage 7: Generate TTS audio (Mode B only)
   */
  private async generateTTS(job: Job, narrative: string): Promise<string> {
    await this.store.updateStatus(job.id, 'generating_tts', 'Generating voiceover', 0);

    const outputDir = this.store.getOutputDir(job.id);
    const audioPath = path.join(outputDir, 'narrative.mp3');

    const synthesizer = new AzureSpeechSynthesizer();
    await synthesizer.synthesizeToFile(narrative, audioPath);

    await this.store.updateProgress(job.id, 'Voiceover generated', 100);

    return audioPath;
  }

  /**
   * Stage 8: Mix audio with video (Mode B only)
   */
  private async mixAudio(job: Job, videoPath: string, audioPath: string): Promise<string> {
    await this.store.updateStatus(job.id, 'mixing_audio', 'Mixing audio with video', 0);

    const outputDir = this.store.getOutputDir(job.id);

    // First remove audio from video
    const silentVideoPath = path.join(outputDir, 'summary_silent.mp4');
    await this.ffmpeg.removeAudio(videoPath, silentVideoPath);

    await this.store.updateProgress(job.id, 'Mixing audio track', 50);

    // Then mix with narrative audio
    const finalPath = path.join(
      outputDir,
      `${job.config.seriesName}_S${job.config.season}_summary_narrated.mp4`
    );
    await this.ffmpeg.mixAudioWithVideo(silentVideoPath, audioPath, finalPath);

    // Clean up intermediate file
    if (fs.existsSync(silentVideoPath)) {
      fs.unlinkSync(silentVideoPath);
    }

    await this.store.updateProgress(job.id, 'Audio mixing complete', 100);

    return finalPath;
  }

  /**
   * Generate narrative SRT for Mode B
   */
  private async generateNarrativeSrt(
    job: Job,
    narrative: string,
    clips: ClipSpec[]
  ): Promise<string> {
    const outputDir = this.store.getOutputDir(job.id);
    const srtPath = path.join(
      outputDir,
      `${job.config.seriesName}_S${job.config.season}_summary_narrative.srt`
    );

    // Calculate total duration
    const totalDuration = clips.reduce(
      (sum, clip) => sum + (clip.endTime - clip.startTime),
      0
    );

    // Split narrative into blocks
    const sentences = narrative.split(/[.!?]+/).filter((s) => s.trim());
    const avgDuration = totalDuration / sentences.length;

    const blocks = sentences.map((text) => ({
      text: text.trim(),
      durationSeconds: avgDuration,
    }));

    const entries = generateNarrativeSubtitles(blocks);
    const srtContent = generateSrtContent(entries);
    fs.writeFileSync(srtPath, srtContent, 'utf-8');

    return srtPath;
  }

  /**
   * Finds a video file matching an episode ID
   */
  private findMatchingVideo(
    episodeId: string,
    videoFiles: { originalName: string; path: string; episodeId?: string }[]
  ): { originalName: string; path: string } | undefined {
    // First try to match by explicit episodeId
    const explicitMatch = videoFiles.find((v) => v.episodeId === episodeId);
    if (explicitMatch) return explicitMatch;

    // Try to extract episode ID from filename
    for (const video of videoFiles) {
      const videoEpisodeId = extractEpisodeIdFromFilename(video.originalName);
      if (videoEpisodeId === episodeId) {
        return video;
      }
    }

    // Try partial match
    const episodeNum = episodeId.match(/E(\d+)/)?.[1];
    if (episodeNum) {
      return videoFiles.find((v) => {
        const match = v.originalName.match(/E(\d+)/i);
        return match?.[1] === episodeNum;
      });
    }

    return undefined;
  }

  /**
   * Gets the list of video files to use (local or uploaded)
   */
  private getVideoFiles(job: Job): Array<{ path: string; episodeId?: string }> {
    // Prefer local video files over uploaded ones
    if (job.localVideoFiles && job.localVideoFiles.length > 0) {
      return job.localVideoFiles;
    }
    // Fall back to uploaded video files
    return job.videoFiles.map(f => ({ path: f.path, episodeId: f.episodeId }));
  }

  /**
   * Finds a video file matching an episode ID from a generic list
   */
  private findMatchingVideoFromList(
    episodeId: string,
    videoFiles: Array<{ path: string; episodeId?: string }>
  ): { path: string; episodeId?: string } | undefined {
    // First try to match by explicit episodeId
    const explicitMatch = videoFiles.find((v) => v.episodeId === episodeId);
    if (explicitMatch) return explicitMatch;

    // Try to extract episode ID from filename
    for (const video of videoFiles) {
      const fileName = path.basename(video.path);
      const videoEpisodeId = extractEpisodeIdFromFilename(fileName);
      if (videoEpisodeId === episodeId) {
        return video;
      }
    }

    // Try partial match
    const episodeNum = episodeId.match(/E(\d+)/)?.[1];
    if (episodeNum) {
      return videoFiles.find((v) => {
        const fileName = path.basename(v.path);
        const match = fileName.match(/E(\d+)/i);
        return match?.[1] === episodeNum;
      });
    }

    return undefined;
  }
}

// Singleton instance
export const summaryPipeline = new SummaryPipeline();
