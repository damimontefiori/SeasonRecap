import { describe, it, expect } from 'vitest';
import {
  createSeasonTimeline,
  generateSeasonTextForLLM,
  formatTimeMarker,
  remapSubtitlesToClips,
  generateNarrativeSubtitles,
  findOverlappingSubtitles,
  calculateTotalDuration,
  ClipDefinition,
} from './subtitleUtils';
import { SubtitleEntry, EpisodeSubtitles } from './types';

describe('formatTimeMarker', () => {
  it('should format seconds as MM:SS', () => {
    expect(formatTimeMarker(0)).toBe('00:00');
    expect(formatTimeMarker(65)).toBe('01:05');
    expect(formatTimeMarker(3661)).toBe('61:01');
  });
});

describe('createSeasonTimeline', () => {
  it('should create a unified timeline from episodes', () => {
    const episodes: EpisodeSubtitles[] = [
      {
        episodeId: 'S01E02',
        episodeNumber: 2,
        entries: [{ episodeId: 'S01E02', index: 1, startTime: 0, endTime: 5, text: 'Ep 2' }],
      },
      {
        episodeId: 'S01E01',
        episodeNumber: 1,
        entries: [{ episodeId: 'S01E01', index: 1, startTime: 0, endTime: 5, text: 'Ep 1' }],
      },
    ];

    const timeline = createSeasonTimeline(episodes, 'Test Show', 1, 'en-US');

    expect(timeline.seriesName).toBe('Test Show');
    expect(timeline.season).toBe(1);
    expect(timeline.episodes[0]?.episodeId).toBe('S01E01'); // Should be sorted
    expect(timeline.totalEntries).toBe(2);
  });
});

describe('generateSeasonTextForLLM', () => {
  it('should generate formatted text for LLM', () => {
    const timeline = {
      seriesName: 'Test Show',
      season: 1,
      language: 'en-US',
      episodes: [
        {
          episodeId: 'S01E01',
          episodeNumber: 1,
          entries: [{ episodeId: 'S01E01', index: 1, startTime: 65, endTime: 70, text: 'Hello' }],
        },
      ],
      totalEntries: 1,
    };

    const text = generateSeasonTextForLLM(timeline);

    expect(text).toContain('Test Show - Season 1');
    expect(text).toContain('S01E01');
    expect(text).toContain('[01:05] Hello');
  });
});

describe('remapSubtitlesToClips', () => {
  it('should remap subtitles to new timeline', () => {
    const clips: ClipDefinition[] = [
      { episodeId: 'S01E01', videoPath: 'e01.mp4', startTime: 10, endTime: 20, order: 1 },
      { episodeId: 'S01E02', videoPath: 'e02.mp4', startTime: 30, endTime: 40, order: 2 },
    ];

    const episodeSubtitles = new Map<string, SubtitleEntry[]>([
      [
        'S01E01',
        [
          { episodeId: 'S01E01', index: 1, startTime: 12, endTime: 15, text: 'Sub 1' },
          { episodeId: 'S01E01', index: 2, startTime: 50, endTime: 55, text: 'Not included' },
        ],
      ],
      [
        'S01E02',
        [{ episodeId: 'S01E02', index: 1, startTime: 32, endTime: 38, text: 'Sub 2' }],
      ],
    ]);

    const remapped = remapSubtitlesToClips(clips, episodeSubtitles);

    expect(remapped).toHaveLength(2);
    expect(remapped[0]?.startTime).toBe(2); // 12 - 10 = 2 (offset from clip start)
    expect(remapped[0]?.endTime).toBe(5);
    expect(remapped[1]?.startTime).toBe(12); // 10 (first clip duration) + (32-30)
  });
});

describe('generateNarrativeSubtitles', () => {
  it('should generate subtitle entries from narrative blocks', () => {
    const blocks = [
      { text: 'This is the first part of the narrative.', durationSeconds: 10 },
      { text: 'And this is the second part.', durationSeconds: 8 },
    ];

    const subtitles = generateNarrativeSubtitles(blocks);

    expect(subtitles.length).toBeGreaterThan(0);
    expect(subtitles[0]?.startTime).toBe(0);

    // Last subtitle should end at approximately total duration
    const lastSub = subtitles[subtitles.length - 1];
    expect(lastSub?.endTime).toBeCloseTo(18, 0);
  });
});

describe('findOverlappingSubtitles', () => {
  it('should find subtitles that overlap with a time range', () => {
    const entries: SubtitleEntry[] = [
      { episodeId: 'S01E01', index: 1, startTime: 0, endTime: 5, text: 'Full before' },
      { episodeId: 'S01E01', index: 2, startTime: 8, endTime: 12, text: 'Partial overlap' },
      { episodeId: 'S01E01', index: 3, startTime: 11, endTime: 15, text: 'Inside' },
      { episodeId: 'S01E01', index: 4, startTime: 20, endTime: 25, text: 'After' },
    ];

    const overlapping = findOverlappingSubtitles(entries, 10, 18);

    expect(overlapping).toHaveLength(2);
    expect(overlapping[0]?.text).toBe('Partial overlap');
    expect(overlapping[1]?.text).toBe('Inside');
  });
});

describe('calculateTotalDuration', () => {
  it('should calculate total duration of clips', () => {
    const clips: ClipDefinition[] = [
      { episodeId: 'S01E01', videoPath: 'e01.mp4', startTime: 10, endTime: 20, order: 1 },
      { episodeId: 'S01E02', videoPath: 'e02.mp4', startTime: 0, endTime: 15, order: 2 },
    ];

    expect(calculateTotalDuration(clips)).toBe(25); // 10 + 15
  });
});
