import {
  generateAudio,
  generateScript,
  getVideoKeywords,
  downloadVideo,
  executeVideoEditing,
} from '../utilities/video.utilities.js';

export const generateVideo = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt is required',
          code: 'MISSING_PROMPT',
        },
      });
    }

    console.log(`Starting video generation for prompt: "${prompt}"`);

    // Generate script
    console.log('Generating script...');
    const script = await generateScript(prompt);
    console.log('Script generated successfully');

    // Generate audio
    console.log('Generating audio...');
    const audioFilename = await generateAudio(script);
    console.log('Audio generated successfully');

    // Get video keywords
    console.log('Getting video keywords...');
    const videoKeywords = await getVideoKeywords(script);
    console.log('Video keywords generated successfully');

    // Download videos
    console.log('Downloading videos...');
    const downloadedVideos = await downloadVideo(videoKeywords);
    console.log(`Downloaded ${downloadedVideos.length} videos successfully`);

    // Execute professional video editing
    console.log('Creating professional video montage...');
    const editedVideo = await executeVideoEditing(
      downloadedVideos,
      audioFilename
    );
    console.log('Professional video editing completed successfully');

    // Return success response with metadata
    const response = {
      success: true,
      data: {
        videoLocation: editedVideo.filename,
        metadata: {
          script: script,
          audioFile: audioFilename,
          keywords: videoKeywords,
          downloadedVideos: downloadedVideos.map((v) => ({
            filename: v.filename,
            source: v.source,
            creator: v.creator,
            duration: v.duration,
          })),
          editingOperations: editedVideo.operations,
          processedAt: new Date().toISOString(),
        },
      },
    };

    console.log('Video generation completed successfully');
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in video generation:', error.message);

    // Return detailed error response
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        code: getErrorCode(error.message),
        timestamp: new Date().toISOString(),
      },
    });
  }
};

// Helper function to categorize errors
function getErrorCode(errorMessage) {
  const message = errorMessage.toLowerCase();

  if (
    message.includes('video download failed') ||
    message.includes('no videos found')
  ) {
    return 'VIDEO_DOWNLOAD_ERROR';
  }
  if (message.includes('video editing failed')) {
    return 'VIDEO_EDITING_ERROR';
  }
  if (message.includes('script') || message.includes('generation')) {
    return 'SCRIPT_GENERATION_ERROR';
  }
  if (message.includes('audio')) {
    return 'AUDIO_GENERATION_ERROR';
  }
  if (message.includes('keywords')) {
    return 'KEYWORD_EXTRACTION_ERROR';
  }

  return 'UNKNOWN_ERROR';
}
