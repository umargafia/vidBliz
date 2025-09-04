import Replicate from 'replicate';
import dotenv from 'dotenv';
import { writeFile, mkdir } from 'fs/promises';
import { createClient } from 'pexels';
import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';
import {
  generateAudio,
  generateScript,
  getVideoKeywords,
} from '../utilities/video.utilities';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const pexelsClient = createClient(process.env.PEXELS_API_KEY);
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY; // Add to .env
const MIXKIT_API_KEY = process.env.MIXKIT_API_KEY; // Optional, Mixkit doesn't always require API key

export const generateVideo = async (req, res) => {
  const { prompt } = req.body;
  //genrate script
  console.log('generating script');
  const script = await generateScript(prompt);
  console.log('script generated');

  //genrate audio
  console.log('generating audio');
  const audio = await generateAudio(script);
  console.log('audio generated');

  // get video keywords
  console.log('getting video keywords');
  const videoKeywords = await getVideoKeywords(script);
  console.log('video keywords generated');

  //edit video
  console.log('editing video');
  const editingScript = await generateVideoEditing(script, code);
  console.log('video editing script generated');

  //download video
  //edit video
};
