# EasyBoom

EasyBoom is a high-performance local video utility designed for rapid streamlined video processing for simple operations and equipped with multi-file comparison. It provides a suite of tools for trimming, looping, speed adjustment, and side-by-side analysis, all powered by a robust backend and a modern, responsive interface. Convenient tool for video editing when normal video editing software is too heavy or complicated for what you need.

Built with **Go**, **Wails (WebView2)**, and **Vanilla JS/CSS**, EasyBoom bridges the gap between powerful CLI tools and an intuitive desktop experience. At its core, it leverages **FFmpeg** for state-of-the-art media processing with millisecond precision.

---

## Key Features

### Boomerang Generator
Create seamless video loops with ease. The generator includes:
- **Dual-Ended Trimming:** Independently exclude unwanted frames from the beginning or the end for a flawlessly fluid cycle. Sliders dynamically scale to the loaded video's total frame count with real-time time display.
- **Fetch from Source:** Grab the current playback frame directly from the video player and set it as a trim boundary — no manual scrubbing needed.
- **Audio Mirroring:** Flip audio to play in reverse alongside the boomerang loop, or keep it playing forward normally.
- **Only Reverse:** Output only the reversed portion of the trimmed segment instead of the full forward-backward loop. Useful for creating reversed clips without the repeat.

### Precision Cutting
A dedicated tool for extracting clips with frame-accurate boundaries. Features native millisecond conversion and real-time boundary previews using time-synced metadata.

### Video Joiner
Quickly concatenate multiple source files into a single, high-quality video sequence.

### Advanced Pacing
Control your media's tempo from **0.1x (Slow-Motion)** to **5.0x (Hyperlapse)**. Offers two specialized audio processing modes:
- **Scale Speed:** Dynamically adjusts audio tempo and pitch using advanced filter chaining.
- **Loop Original:** Maintains the original audio's pace by looping or trimming the stream to fit the new video duration perfectly.

### Still Frame Extraction
Extract high-quality, lossless images directly from your video. Seek to the exact frame you need and capture a standalone screenshot instantly. Frame indices are automatically clamped to valid bounds.

### Color Stabilization
Normalize color shifts across an entire video using the **Reinhard et al. (2001)** color transfer algorithm. Frame 0 serves as the color reference — every subsequent frame is statistically remapped to match its luminance and chrominance distribution.

- **Dark Protect Slider (0–1):** Prevents very dark pixels from being incorrectly mapped. Because near-black pixels have extremely low variance, the Reinhard formula can amplify tiny noise into visible color flashes (typically green, blue, or red artifacts). The slider sets a CIELAB L* threshold — pixels darker than the value are copied unchanged from the source. Default is `0.3`; increase toward `0.5` for low-light footage or if you see primary color flashes.
- **Workers:** Controls parallel processing. Higher values use more RAM since all video frames are held in memory simultaneously.

> [!NOTE]
> **Memory Warning:** The entire video is decoded into RAM as raw pixel data before processing. A 10-second 1080p clip at 30fps requires ~1.8 GB. Long or high-resolution videos may cause instability — consider trimming first.

> [!IMPORTANT]
> **Not a color grader.** This tool matches the statistical distribution of frame 0 onto every other frame. It does not perform perceptual matching, object-aware correction, or temporal smoothing. Results depend heavily on how representative frame 0 is of the desired look.

### Media Comparison
Analyze multiple versions of a shot or different assets simultaneously. The high-density comparison grid supports up to **10 concurrent slots** for videos or images in a widescreen-optimized layout.

### Chained Workflows
Iterate faster by instantly promoting any processed result back to the primary input slot. The "Use as Input" feature allows you to chain multiple effects (e.g., Boomerang -> Pace -> Cut) without ever leaving the application or manually re-loading files.

---

## Design & Performance

- **Quick Preview:** The application maintains a persistent, side-by-side media workspace where your source inputs and processed results are always visible at once. This integrated layout eliminates context switching and allows for instantaneous, "live" visual verification, no need to even open the processed file in another application.
- **Unified Logic Flow:** From extraction to comparison, EasyBoom is a self-contained environment. You can process, verify, and re-process (using Chained Workflows) entirely within the same window, replacing the need for multiple heavy editing tools for simple tasks.
- **State-Aware Playback:** Change settings, switch tabs, or update metadata without pausing or restarting your media. The app automatically captures and restores high-precision video timestamps and playback status to maintain a continuous, uninterrupted workflow.
- **Quick Delete:** Delete unsatisfactory processed file with a single click.
- **Streamlined Aesthetics:** A premium dark-mode interface with a focus on usability, clean typography, and responsive layouts.

---

## Development & Building

EasyBoom is designed to be cross-platform but is specifically optimized for Windows environments.

### Requirements
- **Go 1.26.1** (or later)
- **Node.js v24.14.1**
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
