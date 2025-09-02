# VidBliz - Complete AI Video Advertisement Generator

VidBliz is an automated tool that generates video advertisement scripts using AI, converts them to audio, fetches relevant media from Pexels, and creates complete video advertisements with professional editing.

## Features

- 🤖 **AI Script Generation**: Uses Replicate's GPT-5 to generate engaging ad scripts
- 🎵 **Text-to-Speech**: Converts scripts to high-quality audio using Minimax Speech
- 🎬 **Video Assets**: Automatically fetches relevant videos from Pexels
- 📸 **Photo Assets**: Downloads matching photos from Pexels
- 🎞️ **Video Editing**: Creates professional video montages and slideshows
- 🎯 **Final Ad Assembly**: Combines all elements into a complete advertisement
- 📝 **Text Overlays**: Adds script text overlays to videos
- ⏱️ **Smart Timing**: Automatically times content to match audio duration
- 📁 **Organized Output**: Creates structured asset directories
- 📋 **Asset Summary**: Generates a JSON summary of all created assets

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Install FFmpeg

VidBliz requires FFmpeg for video processing. Install it using Homebrew (macOS):

```bash
brew install ffmpeg
```

For other operating systems, visit [FFmpeg Download](https://ffmpeg.org/download.html)

### 3. Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Replicate API Token - Get from https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=your_replicate_api_token_here

# Pexels API Key - Get from https://www.pexels.com/api/
PEXELS_API_KEY=your_pexels_api_key_here
```

### 4. Get API Keys

#### Replicate API Token:

1. Visit [Replicate](https://replicate.com)
2. Sign up/login to your account
3. Go to [API Tokens](https://replicate.com/account/api-tokens)
4. Create a new token

#### Pexels API Key:

1. Visit [Pexels API](https://www.pexels.com/api/)
2. Sign up for a free account
3. Request API access
4. Copy your API key

## Usage

Run the application:

```bash
node app.js
```

## Output Structure

The application creates the following directory structure:

```
assets/
├── output_audio.wav           # Generated audio file
├── asset_summary.json         # Summary of all assets
├── final_ad.mp4              # Final advertisement (basic version)
├── final_ad_with_text.mp4    # Final advertisement with text overlay
├── video_montage.mp4         # Video montage (if videos available)
├── slideshow.mp4             # Image slideshow (if photos available)
├── videos/
│   ├── video_1.mp4
│   ├── video_2.mp4
│   └── video_3.mp4
└── photos/
    ├── photo_1.jpg
    ├── photo_2.jpg
    ├── photo_3.jpg
    ├── photo_4.jpg
    └── photo_5.jpg
```

## Asset Summary

The `asset_summary.json` file contains:

- Generated script text
- Audio file path and duration
- Video details (filename, photographer credits, original URLs)
- Photo details (filename, photographer credits, original URLs)
- Video montage and slideshow paths
- Final advertisement paths (basic and with text overlay)
- Extracted keywords used for media search

## Customization

You can modify the following in `app.js`:

- **Prompt**: Change the business description and ad requirements
- **Video Count**: Adjust the number of videos to download (default: 3)
- **Photo Count**: Adjust the number of photos to download (default: 5)
- **Audio Settings**: Modify voice settings, emotion, pitch, speed, etc.

## Example Output

```bash
Generating script...
Generated script: "Welcome to Sweet Haven Bakery, where fresh artisanal pastries meet warm hospitality..."
Extracted keywords: ["sweet", "haven", "bakery", "fresh", "artisanal", "pastries", "warm"]

--- Fetching Videos from Pexels ---
Searching for videos with keywords: sweet, haven, bakery
Downloading video 1/3...
Downloading video 2/3...
Downloading video 3/3...

--- Fetching Photos from Pexels ---
Searching for photos with keywords: sweet, haven, bakery
Downloading photo 1/5...
...

--- Analyzing Audio Duration ---
Audio duration: 18.45 seconds

--- Creating Video Content ---
Creating video montage...
Video montage progress: 100%
Video montage created successfully

Creating image slideshow...
Slideshow progress: 100%
Slideshow created successfully

--- Creating Final Advertisement ---
Combining video and audio...
Final ad progress: 100%
Final advertisement created successfully!

Adding text overlay to video...
Text overlay progress: 100%
Text overlay added successfully

Process Completed Successfully!
🎬 FINAL ADVERTISEMENT: assets/final_ad_with_text.mp4
📹 Basic Version: assets/final_ad.mp4
🎉 Your complete video advertisement is ready!
```

## License

This project is licensed under the ISC License.
