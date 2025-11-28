import { RawSrtEntry, SubtitleEntry, EpisodeSubtitles } from './types';

/**
 * Converts SRT timestamp format (HH:MM:SS,mmm) to seconds
 * @param timestamp - Timestamp in format "HH:MM:SS,mmm" or "HH:MM:SS.mmm"
 * @returns Time in seconds (float)
 */
export function srtTimeToSeconds(timestamp: string): number {
  // Normalize separator (SRT uses comma, some use period)
  const normalized = timestamp.replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length !== 3) {
    throw new Error(`Invalid SRT timestamp format: ${timestamp}`);
  }

  const hours = parseInt(parts[0] ?? '0', 10);
  const minutes = parseInt(parts[1] ?? '0', 10);
  const secondsParts = (parts[2] ?? '0').split('.');
  const seconds = parseInt(secondsParts[0] ?? '0', 10);
  const milliseconds = parseInt((secondsParts[1] ?? '0').padEnd(3, '0'), 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

/**
 * Converts seconds to SRT timestamp format (HH:MM:SS,mmm)
 * @param seconds - Time in seconds
 * @returns Timestamp in format "HH:MM:SS,mmm"
 */
export function secondsToSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return (
    `${hours.toString().padStart(2, '0')}:` +
    `${minutes.toString().padStart(2, '0')}:` +
    `${secs.toString().padStart(2, '0')},` +
    `${ms.toString().padStart(3, '0')}`
  );
}

/**
 * Parses an SRT file content into an array of raw subtitle entries
 * @param content - The raw SRT file content
 * @returns Array of parsed subtitle entries
 */
export function parseSrtContent(content: string): RawSrtEntry[] {
  const entries: RawSrtEntry[] = [];

  // Normalize line endings and split into blocks
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalizedContent.split(/\n\n+/).filter((block) => block.trim());

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim());

    if (lines.length < 3) {
      // Skip malformed blocks (need at least index, timestamp, and text)
      continue;
    }

    // First line should be the index number
    const indexLine = lines[0];
    if (!indexLine) continue;

    const index = parseInt(indexLine.trim(), 10);
    if (isNaN(index)) {
      continue; // Skip if not a valid index
    }

    // Second line should be the timestamp
    const timestampLine = lines[1];
    if (!timestampLine) continue;

    const timestampMatch = timestampLine.match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
    );

    if (!timestampMatch?.[1] || !timestampMatch[2]) {
      continue; // Skip if timestamp format is invalid
    }

    const startTime = srtTimeToSeconds(timestampMatch[1]);
    const endTime = srtTimeToSeconds(timestampMatch[2]);

    // Remaining lines are the subtitle text
    const text = lines.slice(2).join('\n').trim();

    entries.push({
      index,
      startTime,
      endTime,
      text,
    });
  }

  return entries;
}

/**
 * Parses an SRT file and attaches episode metadata
 * @param content - The raw SRT file content
 * @param episodeId - The episode identifier (e.g., "S01E01")
 * @returns Array of subtitle entries with episode metadata
 */
export function parseSrtFile(content: string, episodeId: string): SubtitleEntry[] {
  const rawEntries = parseSrtContent(content);

  return rawEntries.map((entry) => ({
    ...entry,
    episodeId,
  }));
}

/**
 * Creates an EpisodeSubtitles object from parsed entries
 * @param entries - Parsed subtitle entries for an episode
 * @param episodeId - The episode identifier
 * @param episodeNumber - The episode number (1-based)
 * @param videoFileName - Optional associated video file name
 * @returns EpisodeSubtitles object
 */
export function createEpisodeSubtitles(
  entries: SubtitleEntry[],
  episodeId: string,
  episodeNumber: number,
  videoFileName?: string
): EpisodeSubtitles {
  return {
    episodeId,
    episodeNumber,
    videoFileName,
    entries,
  };
}

/**
 * Generates SRT content from subtitle entries
 * @param entries - Array of subtitle entries (can be SubtitleEntry or RawSrtEntry)
 * @returns SRT file content as string
 */
export function generateSrtContent(entries: Array<RawSrtEntry | SubtitleEntry>): string {
  return entries
    .map((entry, index) => {
      const num = index + 1;
      const start = secondsToSrtTime(entry.startTime);
      const end = secondsToSrtTime(entry.endTime);
      return `${num}\n${start} --> ${end}\n${entry.text}`;
    })
    .join('\n\n');
}

/**
 * Extracts episode ID from filename following common patterns
 * Supports: S01E01, 1x01, Episode 01, etc.
 * @param filename - The filename to parse
 * @returns Episode ID or null if not found
 */
export function extractEpisodeIdFromFilename(filename: string): string | null {
  // Pattern: S01E01, S1E1, etc.
  const sPattern = filename.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
  if (sPattern?.[1] && sPattern[2]) {
    const season = sPattern[1].padStart(2, '0');
    const episode = sPattern[2].padStart(2, '0');
    return `S${season}E${episode}`;
  }

  // Pattern: 1x01, 01x01
  const xPattern = filename.match(/(\d{1,2})x(\d{1,2})/i);
  if (xPattern?.[1] && xPattern[2]) {
    const season = xPattern[1].padStart(2, '0');
    const episode = xPattern[2].padStart(2, '0');
    return `S${season}E${episode}`;
  }

  // Pattern: Episode 01, E01
  const ePattern = filename.match(/[Ee](?:pisode\s*)?(\d{1,2})/);
  if (ePattern?.[1]) {
    const episode = ePattern[1].padStart(2, '0');
    return `S01E${episode}`; // Default to season 1 if not specified
  }

  return null;
}
