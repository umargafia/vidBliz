import express from 'express';
import { generateVideo } from '../controller/video.controller.js';

const router = express.Router();

// POST /video/generate - Generate a video based on prompt
router.post('/generate', generateVideo);

export default router;
