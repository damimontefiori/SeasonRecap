/**
 * Represents a single subtitle entry parsed from an SRT file
 */
export interface SubtitleEntry {
  /** Episode identifier (e.g., "S01E01") */
  episodeId: string;
  /** Subtitle index within the episode (1-based from SRT) */
  index: number;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** The subtitle text content */
  text: string;
}

/**
 * Represents all subtitles for a single episode
 */
export interface EpisodeSubtitles {
  episodeId: string;
  episodeNumber: number;
  videoFileName?: string;
  entries: SubtitleEntry[];
}

/**
 * Represents the unified timeline of subtitles for an entire season
 */
export interface SeasonSubtitles {
  seriesName: string;
  season: number;
  language: string;
  episodes: EpisodeSubtitles[];
  /** Total number of subtitle entries across all episodes */
  totalEntries: number;
}

/**
 * Raw parsed SRT entry before episode metadata is attached
 */
export interface RawSrtEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}
