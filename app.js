import Replicate from 'replicate';
import dotenv from 'dotenv';
import { writeFile, mkdir } from 'fs/promises';
import { createClient } from 'pexels';
import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const pexelsClient = createClient(process.env.PEXELS_API_KEY);
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY; // Add to .env
const MIXKIT_API_KEY = process.env.MIXKIT_API_KEY; // Optional, Mixkit doesn't always require API key

// Improved keyword extraction with context
async function extractKeywords(segment) {
  try {
    const input = {
      prompt: `Extract 3-5 specific, contextually relevant keywords from the following text for searching stock media related to cooking, catering, or education: "${segment}". Avoid generic words like 'learn', 'cook', 'join'.`,
      max_tokens: 50,
    };
    let keywords = [];
    for await (const event of replicate.stream('openai/gpt-5', { input })) {
      keywords.push(event);
    }
    return keywords
      .join('')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 2);
  } catch (error) {
    console.error('Error extracting keywords:', error.message);
    // Fallback to simple keyword extraction
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
      'learn',
      'cook',
      'join',
    ]);
    const words = segment
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word));
    return [...new Set(words)].slice(0, 5);
  }
}

// Function to segment script
function segmentScript(script) {
  return script
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Download media from URL
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

// Search and download media from multiple sources
async function searchAndDownloadMedia(
  keywords,
  segment,
  type = 'video',
  limit = 1
) {
  const query = keywords.join(' ');
  console.log(`Searching for ${type}s with keywords: ${query}`);

  const sources = [
    {
      name: 'Pexels',
      search: async () => {
        try {
          if (type === 'video') {
            const videos = await pexelsClient.videos.search({
              query,
              per_page: limit,
            });
            return videos.videos.map((v) => ({
              url:
                v.video_files.find((f) => f.quality === 'hd')?.link ||
                v.video_files[0].link,
              creator: v.user.name,
              tags: v.video_tags || [],
            }));
          } else {
            const photos = await pexelsClient.photos.search({
              query,
              per_page: limit,
            });
            return photos.photos.map((p) => ({
              url: p.src.large,
              creator: p.photographer,
              tags: [],
            }));
          }
        } catch (error) {
          console.error(`Pexels ${type} search failed:`, error.message);
          return [];
        }
      },
    },
    {
      name: 'Pixabay',
      search: async () => {
        try {
          const response = await fetch(
            `https://pixabay.com/api/${
              type === 'video' ? 'videos' : ''
            }?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(
              query
            )}&per_page=${limit}`
          );
          const data = await response.json();
          return (type === 'video' ? data.hits : data.hits).map((h) => ({
            url: type === 'video' ? h.videos.medium.url : h.largeImageURL,
            creator: h.user,
            tags: h.tags.split(', '),
          }));
        } catch (error) {
          console.error(`Pixabay ${type} search failed:`, error.message);
          return [];
        }
      },
    },
    {
      name: 'Mixkit',
      search: async () => {
        try {
          const response = await fetch(
            `https://mixkit.co/api/free-stock-videos/?q=${encodeURIComponent(
              query
            )}&per_page=${limit}`
          );
          const data = await response.json();
          return type === 'video'
            ? data.assets.map((a) => ({
                url: a.url,
                creator: 'Mixkit',
                tags: a.tags || [],
              }))
            : [];
        } catch (error) {
          console.error(`Mixkit ${type} search failed:`, error.message);
          return [];
        }
      },
    },
  ];

  let allMedia = [];
  for (const source of sources) {
    const media = await source.search();
    allMedia.push(...media.map((m) => ({ ...m, source: source.name })));
  }

  // Filter media by relevance (check if tags match keywords)
  const relevantMedia = allMedia
    .filter((m) => {
      const tagMatch = m.tags.some((t) =>
        keywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))
      );
      return tagMatch || m.source === 'Pexels'; // Fallback to Pexels if no tag match
    })
    .slice(0, limit);

  const downloadedMedia = [];
  for (let i = 0; i < Math.min(relevantMedia.length, limit); i++) {
    const item = relevantMedia[i];
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const filename = `assets/${type}s/${type}_${item.source}_${Date.now()}_${
      i + 1
    }.${ext}`;
    console.log(`Downloading ${type} from ${item.source}...`);
    const downloaded = await downloadMedia(item.url, filename);
    if (downloaded) {
      downloadedMedia.push({
        filename,
        url: item.url,
        creator: item.creator,
        source: item.source,
        segment,
      });
    }
  }
  return downloadedMedia;
}

// Get audio duration
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

// Create dynamic video with timed visuals
async function createDynamicVideo(media, segmentTimings, audioDuration) {
  if (media.length === 0) return null;

  console.log('Creating dynamic video...');
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    let filterComplex = '';
    const inputs = [];

    media.forEach((item, index) => {
      const duration = segmentTimings[index].end - segmentTimings[index].start;
      if (item.filename.endsWith('.mp4')) {
        command
          .input(item.filename)
          .inputOptions(['-ss', '0', '-t', duration.toString()]);
        filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}];`;
      } else {
        command
          .input(item.filename)
          .inputOptions(['-loop', '1', '-t', duration.toString()]);
        filterComplex += `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}];`;
      }
      inputs.push(`[v${index}]`);
    });

    filterComplex +=
      inputs.join('') + `concat=n=${media.length}:v=1:a=0[dynamic]`;

    command
      .complexFilter(filterComplex)
      .map('[dynamic]')
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
      .output('assets/dynamic_video.mp4')
      .on('start', () => console.log('Creating dynamic video...'))
      .on('progress', (progress) => {
        if (progress.percent)
          console.log(
            `Dynamic video progress: ${Math.round(progress.percent)}%`
          );
      })
      .on('end', () => {
        console.log('Dynamic video created successfully');
        resolve('assets/dynamic_video.mp4');
      })
      .on('error', (err) => {
        console.error('Error creating dynamic video:', err.message);
        reject(err);
      })
      .run();
  });
}

// Combine video and audio
async function createFinalAd(videoPath, audioPath) {
  console.log('Creating final advertisement...');
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
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
        if (progress.percent)
          console.log(`Final ad progress: ${Math.round(progress.percent)}%`);
      })
      .on('end', () => {
        console.log('Final advertisement created successfully');
        resolve('assets/final_ad.mp4');
      })
      .on('error', (err) => {
        console.error('Error creating final ad:', err.message);
        reject(err);
      })
      .run();
  });
}

// Add text overlay
async function addTextOverlay(inputVideo, text, outputPath, timing) {
  console.log('Adding text overlay to video...');
  return new Promise((resolve, reject) => {
    const cleanText = text
      .replace(/['"]/g, '')
      .replace(/\n/g, ' ')
      .substring(0, 50);
    const textFilter = `drawtext=fontfile=/System/Library/Fonts/Arial.ttf:text='${cleanText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.7:boxborderw=5:x=(w-text_w)/2:y=h-th-20:enable='between(t,${timing.start},${timing.end})'`;

    ffmpeg(inputVideo)
      .videoFilters(textFilter)
      .outputOptions(['-c:v', 'libx264', '-c:a', 'copy', '-pix_fmt', 'yuv420p'])
      .output(outputPath)
      .on('start', () => console.log('Adding text overlay...'))
      .on('progress', (progress) => {
        if (progress.percent)
          console.log(
            `Text overlay progress: ${Math.round(progress.percent)}%`
          );
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

// Main execution
(async () => {
  try {
    // Create directories
    await mkdir('assets', { recursive: true });
    await mkdir('assets/videos', { recursive: true });
    await mkdir('assets/photos', { recursive: true });
    console.log('Assets directories created');

    // Generate script
    const prompt =
      'Create an engaging ad for Sabikuk, the online catering school and marketplace where chefs teach, sell recipes and spices, and students learn to cook anytime, anywhere.';
    const input = {
      prompt: `Generate a 30-50 word video ad script for: ${prompt}. Keep it concise, engaging, and suitable for a 15-30 second ad. Use a warm, inviting tone and include a clear call-to-action. Split into 3-4 sentences.`,
      max_tokens: 100,
    };

    console.log('Generating script...');
    let script = '';
    for await (const event of replicate.stream('openai/gpt-5', { input })) {
      script += event;
    }
    console.log('Generated script:', script);

    // Segment script and extract keywords
    const segments = segmentScript(script);
    console.log('Script segments:', segments);
    const segmentKeywords = await Promise.all(
      segments.map((segment) => extractKeywords(segment))
    );
    console.log('Segment keywords:', segmentKeywords);

    // Generate audio
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

    console.log('Generating audio...');
    const audioOutput = await replicate.run('minimax/speech-02-hd', {
      input: audioInput,
    });
    const audioResponse = await fetch(audioOutput);
    const audioBuffer = await audioResponse.arrayBuffer();
    await writeFile('assets/output_audio.wav', Buffer.from(audioBuffer));
    console.log('Audio file saved as assets/output_audio.wav');

    // Get audio duration
    const audioDuration = await getAudioDuration('assets/output_audio.wav');
    console.log(`Audio duration: ${audioDuration.toFixed(2)} seconds`);

    // Assign timings to segments
    const segmentDuration = audioDuration / segments.length;
    const segmentTimings = segments.map((_, index) => ({
      start: index * segmentDuration,
      end: (index + 1) * segmentDuration,
    }));
    console.log('Segment timings:', segmentTimings);

    // Download media for each segment from multiple sources
    const downloadedMedia = [];
    for (let i = 0; i < segments.length; i++) {
      console.log(
        `\n--- Fetching Media for Segment ${i + 1}: "${segments[i]}" ---`
      );
      let media = await searchAndDownloadMedia(
        segmentKeywords[i],
        segments[i],
        'video',
        1
      );
      if (media.length === 0) {
        console.log(`No videos found for segment ${i + 1}, trying photos...`);
        media = await searchAndDownloadMedia(
          segmentKeywords[i],
          segments[i],
          'photo',
          1
        );
      }
      if (media.length > 0) {
        downloadedMedia.push({
          ...media[0],
          segment: segments[i],
          timing: segmentTimings[i],
        });
      } else {
        console.log(`No media found for segment ${i + 1}, using fallback...`);
        downloadedMedia.push({
          filename: 'assets/fallback.jpg',
          segment: segments[i],
          timing: segmentTimings[i],
          source: 'Local',
          creator: 'Fallback',
        });
      }
    }

    // Filter out null media
    const validMedia = downloadedMedia.filter((m) => m.filename);
    console.log(`Downloaded ${validMedia.length} media files`);

    // Create dynamic video
    let dynamicVideo = null;
    if (validMedia.length > 0) {
      dynamicVideo = await createDynamicVideo(
        validMedia,
        segmentTimings,
        audioDuration
      );
      console.log(`Dynamic video created: ${dynamicVideo}`);
    } else {
      throw new Error('No media available to create video');
    }

    // Create final ad
    const finalAdPath = await createFinalAd(
      dynamicVideo,
      'assets/output_audio.wav'
    );
    console.log(`Final ad created: ${finalAdPath}`);

    // Add text overlays
    let finalAdWithText = finalAdPath;
    for (let i = 0; i < validMedia.length; i++) {
      const outputPath = `assets/final_ad_with_text_${i + 1}.mp4`;
      finalAdWithText = await addTextOverlay(
        finalAdWithText,
        validMedia[i].segment,
        outputPath,
        validMedia[i].timing
      );
      console.log(`Text overlay for segment ${i + 1}: ${finalAdWithText}`);
    }

    // Create asset summary
    const assetSummary = {
      script,
      segments,
      audio: 'assets/output_audio.wav',
      media: validMedia,
      dynamicVideo,
      finalAd: finalAdPath,
      finalAdWithText,
      audioDuration,
      segmentTimings,
    };
    await writeFile(
      'assets/asset_summary.json',
      JSON.stringify(assetSummary, null, 2)
    );
    console.log('Asset summary saved to: assets/asset_summary.json');

    // Log results
    console.log('\n--- Process Completed Successfully! ---');
    console.log(`Generated Script: "${script}"`);
    console.log(
      `Audio File: assets/output_audio.wav (${audioDuration.toFixed(2)}s)`
    );
    console.log(`Media Files Downloaded: ${validMedia.length}`);
    console.log(`Final Advertisement: ${finalAdWithText}`);
    console.log('\n🎉 Your dynamic video advertisement is ready!');
  } catch (error) {
    console.error('Error in ad creation:', error.message);
  }
})();
