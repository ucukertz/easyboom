package colormatch

import (
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

// ProcessVideo stabilizes color across every frame using frame 0 as reference.
// workers controls parallelism — 1 = sequential, N = parallel with N goroutines.
func ProcessVideo(input, output string, workers int, darkThreshold float64, onProgress func(string)) error {
	if workers < 1 {
		workers = 1
	}

	width, height, fps, err := probeVideo(input)
	if err != nil {
		return err
	}
	frameSize := width * height * 3

	// Batch read all frames
	if onProgress != nil {
		onProgress("Reading frames...")
	}
	frames, err := readFrames(input, frameSize)
	if err != nil {
		return err
	}
	if len(frames) == 0 {
		return fmt.Errorf("no frames in video")
	}
	if onProgress != nil {
		onProgress(fmt.Sprintf("Read %d frames, processing with %d workers", len(frames), workers))
	}

	ref := frames[0]
	total := len(frames)

	// Process with worker pool
	results := make([][]byte, total)
	results[0] = ref

	jobs := make(chan int, total-1)
	var wg sync.WaitGroup

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				if onProgress != nil {
					onProgress(fmt.Sprintf("Processing frame %d/%d", idx+1, total))
				}
				results[idx] = TransferColorLab(frames[idx], ref, width, height, darkThreshold)
			}
		}()
	}

	for i := 1; i < total; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	if onProgress != nil {
		onProgress("Writing output...")
	}
	return writeFrames(output, input, results, width, height, fps)
}

func readFrames(input string, frameSize int) ([][]byte, error) {
	cmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error",
		"-i", input, "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var frames [][]byte
	buf := make([]byte, frameSize)
	for {
		_, err := io.ReadFull(stdout, buf)
		if err != nil {
			break
		}
		frame := make([]byte, frameSize)
		copy(frame, buf)
		frames = append(frames, frame)
	}

	cmd.Wait()
	return frames, nil
}

func writeFrames(output, inputPath string, frames [][]byte, width, height int, fps float64) error {
	args := []string{
		"-hide_banner", "-loglevel", "error",
		"-f", "rawvideo", "-pix_fmt", "bgr24",
		"-s", fmt.Sprintf("%dx%d", width, height),
		"-r", fmt.Sprintf("%.3f", fps),
		"-i", "pipe:0",
		"-i", inputPath,
		"-map", "0:v", "-map", "1:a?",
		"-c:v", "libx264", "-preset", "ultrafast",
		"-pix_fmt", "yuv420p",
		"-c:a", "copy",
		"-shortest",
		"-y", output,
	}
	cmd := exec.Command("ffmpeg", args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	for _, frame := range frames {
		stdin.Write(frame)
	}
	stdin.Close()
	return cmd.Wait()
}

func probeVideo(input string) (width, height int, fps float64, err error) {
	out, err := exec.Command("ffprobe", "-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height,r_frame_rate",
		"-of", "json", input,
	).CombinedOutput()
	if err != nil {
		return 0, 0, 0, fmt.Errorf("probe failed: %v: %s", err, string(out))
	}

	var res struct {
		Streams []struct {
			Width      int    `json:"width"`
			Height     int    `json:"height"`
			RFrameRate string `json:"r_frame_rate"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(out, &res); err != nil {
		return 0, 0, 0, err
	}
	if len(res.Streams) == 0 {
		return 0, 0, 0, fmt.Errorf("no video stream found")
	}

	s := res.Streams[0]
	fps = 30.0
	parts := strings.Split(s.RFrameRate, "/")
	if len(parts) == 2 {
		num, _ := strconv.ParseFloat(parts[0], 64)
		den, _ := strconv.ParseFloat(parts[1], 64)
		if den != 0 {
			fps = num / den
		}
	}
	return s.Width, s.Height, fps, nil
}
