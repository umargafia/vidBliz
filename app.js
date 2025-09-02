import Replicate from 'replicate';
import dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const prompt =
  'a local bakery called "Sweet Haven Bakery" in Austin, Texas. Emphasize fresh, artisanal pastries and a welcoming atmosphere. Include a clear call-to-action. Keep the tone warm, inviting, and suitable for a 20-second social media ad.';

const input = {
  prompt: `Generate a 30-50 word video ad script for: ${prompt}. Keep it concise, engaging, and suitable for a 15-30 second ad. Use a warm, inviting tone and include a clear call-to-action.`,
  max_tokens: 100,
};

console.log('Generating script...');
let script = '';
for await (const event of replicate.stream('openai/gpt-5', { input })) {
  script += event;
}
console.log('Generated script:', script);

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
await writeFile('output_audio.wav', Buffer.from(audioBuffer));
console.log('Audio file saved as output_audio.wav');

console.log('Process completed successfully!');
