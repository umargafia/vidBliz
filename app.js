import Replicate from 'replicate';
import dotenv from 'dotenv';
import { writeFile, mkdir } from 'fs/promises';
import { createClient } from 'pexels';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Initialize Pexels client
const pexelsClient = createClient(process.env.PEXELS_API_KEY);

// Function to extract keywords from script
function extractKeywords(text) {
  // Remove common words and extract meaningful keywords
  const commonWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'our',
    'your',
    'their',
    'we',
    'you',
    'they',
    'it',
    'this',
    'that',
    'these',
    'those',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !commonWords.has(word));

  // Return unique keywords
  return [...new Set(words)];
}

// Function to download media from URL
async function downloadMedia(url, filename) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    await writeFile(filename, Buffer.from(buffer));
    return filename;
  } catch (error) {
    console.error(`Error downloading ${filename}:`, error.message);
    return null;
  }
}

// Function to search and download Pexels videos
async function searchAndDownloadVideos(keywords, limit = 3) {
  try {
    console.log(
      'Searching for videos with keywords:',
      keywords.slice(0, 3).join(', ')
    );

    const query = keywords.slice(0, 3).join(' ');
    const videos = await pexelsClient.videos.search({ query, per_page: limit });

    if (!videos.videos || videos.videos.length === 0) {
      console.log('No videos found');
      return [];
    }

    const downloadedVideos = [];

    for (let i = 0; i < Math.min(videos.videos.length, limit); i++) {
      const video = videos.videos[i];
      // Get the smallest HD video file for faster download
      const videoFile =
        video.video_files.find((file) => file.quality === 'hd') ||
        video.video_files[0];

      if (videoFile) {
        const filename = `assets/videos/video_${i + 1}.mp4`;
        console.log(`Downloading video ${i + 1}/${limit}...`);

        const downloaded = await downloadMedia(videoFile.link, filename);
        if (downloaded) {
          downloadedVideos.push({
            filename: downloaded,
            url: video.url,
            photographer: video.user.name,
          });
        }
      }
    }

    return downloadedVideos;
  } catch (error) {
    console.error('Error searching/downloading videos:', error.message);
    return [];
  }
}

// Function to search and download Pexels photos
async function searchAndDownloadPhotos(keywords, limit = 5) {
  try {
    console.log(
      'Searching for photos with keywords:',
      keywords.slice(0, 3).join(', ')
    );

    const query = keywords.slice(0, 3).join(' ');
    const photos = await pexelsClient.photos.search({ query, per_page: limit });

    if (!photos.photos || photos.photos.length === 0) {
      console.log('No photos found');
      return [];
    }

    const downloadedPhotos = [];

    for (let i = 0; i < Math.min(photos.photos.length, limit); i++) {
      const photo = photos.photos[i];
      const filename = `assets/photos/photo_${i + 1}.jpg`;
      console.log(`Downloading photo ${i + 1}/${limit}...`);

      const downloaded = await downloadMedia(photo.src.large, filename);
      if (downloaded) {
        downloadedPhotos.push({
          filename: downloaded,
          url: photo.url,
          photographer: photo.photographer,
        });
      }
    }

    return downloadedPhotos;
  } catch (error) {
    console.error('Error searching/downloading photos:', error.message);
    return [];
  }
}

// Function to get audio duration
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration);
      }
    });
  });
}

// Function to create video slideshow from images
async function createImageSlideshow(photos, audioDuration) {
  if (photos.length === 0) return null;

  console.log('Creating image slideshow...');
  const durationPerImage = Math.max(1, audioDuration / photos.length); // Minimum 1 second per image

  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    // Add all images with duration
    photos.forEach((photo, index) => {
      command
        .input(photo.filename)
        .inputOptions(['-loop', '1', '-t', durationPerImage.toString()]);
    });

    // Create filter complex for slideshow
    let filterComplex = '';
    photos.forEach((photo, index) => {
      filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[img${index}];`;
    });

    // Concatenate all scaled images
    filterComplex +=
      photos.map((_, index) => `[img${index}]`).join('') +
      `concat=n=${photos.length}:v=1:a=0[slideshow]`;

    command
      .complexFilter(filterComplex)
      .map('[slideshow]')
      .outputOptions([
        '-t',
        audioDuration.toString(),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
      ])
      .output('assets/slideshow.mp4')
      .on('start', () => console.log('Creating slideshow...'))
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Slideshow progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('Slideshow created successfully');
        resolve('assets/slideshow.mp4');
      })
      .on('error', (err) => {
        console.error('Error creating slideshow:', err.message);
        reject(err);
      })
      .run();
  });
}

// Function to create video montage from videos
async function createVideoMontage(videos, audioDuration) {
  if (videos.length === 0) return null;

  console.log('Creating video montage...');
  const durationPerVideo = audioDuration / videos.length;

  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    // Add all videos with duration limit
    videos.forEach((video, index) => {
      command
        .input(video.filename)
        .inputOptions(['-ss', '0', '-t', durationPerVideo.toString()]);
    });

    // Create filter complex for video concatenation
    let filterComplex = '';
    videos.forEach((video, index) => {
      filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}];`;
    });

    // Concatenate all processed videos
    filterComplex +=
      videos.map((_, index) => `[v${index}]`).join('') +
      `concat=n=${videos.length}:v=1:a=0[montage]`;

    command
      .complexFilter(filterComplex)
      .map('[montage]')
      .outputOptions([
        '-t',
        audioDuration.toString(),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      ])
      .output('assets/video_montage.mp4')
      .on('start', () => console.log('Creating video montage...'))
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(
            `Video montage progress: ${Math.round(progress.percent)}%`
          );
        }
      })
      .on('end', () => {
        console.log('Video montage created successfully');
        resolve('assets/video_montage.mp4');
      })
      .on('error', (err) => {
        console.error('Error creating video montage:', err.message);
        reject(err);
      })
      .run();
  });
}

// Function to combine video clips and images into final ad
async function createFinalAd(videoMontage, slideshow, audioPath, script) {
  console.log('Creating final advertisement...');

  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    // Determine which visual content to use
    const hasVideoMontage = videoMontage && videoMontage !== null;
    const hasSlideshow = slideshow && slideshow !== null;

    console.log(`Video montage available: ${hasVideoMontage}`);
    console.log(`Slideshow available: ${hasSlideshow}`);

    if (!hasVideoMontage && !hasSlideshow) {
      reject(new Error('No video or image content available'));
      return;
    }

    // Prefer video montage if available, otherwise use slideshow
    const visualInput = hasVideoMontage ? videoMontage : slideshow;
    console.log(`Using visual input: ${visualInput}`);

    command
      .input(visualInput)
      .input(audioPath)
      .outputOptions([
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-pix_fmt',
        'yuv420p',
        '-shortest',
      ])
      .output('assets/final_ad.mp4')
      .on('start', () => console.log('Combining video and audio...'))
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Final ad progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('Final advertisement created successfully!');
        resolve('assets/final_ad.mp4');
      })
      .on('error', (err) => {
        console.error('Error creating final ad:', err.message);
        reject(err);
      })
      .run();
  });
}

// Function to add text overlay to video
async function addTextOverlay(inputVideo, text, outputPath) {
  console.log('Adding text overlay to video...');

  return new Promise((resolve, reject) => {
    // Clean and prepare text for FFmpeg
    const cleanText = text
      .replace(/['"]/g, '')
      .replace(/\n/g, ' ')
      .substring(0, 100);

    const textFilter = `drawtext=fontfile=/System/Library/Fonts/Arial.ttf:text='${cleanText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.7:boxborderw=5:x=(w-text_w)/2:y=h-th-20`;

    ffmpeg(inputVideo)
      .videoFilters(textFilter)
      .outputOptions(['-c:v', 'libx264', '-c:a', 'copy', '-pix_fmt', 'yuv420p'])
      .output(outputPath)
      .on('start', () => console.log('Adding text overlay...'))
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(
            `Text overlay progress: ${Math.round(progress.percent)}%`
          );
        }
      })
      .on('end', () => {
        console.log('Text overlay added successfully');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Error adding text overlay:', err.message);
        reject(err);
      })
      .run();
  });
}

const prompt =
  'Create an engaging ad for Sabikuk, the online catering school and marketplace where chefs teach, sell recipes and spices, and students learn to cook anytime, anywhere.';

const input = {
  prompt: `Generate a 30-50 word video ad script for: ${prompt}. Keep it concise, engaging, and suitable for a 15-30 second ad. Use a warm, inviting tone and include a clear call-to-action.`,
  max_tokens: 100,
};

// Create assets directory structure
try {
  await mkdir('assets', { recursive: true });
  await mkdir('assets/videos', { recursive: true });
  await mkdir('assets/photos', { recursive: true });
  console.log('Assets directories created');
} catch (error) {
  console.log(
    'Assets directories already exist or error creating them:',
    error.message
  );
}

console.log('Generating script...');
let script = '';
for await (const event of replicate.stream('openai/gpt-5', { input })) {
  script += event;
}
console.log('Generated script:', script);

// Extract keywords from the generated script
const keywords = extractKeywords(script);
console.log('Extracted keywords:', keywords);

const AudioInput = {
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

console.log('Generating audio...');
const output = await replicate.run('minimax/speech-02-hd', {
  input: AudioInput,
});

// The output is a FileOutput object with a URL, we need to fetch the audio data
console.log('Generated audio URL:', output);

// Fetch the audio data from the URL
const response = await fetch(output);
const audioBuffer = await response.arrayBuffer();

// Write the audio data to file
await writeFile('assets/output_audio.wav', Buffer.from(audioBuffer));
console.log('Audio file saved as assets/output_audio.wav');

// Search and download videos based on keywords
console.log('\n--- Fetching Videos from Pexels ---');
const downloadedVideos = await searchAndDownloadVideos(keywords, 3);

// Search and download photos based on keywords
console.log('\n--- Fetching Photos from Pexels ---');
const downloadedPhotos = await searchAndDownloadPhotos(keywords, 5);

// Get audio duration for video timing
console.log('\n--- Analyzing Audio Duration ---');
const audioDuration = await getAudioDuration('assets/output_audio.wav');
console.log(`Audio duration: ${audioDuration.toFixed(2)} seconds`);

// Create video content
console.log('\n--- Creating Video Content ---');
let videoMontage = null;
let slideshow = null;

// Create video montage if videos are available
if (downloadedVideos.length > 0) {
  console.log(
    `Creating video montage from ${downloadedVideos.length} videos...`
  );
  videoMontage = await createVideoMontage(downloadedVideos, audioDuration);
  console.log(`Video montage created: ${videoMontage}`);
} else {
  console.log('No videos available for montage');
}

// Create slideshow if photos are available
if (downloadedPhotos.length > 0) {
  console.log(`Creating slideshow from ${downloadedPhotos.length} photos...`);
  slideshow = await createImageSlideshow(downloadedPhotos, audioDuration);
  console.log(`Slideshow created: ${slideshow}`);
} else {
  console.log('No photos available for slideshow');
}

// Create final advertisement
console.log('\n--- Creating Final Advertisement ---');
let finalAdPath = null;
if (videoMontage || slideshow) {
  finalAdPath = await createFinalAd(
    videoMontage,
    slideshow,
    'assets/output_audio.wav',
    script
  );

  // Add text overlay with script excerpt
  const scriptExcerpt = script.split(' ').slice(0, 8).join(' ') + '...';
  const finalAdWithText = await addTextOverlay(
    finalAdPath,
    scriptExcerpt,
    'assets/final_ad_with_text.mp4'
  );

  console.log('Final ad with text overlay:', finalAdWithText);
}

// Create a summary of all generated assets
const assetSummary = {
  script: script,
  audio: 'assets/output_audio.wav',
  videos: downloadedVideos,
  photos: downloadedPhotos,
  videoMontage: videoMontage,
  slideshow: slideshow,
  finalAd: finalAdPath,
  finalAdWithText: finalAdPath ? 'assets/final_ad_with_text.mp4' : null,
  audioDuration: audioDuration,
  keywords: keywords,
};

// Save asset summary to JSON file
await writeFile(
  'assets/asset_summary.json',
  JSON.stringify(assetSummary, null, 2)
);

console.log('\n--- Process Completed Successfully! ---');
console.log(`Generated Script: "${script}"`);
console.log(
  `Audio File: assets/output_audio.wav (${audioDuration.toFixed(2)}s)`
);
console.log(`Videos Downloaded: ${downloadedVideos.length}`);
console.log(`Photos Downloaded: ${downloadedPhotos.length}`);

if (videoMontage) {
  console.log(`Video Montage: ${videoMontage}`);
}

if (slideshow) {
  console.log(`Image Slideshow: ${slideshow}`);
}

if (finalAdPath) {
  console.log(`🎬 FINAL ADVERTISEMENT: assets/final_ad_with_text.mp4`);
  console.log(`📹 Basic Version: ${finalAdPath}`);
  console.log(`📂 Videos saved in assets/ directory for organization`);
}

console.log('Asset summary saved to: assets/asset_summary.json');

if (downloadedVideos.length > 0) {
  console.log('\nDownloaded Videos:');
  downloadedVideos.forEach((video, index) => {
    console.log(`  ${index + 1}. ${video.filename} (by ${video.photographer})`);
  });
}

if (downloadedPhotos.length > 0) {
  console.log('\nDownloaded Photos:');
  downloadedPhotos.forEach((photo, index) => {
    console.log(`  ${index + 1}. ${photo.filename} (by ${photo.photographer})`);
  });
}

console.log('\n🎉 Your complete video advertisement is ready!');
