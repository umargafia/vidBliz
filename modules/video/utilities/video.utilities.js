import Replicate from 'replicate';
import dotenv from 'dotenv';
import { writeFile, mkdir, access, stat, unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'pexels';
import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';

dotenv.config();

// Validate required environment variables
if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN is required in environment variables');
}
if (!process.env.PEXELS_API_KEY) {
  throw new Error('PEXELS_API_KEY is required in environment variables');
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const pexelsClient = createClient(process.env.PEXELS_API_KEY);
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;

export const generateScript = async (prompt) => {
  try {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Invalid prompt provided');
    }

    const input = {
      prompt: `Generate a 30-50 word video ad script for: ${prompt}. Start with an attention-grabbing hook to entice viewers to watch. Keep it concise, engaging, and suitable for a 15-30 second ad. Use a warm, inviting tone and include a clear call-to-action. Split into 3-4 sentences.`,
      max_tokens: 100,
    };

    let script = '';
    const timeout = setTimeout(() => {
      throw new Error('Script generation timeout');
    }, 60000); // 60 second timeout

    try {
      for await (const event of replicate.stream('openai/gpt-5', { input })) {
        script += event;
      }
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

    if (!script || script.trim().length === 0) {
      throw new Error('Generated script is empty');
    }

    return script.trim();
  } catch (error) {
    console.error('Script generation failed:', error.message);
    throw new Error(`Script generation failed: ${error.message}`);
  }
};

export const generateAudio = async (script) => {
  try {
    const audioInput = {
      text: script,
      pitch: 0,
      speed: 1,
      volume: 1,
      bitrate: 128000,
      channel: 'mono',
      emotion: 'auto',
      voice_id: 'English_CalmWoman',
      sample_rate: 32000,
      language_boost: 'English',
      english_normalization: true,
    };

    console.log('Generating audio with Replicate...');
    const audioOutput = await replicate.run('minimax/speech-02-hd', {
      input: audioInput,
    });

    console.log('Downloading generated audio...');
    const audioResponse = await fetch(audioOutput);
    if (!audioResponse.ok) {
      throw new Error(
        `Failed to download audio: HTTP ${audioResponse.status} - ${audioResponse.statusText}`
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();

    // Ensure audio directory exists
    await mkdir('assets/audio', { recursive: true });

    //generate a unique filename
    const filename = `assets/audio/output_audio_${uuidv4()}.wav`;

    await writeFile(filename, Buffer.from(audioBuffer));
    console.log(`Audio saved successfully: ${filename}`);
    return filename;
  } catch (error) {
    console.error('Audio generation failed:', error.message);
    throw new Error(`Audio generation failed: ${error.message}`);
  }
};

export const getVideoKeywords = async (script) => {
  try {
    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      throw new Error('Invalid script provided for keyword extraction');
    }

    const input = {
      prompt: `Extract 5 - 8 specific, contextually relevant keywords from the following text for searching stock media related to ${script}. Ensure the keywords capture key themes, actions, and objects in the script, including any relevant adjectives or descriptive terms that provide context for the search.`,
      max_tokens: 50,
    };

    let keywords = [];
    const timeout = setTimeout(() => {
      throw new Error('Keyword extraction timeout');
    }, 30000); // 30 second timeout

    try {
      for await (const event of replicate.stream('openai/gpt-5', { input })) {
        keywords.push(event);
      }
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

    const keywordString = keywords.join('').trim();
    if (!keywordString) {
      // Fallback keywords based on common business terms
      console.log('Using fallback keywords');
      return ['business', 'technology', 'modern', 'professional', 'digital'];
    }

    // Clean and parse keywords
    const cleanedKeywords = keywordString
      .split(',')
      .map((k) => k.trim().replace(/[^\w\s]/g, ''))
      .filter((k) => k.length > 2)
      .slice(0, 8);

    return cleanedKeywords.length > 0
      ? cleanedKeywords
      : ['business', 'technology', 'modern'];
  } catch (error) {
    console.error('Keyword extraction failed:', error.message);
    // Return fallback keywords instead of throwing
    return ['business', 'technology', 'modern', 'professional', 'digital'];
  }
};

// Download media from URL
async function downloadMedia(url, filename) {
  try {
    console.log(`Downloading from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error('Downloaded file is empty');
    }

    await writeFile(filename, Buffer.from(buffer));

    // Verify file was written successfully
    const stats = await stat(filename);
    if (stats.size === 0) {
      throw new Error('Written file is empty');
    }

    console.log(`Successfully downloaded: ${filename} (${stats.size} bytes)`);
    return filename;
  } catch (error) {
    console.error(`Error downloading ${filename}:`, error.message);
    return null;
  }
}

export const downloadVideo = async (keywords) => {
  try {
    // Validate input
    if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
      throw new Error('No keywords provided for video search');
    }

    // Ensure assets directory exists
    await mkdir('assets/videos', { recursive: true });

    const keywordString = Array.isArray(keywords)
      ? keywords.join(' ')
      : keywords;
    console.log(`Searching for videos with keywords: ${keywordString}`);

    // Validate Pexels client
    if (!pexelsClient) {
      throw new Error('Pexels client not initialized - check API key');
    }

    let allVideos = [];
    try {
      const videos = await pexelsClient.videos.search({
        query: keywordString,
        per_page: 10, // Get more videos to ensure we have enough options
      });

      if (!videos || !videos.videos || videos.videos.length === 0) {
        throw new Error('No videos found on Pexels');
      }

      allVideos = videos.videos.map((v) => ({
        url:
          v.video_files.find((f) => f.quality === 'hd')?.link ||
          v.video_files[0].link,
        creator: v.user.name,
        tags: v.video_tags || [],
        duration: v.duration || 0,
        source: 'Pexels',
      }));
    } catch (error) {
      console.error('Pexels video search failed:', error.message);
      throw new Error(`Video search failed: ${error.message}`);
    }

    if (allVideos.length === 0) {
      throw new Error('No videos found for the given keywords');
    }

    const downloadedVideos = [];
    const uniqueId = uuidv4();
    const maxDownloads = Math.min(allVideos.length, 8); // Download up to 8 videos

    console.log(`Attempting to download ${maxDownloads} videos...`);

    for (let i = 0; i < maxDownloads; i++) {
      const video = allVideos[i];
      const filename = `assets/videos/video_${uniqueId}_${i + 1}.mp4`;
      console.log(
        `Downloading video ${i + 1}/${maxDownloads} from ${video.source}...`
      );

      try {
        const downloaded = await downloadMedia(video.url, filename);
        if (downloaded) {
          // Verify file was actually downloaded and is valid
          try {
            await access(downloaded);
            const stats = await stat(downloaded);
            if (stats.size > 1000) {
              // Ensure it's a valid video file
              downloadedVideos.push({
                filename: downloaded,
                url: video.url,
                creator: video.creator,
                source: video.source,
                tags: video.tags,
                duration: video.duration,
              });
              console.log(
                `✓ Video ${i + 1} downloaded successfully (${stats.size} bytes)`
              );
            } else {
              console.error(`✗ Video ${i + 1} too small: ${stats.size} bytes`);
            }
          } catch {
            console.error(`✗ Downloaded file not accessible: ${downloaded}`);
          }
        } else {
          console.error(`✗ Failed to download video ${i + 1}`);
        }
      } catch (error) {
        console.error(`✗ Error downloading video ${i + 1}:`, error.message);
        // Continue with next video instead of failing completely
      }
    }

    if (downloadedVideos.length === 0) {
      throw new Error(
        'Failed to download any videos - check network connection'
      );
    }

    // Verify at least the first video is valid
    const firstVideo = downloadedVideos[0];
    try {
      const stats = await stat(firstVideo.filename);
      if (stats.size < 1000) {
        // Less than 1KB is likely not a valid video
        throw new Error('Downloaded video file is too small to be valid');
      }
      console.log(
        `First video verified: ${firstVideo.filename} (${stats.size} bytes)`
      );
    } catch (error) {
      throw new Error(`Failed to verify downloaded video: ${error.message}`);
    }

    console.log(`Successfully downloaded ${downloadedVideos.length} videos`);
    return downloadedVideos;
  } catch (error) {
    console.error('Video download process failed:', error.message);
    throw new Error(`Video download failed: ${error.message}`);
  }
};

// This function is no longer needed - we'll use direct video editing best practices

// Get audio duration
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

export const executeVideoEditing = async (videoLocations, audioFilename) => {
  try {
    // Input validation
    if (!videoLocations || videoLocations.length === 0) {
      throw new Error('No video files provided');
    }
    if (videoLocations.length > 8) {
      throw new Error('Maximum 8 videos supported');
    }
    if (!audioFilename) {
      throw new Error('No audio file provided');
    }

    console.log('=== STARTING MULTI-VIDEO EDITING PROCESS ===');
    console.log(`Videos to process: ${videoLocations.length}`);
    console.log(`Audio file: ${audioFilename}`);

    // Generate unique output filename
    const uniqueId = uuidv4();
    const outputPath = `assets/videos/edited_video_${uniqueId}.mp4`;
    console.log(`Output will be: ${outputPath}`);

    // Ensure output directory exists
    await mkdir('assets/videos', { recursive: true });

    // Validate ALL input files exist and are valid
    console.log('Validating input files...');
    for (let i = 0; i < videoLocations.length; i++) {
      const video = videoLocations[i];
      try {
        await access(video.filename);
        const stats = await stat(video.filename);
        console.log(
          `✓ Video ${i + 1}: ${video.filename} (${stats.size} bytes)`
        );
        if (stats.size < 1000) {
          throw new Error(`Video ${i + 1} file too small: ${stats.size} bytes`);
        }
      } catch (error) {
        throw new Error(`Video ${i + 1} validation failed: ${error.message}`);
      }
    }

    // Validate audio file
    try {
      await access(audioFilename);
      const audioStats = await stat(audioFilename);
      console.log(`✓ Audio: ${audioFilename} (${audioStats.size} bytes)`);
      if (audioStats.size < 1000) {
        throw new Error(`Audio file too small: ${audioStats.size} bytes`);
      }
    } catch (error) {
      throw new Error(`Audio validation failed: ${error.message}`);
    }

    // Get audio duration
    const audioDuration = await getAudioDuration(audioFilename);
    console.log(`Audio duration: ${audioDuration.toFixed(2)} seconds`);
    if (audioDuration <= 0 || audioDuration > 300) {
      throw new Error(`Invalid audio duration: ${audioDuration} seconds`);
    }

    return new Promise((resolve, reject) => {
      console.log('Creating multi-video FFmpeg command...');

      // Calculate duration per video segment
      const segmentDuration = audioDuration / videoLocations.length;
      console.log(
        `Each video segment duration: ${segmentDuration.toFixed(2)} seconds`
      );

      if (videoLocations.length === 1) {
        // Single video - simple approach
        console.log('Processing single video...');
        const command = ffmpeg()
          .input(videoLocations[0].filename)
          .input(audioFilename)
          .outputOptions([
            '-vf',
            'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
            '-c:v',
            'libx264',
            '-c:a',
            'aac',
            '-preset',
            'fast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-t',
            Math.ceil(audioDuration).toString(),
            '-map',
            '0:v',
            '-map',
            '1:a',
            '-shortest',
          ])
          .output(outputPath);

        setupFFmpegEvents(
          command,
          resolve,
          reject,
          videoLocations,
          audioDuration,
          outputPath
        );
        command.run();
      } else {
        // Multiple videos - concatenation approach
        console.log(
          `Processing ${videoLocations.length} videos for concatenation...`
        );

        let command = ffmpeg();

        // Add all video inputs
        videoLocations.forEach((video, index) => {
          console.log(`Adding input ${index}: ${video.filename}`);
          command = command.input(video.filename);
        });

        // Add audio input (will be the last input)
        command = command.input(audioFilename);
        const audioInputIndex = videoLocations.length;

        // Build filter complex for concatenation
        let filterComplex = '';

        // Normalize all videos to mobile format (9:16) and trim to segment duration
        for (let i = 0; i < videoLocations.length; i++) {
          filterComplex += `[${i}:v]trim=duration=${segmentDuration},scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,setpts=PTS-STARTPTS[v${i}norm];`;
        }

        // Concatenate all normalized videos
        filterComplex +=
          videoLocations.map((_, i) => `[v${i}norm]`).join('') +
          `concat=n=${videoLocations.length}:v=1:a=0[outv]`;

        console.log('Filter complex:', filterComplex);

        command = command
          .complexFilter(filterComplex)
          .outputOptions([
            '-map',
            '[outv]',
            '-map',
            `${audioInputIndex}:a`,
            '-c:v',
            'libx264',
            '-c:a',
            'aac',
            '-preset',
            'fast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-t',
            Math.ceil(audioDuration).toString(),
            '-shortest',
          ])
          .output(outputPath);

        setupFFmpegEvents(
          command,
          resolve,
          reject,
          videoLocations,
          audioDuration,
          outputPath
        );
        command.run();
      }
    });
  } catch (error) {
    console.error('Video editing setup failed:', error.message);
    throw new Error(`Video editing setup failed: ${error.message}`);
  }
};

// Clean up downloaded stock videos to save storage
async function cleanupStockVideos(videoLocations) {
  console.log('🧹 Cleaning up downloaded stock videos to save storage...');
  let deletedCount = 0;
  let failedCount = 0;

  for (const video of videoLocations) {
    try {
      await unlink(video.filename);
      deletedCount++;
      console.log(`✓ Deleted: ${video.filename}`);
    } catch (error) {
      failedCount++;
      console.error(`✗ Failed to delete: ${video.filename} - ${error.message}`);
    }
  }

  console.log(
    `🧹 Cleanup complete: ${deletedCount} deleted, ${failedCount} failed`
  );
}

// Helper function to set up FFmpeg events
function setupFFmpegEvents(
  command,
  resolve,
  reject,
  videoLocations,
  audioDuration,
  outputPath
) {
  command
    .on('start', (commandLine) => {
      console.log('FFmpeg started successfully');
      console.log(`Command: ${commandLine}`);
    })
    .on('progress', (progress) => {
      if (progress.percent) {
        const percent = Math.round(progress.percent);
        if (percent % 20 === 0) {
          // Log every 20%
          console.log(`Progress: ${percent}%`);
        }
      }
    })
    .on('end', async () => {
      console.log('Multi-video editing completed successfully!');

      // Clean up stock videos after successful processing
      await cleanupStockVideos(videoLocations);

      resolve({
        filename: outputPath,
        operations:
          videoLocations.length === 1
            ? ['scale', 'audio_sync', 'mobile_format', 'cleanup']
            : [
                'scale',
                'concatenate',
                'audio_sync',
                'mobile_format',
                'cleanup',
              ],
        inputVideos: videoLocations,
        audioDuration: audioDuration,
        videoCount: videoLocations.length,
        success: true,
      });
    })
    .on('error', async (err) => {
      console.error('FFmpeg error occurred:');
      console.error('Error message:', err.message);
      if (err.stderr) {
        console.error('FFmpeg stderr:', err.stderr);
      }

      // Clean up even on error to save space
      console.log('Cleaning up due to error...');
      await cleanupStockVideos(videoLocations);

      reject(new Error(`Video editing failed: ${err.message}`));
    });
}

// Professional video editing best practices applied automatically
