# EasyBoom

EasyBoom is a high-performance local video utility designed for rapid streamlined video processing for simple operations and equipped with multi-file comparison. It provides a suite of tools for trimming, looping, speed adjustment, and side-by-side analysis, all powered by a robust backend and a modern, responsive interface. Convenient tool for video editing when normal video editing software is too heavy or complicated for what you need.

Built with **Go**, **Wails (WebView2)**, and **Vanilla JS/CSS**, EasyBoom bridges the gap between powerful CLI tools and an intuitive desktop experience. At its core, it leverages **FFmpeg** for state-of-the-art media processing with millisecond precision.

---

## Key Features

### Boomerang Generator
Create seamless video loops with ease. The generator includes:
- **Exclude Frozen Frames:** Trim leading or trailing static frames for fluid, high-impact loops.
- **Audio Mirroring:** Synchronizes audio in a forward-backward loop (1-2-2-1) to perfectly match the boomerang motion or simply repeat the audio.

### Precision Cutting
A dedicated tool for extracting clips with frame-accurate boundaries. Features native millisecond conversion and real-time boundary previews using time-synced metadata.

### Video Joiner
Quickly concatenate multiple source files into a single, high-quality video sequence.

### Advanced Pacing
Control your media's tempo from **0.1x (Slow-Motion)** to **5.0x (Hyperlapse)**. Offers two specialized audio processing modes:
- **Scale Speed:** Dynamically adjusts audio tempo and pitch using advanced filter chaining.
- **Loop Original:** Maintains the original audio's pace by looping or trimming the stream to fit the new video duration perfectly.

### Still Frame Extraction
Extract high-quality, lossless images directly from your video. Seek to the exact frame you need and capture a standalone screenshot instantly.

### Media Comparison
Analyze multiple versions of a shot or different assets simultaneously. The high-density comparison grid supports up to **10 concurrent slots** for videos or images in a widescreen-optimized layout.

### Chained Workflows
Iterate faster by instantly promoting any processed result back to the primary input slot. The "Use as Input" feature allows you to chain multiple effects (e.g., Boomerang -> Pace -> Cut) without ever leaving the application or manually re-loading files.

---

## Design & Performance

- **Quick Preview:** The application maintains a persistent, side-by-side media workspace where your source inputs and processed results are always visible at once. This integrated layout eliminates context switching and allows for instantaneous, "live" visual verification, no need to even open the processed file in another application.
- **State-Aware Playback:** Change settings, switch tabs, or update metadata without pausing or restarting your media. The app automatically captures and restores high-precision video timestamps and playback status to maintain a continuous, uninterrupted workflow.
- **Quick Delete:** Delete unsatisfactory processed file with a single click.
- **Streamlined Aesthetics:** A premium dark-mode interface with a focus on usability, clean typography, and responsive layouts.

---

## Development & Building

EasyBoom is designed to be cross-platform but is specifically optimized for Windows environments.

### Requirements
- **Go 1.22.3** (or later)
- **Node.js v20.12.2** (recommended, managed via NVM)
- **FFmpeg & FFprobe**: The app looks for these in `bin/` or your system PATH.

### Building from Source
To build the production executable, it is recommended to use the Wails CLI. On Windows, ensure your environment is correctly configured (using Git Bash or similar for NVM support):

```bash
# Production Build
wails build -o EasyBoom.exe
```

For development with hot-reload:
```bash
wails dev
```

---

## License
This project is licensed under the [MIT License](LICENSE).
