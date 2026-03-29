# EasyBoom

EasyBoom is a high-performance local video utility designed for rapid streamlined video processing for simple operations and equipped with multi-file comparison. It provides a suite of tools for trimming, looping, speed adjustment, and side-by-side analysis, all powered by a robust backend and a modern, responsive interface.

Built with **Go**, **Wails (WebView2)**, and **Vanilla JS/CSS**, EasyBoom bridges the gap between powerful CLI tools and an intuitive desktop experience. At its core, it leverages **FFmpeg** for state-of-the-art media processing with millisecond precision.

---

## Key Features

### Boomerang Generator
Create seamless video loops with ease. The generator includes a specialized "Exclude Frozen Frames" feature to trim leading or trailing static frames, ensuring your loops are fluid and high-impact.

### Precision Cutting
A dedicated tool for extracting clips with frame-accurate boundaries. Features native millisecond conversion and real-time boundary previews using time-synced metadata.

### Video Joiner
Quickly concatenate multiple source files into a single, high-quality video sequence.

### Advanced Pacing
Control your media's tempo from **0.1x (Slow-Motion)** to **5.0x (Hyperlapse)**. Offers two specialized audio processing modes:
- **Scale Speed:** Dynamically adjusts audio tempo and pitch using advanced filter chaining.
- **Loop Original:** Maintains the original audio's pace by looping or trimming the stream to fit the new video duration perfectly.

### 6X Media Comparison
Analyze multiple versions of a shot or different assets simultaneously. The comparison grid supports up to 6 slots for videos or images in a high-density, widescreen-optimized layout.

---

## Design & Performance

- **Surgical Redrawing:** The application uses a custom rendering engine that only updates changed parts of the UI. This eliminates flickering and preserves your scroll position even during intense interactions.
- **State-Aware Playback:** Change settings, switch tabs, or update metadata without stopping your media. The app captures and restores video positions automatically to maintain your workflow.
- **Rich Aesthetics:** A premium dark-mode interface with a focus on usability, clean typography, and responsive layouts.

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
