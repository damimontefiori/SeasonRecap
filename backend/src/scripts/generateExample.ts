/**
 * Example script to generate a summary using synthetic data
 * Run with: npm run generate-summary:example
 */

import fs from 'fs';
import path from 'path';
import { jobStore } from '../jobs';
import { summaryPipeline } from '../pipelines';
import { FFmpegProcessor } from '../video';
import { config } from '../config';

// Synthetic SRT content for testing
const EXAMPLE_SRTS: Record<string, string> = {
  'S01E01': `1
00:00:10,000 --> 00:00:15,000
Welcome to the pilot episode.

2
00:00:20,000 --> 00:00:25,000
Meet our main character, Alex.

3
00:00:30,000 --> 00:00:35,000
Alex discovers a mysterious artifact.

4
00:01:00,000 --> 00:01:05,000
"What is this thing?" Alex wonders.

5
00:02:00,000 --> 00:02:10,000
The adventure begins as Alex leaves home.
`,

  'S01E02': `1
00:00:05,000 --> 00:00:10,000
Previously on The Show...

2
00:00:30,000 --> 00:00:35,000
Alex meets a new ally, Sam.

3
00:01:00,000 --> 00:01:05,000
"We need to work together," Sam says.

4
00:02:00,000 --> 00:02:10,000
They face their first challenge.
`,

  'S01E03': `1
00:00:10,000 --> 00:00:15,000
The tension rises.

2
00:00:45,000 --> 00:00:50,000
Alex and Sam discover the villain's plan.

3
00:01:30,000 --> 00:01:40,000
"We have to stop them!" Alex exclaims.

4
00:02:30,000 --> 00:02:40,000
The climactic confrontation begins.

5
00:03:00,000 --> 00:03:10,000
Victory! But at what cost?
`,
};

async function createExampleFiles(jobId: string): Promise<void> {
  const uploadDir = path.join(config.uploadsDir, jobId);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Create SRT files
  for (const [episodeId, content] of Object.entries(EXAMPLE_SRTS)) {
    const filename = `ExampleShow.${episodeId}.srt`;
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, content, 'utf-8');
    console.info(`Created: ${filename}`);
  }

  console.info('\n⚠️  Note: This example uses synthetic SRT files.');
  console.info('   For a complete test, you would need to add video files:');
  console.info('   - ExampleShow.S01E01.mp4');
  console.info('   - ExampleShow.S01E02.mp4');
  console.info('   - ExampleShow.S01E03.mp4');
}

async function main(): Promise<void> {
  console.info('\n🎬 SeasonSummarizer - Example Generation\n');

  // Check FFmpeg
  const ffmpeg = new FFmpegProcessor();
  if (!ffmpeg.isAvailable()) {
    console.error('❌ FFmpeg is not available. Please install FFmpeg first.');
    console.info('   Download: https://ffmpeg.org/download.html');
    process.exit(1);
  }
  console.info(`✅ FFmpeg available: ${ffmpeg.getVersion()}`);

  // Create a test job
  console.info('\n📝 Creating example job...\n');

  const job = await jobStore.create({
    config: {
      seriesName: 'ExampleShow',
      season: 1,
      language: 'en-US',
      mode: 'A',
      targetLength: 'short',
      llmProvider: 'openai',
    },
  });

  console.info(`   Job ID: ${job.id}`);
  console.info(`   Series: ${job.config.seriesName} Season ${job.config.season}`);
  console.info(`   Mode: ${job.config.mode}`);
  console.info(`   LLM Provider: ${job.config.llmProvider}`);

  // Create example files
  console.info('\n📁 Creating example SRT files...\n');
  await createExampleFiles(job.id);

  // Update job with file references
  const uploadDir = path.join(config.uploadsDir, job.id);
  const srtFiles = Object.keys(EXAMPLE_SRTS).map((episodeId) => ({
    originalName: `ExampleShow.${episodeId}.srt`,
    storedName: `ExampleShow.${episodeId}.srt`,
    path: path.join(uploadDir, `ExampleShow.${episodeId}.srt`),
    size: EXAMPLE_SRTS[episodeId]?.length ?? 0,
    episodeId,
  }));

  await jobStore.addFiles(job.id, srtFiles, 'srt');

  console.info('\n⚡ To run the full pipeline, you need to:');
  console.info('   1. Add video files to the upload directory');
  console.info('   2. Configure your .env with API keys');
  console.info('   3. Start the pipeline with:');
  console.info(`      POST http://localhost:${config.port}/api/jobs/${job.id}/start`);
  console.info('\n   Or add videos and run:');
  console.info('   await summaryPipeline.run(jobId)');

  console.info(`\n📂 Upload directory: ${uploadDir}`);
  console.info(`📂 Output directory: ${path.join(config.outputsDir, job.id)}`);

  // If we have test videos and API keys, we could run the pipeline
  const hasApiKey = !!config.openaiApiKey || !!config.anthropicApiKey;

  if (!hasApiKey) {
    console.info('\n⚠️  No LLM API keys configured in .env');
    console.info('   Set OPENAI_API_KEY or ANTHROPIC_API_KEY to run the pipeline.');
  }

  console.info('\n✅ Example job created successfully!\n');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
