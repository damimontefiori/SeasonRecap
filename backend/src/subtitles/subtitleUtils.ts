import { SubtitleEntry, EpisodeSubtitles, SeasonSubtitles, RawSrtEntry } from './types';

/**
 * Creates a unified timeline representation of all subtitles in a season
 * This is used for providing context to the LLM
 * @param episodes - Array of episode subtitles
 * @param seriesName - Name of the series
 * @param season - Season number
 * @param language - Language code (e.g., "es-ES")
 * @returns SeasonSubtitles object with unified timeline
 */
export function createSeasonTimeline(
  episodes: EpisodeSubtitles[],
  seriesName: string,
  season: number,
  language: string
): SeasonSubtitles {
  // Sort episodes by episode number
  const sortedEpisodes = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);

  const totalEntries = sortedEpisodes.reduce((sum, ep) => sum + ep.entries.length, 0);

  return {
    seriesName,
    season,
    language,
    episodes: sortedEpisodes,
    totalEntries,
  };
}

/**
 * Generates a text representation of the season for LLM consumption
 * Includes episode markers and timestamps
 * @param seasonSubtitles - The season subtitles object
 * @param maxCharsPerEpisode - Optional limit on characters per episode (for token management)
 * @returns Formatted text suitable for LLM input
 */
export function generateSeasonTextForLLM(
  seasonSubtitles: SeasonSubtitles,
  maxCharsPerEpisode?: number
): string {
  const lines: string[] = [
    `=== ${seasonSubtitles.seriesName} - Season ${seasonSubtitles.season} ===`,
    `Language: ${seasonSubtitles.language}`,
    `Total Episodes: ${seasonSubtitles.episodes.length}`,
    '',
  ];

  for (const episode of seasonSubtitles.episodes) {
    lines.push(`--- ${episode.episodeId} ---`);

    let episodeText = '';
    for (const entry of episode.entries) {
      const timeMarker = formatTimeMarker(entry.startTime);
      const line = `[${timeMarker}] ${entry.text}`;

      if (maxCharsPerEpisode && episodeText.length + line.length > maxCharsPerEpisode) {
        episodeText += '\n[...truncated...]';
        break;
      }

      episodeText += (episodeText ? '\n' : '') + line;
    }

    lines.push(episodeText);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats a time in seconds as MM:SS for compact display
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTimeMarker(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Represents a clip definition for the video editor
 */
export interface ClipDefinition {
  episodeId: string;
  videoPath: string;
  startTime: number;
  endTime: number;
  order: number;
}

/**
 * Represents the remapped subtitle for the final video
 */
export interface RemappedSubtitle {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  originalEpisodeId: string;
  originalStartTime: number;
}

/**
 * Remaps subtitle entries to match the new video timeline
 * @param clips - Array of clip definitions in order
 * @param episodeSubtitles - Map of episode ID to subtitle entries
 * @returns Array of remapped subtitle entries
 */
export function remapSubtitlesToClips(
  clips: ClipDefinition[],
  episodeSubtitles: Map<string, SubtitleEntry[]>
): RemappedSubtitle[] {
  const remapped: RemappedSubtitle[] = [];
  let currentOffset = 0;
  let index = 1;

  for (const clip of clips) {
    const entries = episodeSubtitles.get(clip.episodeId) ?? [];

    // Find subtitles that fall within this clip's time range
    const clipSubtitles = entries.filter(
      (entry) => entry.startTime >= clip.startTime && entry.endTime <= clip.endTime
    );

    for (const subtitle of clipSubtitles) {
      // Calculate new times relative to clip start + offset
      const newStartTime = currentOffset + (subtitle.startTime - clip.startTime);
      const newEndTime = currentOffset + (subtitle.endTime - clip.startTime);

      remapped.push({
        index,
        startTime: newStartTime,
        endTime: newEndTime,
        text: subtitle.text,
        originalEpisodeId: clip.episodeId,
        originalStartTime: subtitle.startTime,
      });

      index++;
    }

    // Update offset for next clip
    currentOffset += clip.endTime - clip.startTime;
  }

  return remapped;
}

/**
 * Generates narrative subtitles for Mode B
 * @param narrativeBlocks - Array of {text, durationSeconds} objects
 * @param startOffset - Starting offset in seconds
 * @returns Array of subtitle entries for the narrative
 */
export function generateNarrativeSubtitles(
  narrativeBlocks: Array<{ text: string; durationSeconds: number }>,
  startOffset: number = 0
): RawSrtEntry[] {
  const entries: RawSrtEntry[] = [];
  let currentTime = startOffset;
  let index = 1;

  for (const block of narrativeBlocks) {
    // Split long text into readable chunks (aim for ~10 seconds per subtitle)
    const words = block.text.split(' ');
    const wordsPerSubtitle = Math.ceil(words.length / Math.ceil(block.durationSeconds / 8));
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += wordsPerSubtitle) {
      chunks.push(words.slice(i, i + wordsPerSubtitle).join(' '));
    }

    const timePerChunk = block.durationSeconds / chunks.length;

    for (const chunk of chunks) {
      entries.push({
        index,
        startTime: currentTime,
        endTime: currentTime + timePerChunk,
        text: chunk,
      });
      currentTime += timePerChunk;
      index++;
    }
  }

  return entries;
}

/**
 * Finds subtitle entries that overlap with a time range
 * Useful for finding subtitles when clip boundaries don't align perfectly
 * @param entries - Array of subtitle entries
 * @param startTime - Range start in seconds
 * @param endTime - Range end in seconds
 * @param minOverlap - Minimum overlap ratio (0-1) to include a subtitle
 * @returns Filtered subtitle entries
 */
export function findOverlappingSubtitles(
  entries: SubtitleEntry[],
  startTime: number,
  endTime: number,
  minOverlap: number = 0.5
): SubtitleEntry[] {
  return entries.filter((entry) => {
    const overlapStart = Math.max(entry.startTime, startTime);
    const overlapEnd = Math.min(entry.endTime, endTime);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
    const entryDuration = entry.endTime - entry.startTime;

    return overlapDuration / entryDuration >= minOverlap;
  });
}

/**
 * Calculates the total duration of all clips
 * @param clips - Array of clip definitions
 * @returns Total duration in seconds
 */
export function calculateTotalDuration(clips: ClipDefinition[]): number {
  return clips.reduce((sum, clip) => sum + (clip.endTime - clip.startTime), 0);
}
