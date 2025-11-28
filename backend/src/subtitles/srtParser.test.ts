import { describe, it, expect } from 'vitest';
import {
  srtTimeToSeconds,
  secondsToSrtTime,
  parseSrtContent,
  parseSrtFile,
  generateSrtContent,
  extractEpisodeIdFromFilename,
} from './srtParser';

describe('srtTimeToSeconds', () => {
  it('should convert standard SRT timestamp to seconds', () => {
    expect(srtTimeToSeconds('00:00:00,000')).toBe(0);
    expect(srtTimeToSeconds('00:00:01,000')).toBe(1);
    expect(srtTimeToSeconds('00:01:00,000')).toBe(60);
    expect(srtTimeToSeconds('01:00:00,000')).toBe(3600);
    expect(srtTimeToSeconds('01:30:45,500')).toBe(5445.5);
  });

  it('should handle period separator', () => {
    expect(srtTimeToSeconds('00:00:01.500')).toBe(1.5);
  });

  it('should handle milliseconds correctly', () => {
    expect(srtTimeToSeconds('00:00:00,001')).toBeCloseTo(0.001);
    expect(srtTimeToSeconds('00:00:00,100')).toBeCloseTo(0.1);
    expect(srtTimeToSeconds('00:00:00,999')).toBeCloseTo(0.999);
  });

  it('should throw on invalid format', () => {
    expect(() => srtTimeToSeconds('invalid')).toThrow();
    expect(() => srtTimeToSeconds('00:00')).toThrow();
  });
});

describe('secondsToSrtTime', () => {
  it('should convert seconds to SRT timestamp', () => {
    expect(secondsToSrtTime(0)).toBe('00:00:00,000');
    expect(secondsToSrtTime(1)).toBe('00:00:01,000');
    expect(secondsToSrtTime(60)).toBe('00:01:00,000');
    expect(secondsToSrtTime(3600)).toBe('01:00:00,000');
    expect(secondsToSrtTime(5445.5)).toBe('01:30:45,500');
  });

  it('should handle fractional seconds', () => {
    expect(secondsToSrtTime(1.5)).toBe('00:00:01,500');
    expect(secondsToSrtTime(0.001)).toBe('00:00:00,001');
  });
});

describe('parseSrtContent', () => {
  it('should parse valid SRT content', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
This is a test`;

    const entries = parseSrtContent(srt);
    expect(entries).toHaveLength(2);

    expect(entries[0]).toEqual({
      index: 1,
      startTime: 1,
      endTime: 4,
      text: 'Hello world',
    });

    expect(entries[1]).toEqual({
      index: 2,
      startTime: 5,
      endTime: 8,
      text: 'This is a test',
    });
  });

  it('should handle multi-line subtitles', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`;

    const entries = parseSrtContent(srt);
    expect(entries[0]?.text).toBe('Line one\nLine two');
  });

  it('should handle Windows line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n\r\n';
    const entries = parseSrtContent(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe('Hello');
  });

  it('should skip malformed blocks', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello

invalid block

2
00:00:05,000 --> 00:00:08,000
World`;

    const entries = parseSrtContent(srt);
    expect(entries).toHaveLength(2);
  });
});

describe('parseSrtFile', () => {
  it('should attach episode ID to entries', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello`;

    const entries = parseSrtFile(srt, 'S01E01');
    expect(entries[0]?.episodeId).toBe('S01E01');
  });
});

describe('generateSrtContent', () => {
  it('should generate valid SRT content', () => {
    const entries = [
      { index: 1, startTime: 1, endTime: 4, text: 'Hello' },
      { index: 2, startTime: 5, endTime: 8, text: 'World' },
    ];

    const content = generateSrtContent(entries);
    expect(content).toContain('00:00:01,000 --> 00:00:04,000');
    expect(content).toContain('Hello');
    expect(content).toContain('00:00:05,000 --> 00:00:08,000');
    expect(content).toContain('World');
  });

  it('should re-index entries starting from 1', () => {
    const entries = [
      { index: 5, startTime: 1, endTime: 4, text: 'Hello' },
      { index: 10, startTime: 5, endTime: 8, text: 'World' },
    ];

    const content = generateSrtContent(entries);
    const lines = content.split('\n');
    expect(lines[0]).toBe('1');
    expect(lines[4]).toBe('2');
  });
});

describe('extractEpisodeIdFromFilename', () => {
  it('should extract S01E01 pattern', () => {
    expect(extractEpisodeIdFromFilename('Series.S01E01.720p.mkv')).toBe('S01E01');
    expect(extractEpisodeIdFromFilename('s02e15.srt')).toBe('S02E15');
    expect(extractEpisodeIdFromFilename('Show S1E5.mp4')).toBe('S01E05');
  });

  it('should extract 1x01 pattern', () => {
    expect(extractEpisodeIdFromFilename('Series.1x01.720p.mkv')).toBe('S01E01');
    expect(extractEpisodeIdFromFilename('Show.02x15.srt')).toBe('S02E15');
  });

  it('should extract Episode 01 pattern', () => {
    expect(extractEpisodeIdFromFilename('Series Episode 01.mp4')).toBe('S01E01');
    expect(extractEpisodeIdFromFilename('E05.srt')).toBe('S01E05');
  });

  it('should return null for unrecognized patterns', () => {
    expect(extractEpisodeIdFromFilename('random_file.mp4')).toBeNull();
    expect(extractEpisodeIdFromFilename('video.mkv')).toBeNull();
  });
});
