package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

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
