import Replicate from 'replicate';
import dotenv from 'dotenv';
import { writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export const generateScript = async (prompt) => {
  const input = {
    prompt: `Generate a 30-50 word video ad script for: ${prompt}. Start with an attention-grabbing hook to entice viewers to watch. Keep it concise, engaging, and suitable for a 15-30 second ad. Use a warm, inviting tone and include a clear call-to-action. Split into 3-4 sentences.`,
    max_tokens: 100,
  };
  let script = '';
  for await (const event of replicate.stream('openai/gpt-4o', { input })) {
    script += event;
  }
  return script;
};

export const generateAudio = async (script) => {
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

  const audioOutput = await replicate.run('minimax/speech-02-hd', {
    input: audioInput,
  });
  const audioResponse = await fetch(audioOutput);
  if (!audioResponse.ok)
    throw new Error(`HTTP error! status: ${audioResponse.status}`);
  const audioBuffer = await audioResponse.arrayBuffer();

  //generate a unique filename
  const filename = `assets/audio/output_audio_${uuidv4()}.wav`;

  await writeFile(filename, Buffer.from(audioBuffer));
  return filename;
};

export const getVideoKeywords = async (script) => {
  const input = {
    prompt: `Extract 5 - 8 specific, contextually relevant keywords from the following text for searching stock media related to ${script}. Ensure the keywords capture key themes, actions, and objects in the script, including any relevant adjectives or descriptive terms that provide context for the search.`,
    max_tokens: 50,
  };
  let keywords = [];
  for await (const event of replicate.stream('openai/gpt-4o', { input })) {
    keywords.push(event);
  }
  return keywords;
};

export const downloadVideo = async (keywords) => {};

export const generateVideoEditing = async (script, videoLocations) => {
  const prompt = `Generate a fluent-ffmpeg video editing script that applies basic edits to the video based on the following script ${script}. The script should be interpreted to create corresponding edits, such as cutting, trimming, overlaying text, adding transitions, or adjusting the video speed. The output should be a valid fluent-ffmpeg code snippet that can be used to manipulate the video (downloaded from ${videoLocations}) according to the description in the script. Ensure the code includes video file input, desired transformations, and output file path.`;
  const input = {
    prompt,
    max_tokens: 100,
  };
  let editingScript = '';
  for await (const event of replicate.stream('openai/gpt-4o', { input })) {
    editingScript += event;
  }
  return editingScript;
};

export const executeVideoEditing = async (editingScript, videoLocations) => {};
