package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
	"strconv"
	"strings"
	"encoding/json"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// VideoMetadata stores essential stream info
type VideoMetadata struct {
	Frames   int     `json:"frames"`
	FPS      float64 `json:"fps"`
	Duration float64 `json:"duration"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	runtime.WindowMaximise(ctx)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// getFFmpegPath returns the path to the ffmpeg binary
func (a *App) getFFmpegPath() (string, error) {
	// 1. Check local bin/ folder first
	ex, err := os.Executable()
	if err != nil {
		return "", err
	}
	exPath := filepath.Dir(ex)
	localPath := filepath.Join(exPath, "bin", "ffmpeg.exe")

	if _, err := os.Stat(localPath); err == nil {
		return localPath, nil
	}

	// 2. Fallback to project root bin for dev
	cwd, _ := os.Getwd()
	projectBin := filepath.Join(cwd, "bin", "ffmpeg.exe")
	if _, err := os.Stat(projectBin); err == nil {
		return projectBin, nil
	}

	// 3. Fallback to system PATH
	return "ffmpeg", nil
}

// getFFprobePath returns the path to the ffprobe binary
func (a *App) getFFprobePath() (string, error) {
	// 1. Check local bin/ folder first
	ex, err := os.Executable()
	if err != nil {
		return "", err
	}
	exPath := filepath.Dir(ex)
	localPath := filepath.Join(exPath, "bin", "ffprobe.exe")

	if _, err := os.Stat(localPath); err == nil {
		return localPath, nil
	}

	// 2. Fallback to project root bin for dev
	cwd, _ := os.Getwd()
	projectBin := filepath.Join(cwd, "bin", "ffprobe.exe")
	if _, err := os.Stat(projectBin); err == nil {
		return projectBin, nil
	}

	// 3. Fallback to system PATH
	return "ffprobe", nil
}

// executeFFmpeg runs the ffmpeg command and emits logs back to the frontend
func (a *App) executeFFmpeg(args []string) error {
	ffmpegPath, err := a.getFFmpegPath()
	if err != nil {
		return err
	}
	cmd := exec.Command(ffmpegPath, args...)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	scanner := bufio.NewScanner(stderr)
	for scanner.Scan() {
		line := scanner.Text()
		runtime.EventsEmit(a.ctx, "ffmpeg-log", line)
	}

	return cmd.Wait()
}

// SelectFile opens a file dialog and returns the selected path
func (a *App) SelectFile() string {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Video",
		Filters: []runtime.FileFilter{
			{DisplayName: "Video Files", Pattern: "*.mp4;*.mov;*.avi;*.mkv"},
		},
	})
	if err != nil {
		return ""
	}
	return selection
}

// DeleteFile removes a file from disk
func (a *App) DeleteFile(path string) error {
	return os.Remove(path)
}

// SaveFileAs opens a save dialog and moves the file to the chosen destination
func (a *App) SaveFileAs(sourcePath string) (string, error) {
	ext := filepath.Ext(sourcePath)
	filename := filepath.Base(sourcePath)
	
	target, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title: "Save Video As",
		DefaultFilename: filename,
		Filters: []runtime.FileFilter{
			{DisplayName: "Video Files", Pattern: "*" + ext},
		},
	})
	if err != nil || target == "" {
		return "", err
	}

	// Read source then write to target to handle cross-partition moves
	input, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", err
	}
	err = os.WriteFile(target, input, 0644)
	if err != nil {
		return "", err
	}
	
	// Remove original
	_ = os.Remove(sourcePath)
	
	return target, nil
}

// SaveTemp saves byte data to a temporary file and returns the path
func (a *App) SaveTemp(data []byte, filename string) (string, error) {
	tempPath := filepath.Join(os.TempDir(), "easyboom_"+filename)
	err := os.WriteFile(tempPath, data, 0644)
	return tempPath, err
}

// getOutputPath returns a timestamped path in the output directory
func (a *App) getOutputPath(prefix string) string {
	cwd, _ := os.Getwd()
	outputDir := filepath.Join(cwd, "output")
	_ = os.MkdirAll(outputDir, 0755)
	timestamp := time.Now().Format("20060102_150405")
	return filepath.Join(outputDir, fmt.Sprintf("%s_%s.mp4", prefix, timestamp))
}

// ProcessJoin joins two videos into one
func (a *App) ProcessJoin(video1, video2 string) (string, error) {
	output := a.getOutputPath("join")
	// Use concat filter
	args := []string{
		"-i", video1,
		"-i", video2,
		"-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
		"-map", "[v]",
		"-map", "[a]",
		"-y", output,
	}
	err := a.executeFFmpeg(args)
	return output, err
}

// ProcessCut trims a video with frame-accurate precision
func (a *App) ProcessCut(input string, startFrame, endFrame int) (string, error) {
	output := a.getOutputPath("cut")
	
	// We need the FPS to convert frames back to times for container-level trimming
	meta, err := a.ProbeVideo(input)
	if err != nil {
		return "", err
	}
	
	startTime := float64(startFrame) / meta.FPS
	endTime := float64(endFrame) / meta.FPS
	
	args := []string{
		"-ss", fmt.Sprintf("%.6f", startTime), 
		"-i", input,
		"-t", fmt.Sprintf("%.6f", endTime-startTime),
		"-c:v", "libx264",
		"-c:a", "aac",
		"-preset", "ultrafast",
		"-y", output,
	}
	
	err = a.executeFFmpeg(args)
	return output, err
}

// ProcessBoomerang creates a forward-backward loop (1-2-2-1 visually, 1-2-1-2 audio)
func (a *App) ProcessBoomerang(input string, exclude int) (string, error) {
	output := a.getOutputPath("boomerang")
	
	// Double-Reverse Trim: Start with reverse, trim start (original's end), then split and re-reverse
	filter := fmt.Sprintf("[0:v]reverse,trim=start_frame=%d,setpts=PTS-STARTPTS,split[cr1][cr2];[cr1]reverse[clean_fwd];[clean_fwd][cr2]concat=n=2:v=1:a=0[v];[0:a][0:a]concat=n=2:v=0:a=1[a]", exclude)
	
	args := []string{
		"-i", input,
		"-filter_complex", filter,
		"-map", "[v]",
		"-map", "[a]",
		"-y", output,
	}
	err := a.executeFFmpeg(args)
	return output, err
}

// ProcessPace changes the speed of a video and handles audio accordingly
func (a *App) ProcessPace(input string, speed float64, audioMode string) (string, error) {
	output := a.getOutputPath("pace")
	
	// Probe for duration to handle "repeat" mode correctly
	meta, err := a.ProbeVideo(input)
	if err != nil {
		return "", err
	}
	
	newDuration := meta.Duration / speed
	
	var filter string
	if audioMode == "scale" {
		// Video speed
		vFilter := fmt.Sprintf("[0:v]setpts=(1/%.6f)*PTS[v]", speed)
		
		// Audio tempo (atempo only 0.5-2.0, so needs chaining)
		aFilter := "[0:a]"
		remaining := speed
		for remaining < 0.5 {
			aFilter += "atempo=0.5,"
			remaining /= 0.5
		}
		for remaining > 2.0 {
			aFilter += "atempo=2.0,"
			remaining /= 2.0
		}
		aFilter += fmt.Sprintf("atempo=%.6f[a]", remaining)
		
		filter = vFilter + ";" + aFilter
	} else {
		// "repeat" mode: loop audio then trim to video duration
		// We use -stream_loop -1 on input for audio in the command below instead of filter complex
		filter = fmt.Sprintf("[0:v]setpts=(1/%.6f)*PTS[v]", speed)
	}

	args := []string{}
	if audioMode == "repeat" {
		args = []string{
			"-i", input,
			"-stream_loop", "-1", "-i", input,
			"-filter_complex", filter,
			"-map", "[v]",
			"-map", "1:a",
			"-t", fmt.Sprintf("%.6f", newDuration),
			"-y", output,
		}
	} else {
		args = []string{
			"-i", input,
			"-filter_complex", filter,
			"-map", "[v]",
			"-map", "[a]",
			"-y", output,
		}
	}

	err = a.executeFFmpeg(args)
	return output, err
}

// ProbeVideo returns frame count and FPS for a given video
func (a *App) ProbeVideo(path string) (VideoMetadata, error) {
	args := []string{
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=nb_frames,r_frame_rate,duration",
		"-of", "json",
		path,
	}
	
	ffprobePath, err := a.getFFprobePath()
	if err != nil {
		return VideoMetadata{}, err
	}
	cmd := exec.Command(ffprobePath, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return VideoMetadata{}, fmt.Errorf("probe failed: %v: %s", err, string(out))
	}
	
	var res struct {
		Streams []struct {
			NbFrames   string `json:"nb_frames"`
			RFrameRate string `json:"r_frame_rate"`
			Duration   string `json:"duration"`
		} `json:"streams"`
	}
	
	if err := json.Unmarshal(out, &res); err != nil {
		return VideoMetadata{}, fmt.Errorf("unmarshal failed: %v", err)
	}
	
	if len(res.Streams) == 0 {
		return VideoMetadata{}, fmt.Errorf("no video stream found")
	}
	
	// Parse FPS (e.g. "30/1" or "24000/1001")
	fpsParts := strings.Split(res.Streams[0].RFrameRate, "/")
	fps := 30.0
	if len(fpsParts) == 2 {
		num, _ := strconv.ParseFloat(fpsParts[0], 64)
		den, _ := strconv.ParseFloat(fpsParts[1], 64)
		if den != 0 {
			fps = num / den
		}
	}

	frames, _ := strconv.Atoi(res.Streams[0].NbFrames)
	dur, _ := strconv.ParseFloat(res.Streams[0].Duration, 64)
	if frames == 0 {
		frames = int(dur * fps)
	}
	
	return VideoMetadata{
		Frames:   frames,
		FPS:      fps,
		Duration: dur,
	}, nil
}
