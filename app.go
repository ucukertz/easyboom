package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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

// getOutputPath returns a timestamped path in the output directory
func (a *App) getOutputPath(prefix string) string {
	cwd, _ := os.Getwd()
	outputDir := filepath.Join(cwd, "output")
	_ = os.MkdirAll(outputDir, 0755)
	timestamp := time.Now().Format("20060102_150405")
	return filepath.Join(outputDir, fmt.Sprintf("%s_%s.mp4", prefix, timestamp))
}

// ProcessJoin concatenates two videos
func (a *App) ProcessJoin(input1, input2 string) (string, error) {
	output := a.getOutputPath("join")
	// Use concat filter
	args := []string{
		"-i", input1,
		"-i", input2,
		"-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
		"-map", "[v]",
		"-map", "[a]",
		"-y", output,
	}
	err := a.executeFFmpeg(args)
	return output, err
}

// ProcessCut trims a video
func (a *App) ProcessCut(input, start, end string) (string, error) {
	output := a.getOutputPath("cut")
	args := []string{
		"-i", input,
		"-ss", start,
		"-to", end,
		"-c", "copy",
		"-y", output,
	}
	err := a.executeFFmpeg(args)
	return output, err
}

// ProcessBoomerang creates a forward-backward loop
func (a *App) ProcessBoomerang(input string) (string, error) {
	output := a.getOutputPath("boomerang")
	// For a simple boomerang: [0:v]reverse[r];[0:v][r]concat=n=2:v=1[v]
	args := []string{
		"-i", input,
		"-filter_complex", "[0:v]reverse[r];[0:v][r]concat=n=2:v=1[v]",
		"-map", "[v]",
		"-y", output,
	}
	err := a.executeFFmpeg(args)
	return output, err
}
