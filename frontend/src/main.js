import './style.css';
import { ProcessJoin, ProcessCut, ProcessBoomerang, ProcessPace, ProbeVideo, SelectFile, DeleteFile, SaveFileAs, SaveTemp } from '../wailsjs/go/main/App';
import * as runtime from '../wailsjs/runtime';

// THE IMMOVABLE SHIELD: Block all browser-level navigation globally
window.addEventListener('dragover', (e) => e.preventDefault(), false);
window.addEventListener('drop', (e) => e.preventDefault(), false);

// App State
const state = {
  activeTab: 'boomerang',
  video1: { path: '', name: '' },
  video2: { path: '', name: '' },
  video1Meta: { frames: 0, fps: 0 },
  video2Meta: { frames: 0, fps: 0 },
  cutStartFrame: 0,
  cutEndFrame: 0,
  isProcessing: false,
  logs: [],
  output: null,
  isDragging: false,
  excludeFrames: 0,
  compareMedia: Array(6).fill(null).map(() => ({ path: '', name: '' })),
  videoStates: {}, // Keyed by target id, stores { currentTime, isPlaying }
  pace: 1.0,
  paceAudio: 'scale', // 'scale' or 'repeat'
};

window.framesToTime = (frames, fps) => {
  if (!fps || fps === 0) return "00:00:00.000";
  const totalSeconds = frames / fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 1000);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
};

window.updateExcludeFrames = (val) => {
  state.excludeFrames = parseInt(val) || 0;
  render(); // Re-render to update slider labels
};

window.updateCutFrames = (type, val) => {
  const v = parseInt(val) || 0;
  if (type === 'start') {
    state.cutStartFrame = Math.min(v, state.cutEndFrame - 1);
  } else {
    state.cutEndFrame = Math.max(v, state.cutStartFrame + 1);
  }
  render();
};

window.probeVideo = async (target) => {
  let path = '';
  if (target.includes('compareMedia')) {
    const index = parseInt(target.match(/\[(\d+)\]/)[1]);
    path = state.compareMedia[index].path;
  } else {
    path = state[target].path;
  }

  if (!path) return;

  // Skip probe for images
  const ext = path.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return;

  try {
    const meta = await ProbeVideo(path);
    if (target.includes('compareMedia')) {
      const index = parseInt(target.match(/\[(\d+)\]/)[1]);
      state.compareMedia[index].meta = meta;
    } else {
      state[target + 'Meta'] = meta;
    }

    state.logs.push(`> Probed: ${meta.frames} frames @ ${meta.fps.toFixed(1)} fps`);

    if (target === 'video1' && state.activeTab !== 'compare') {
      state.cutEndFrame = meta.frames || 0;
      state.cutStartFrame = 0;
    }
    render();
  } catch (err) {
    state.logs.push(`! Probe failed: ${err}`);
  }
};

window.renderVideoPlayer = (path, name, type = 'input', target = '') => {
  const isResult = type === 'result';
  const trimInfo = isResult && state.activeTab === 'boomerang' && state.excludeFrames > 0
    ? `<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.5rem;">[ -${state.excludeFrames} f ]</span>`
    : '';
  const headerText = isResult ? `Success! Output Ready ${trimInfo}` : `Input: ${target.toUpperCase().replace('VIDEO', 'Video ')}`;
  const fileName = name || (path ? path.split('\\').pop() : '');

  const ext = path ? path.split('.').pop().toLowerCase() : '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  const mediaTag = isImage ?
    `<img src="/preview/${path}" style="width: 100%; height: 100%; object-fit: contain;">` :
    `<video id="v-${target}" src="/preview/${path}" controls loop onclick="event.stopPropagation()"></video>`;

  return `
    <div class="${isResult ? 'result-box' : 'dropzone has-video'}" 
         ${!isResult ? `ondrop="window.handleDrop(event, '${target}')" ondragover="window.handleDragOver(event)"` : ''}>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; width: 100%;">
         <h3 style="color: var(--accent); margin:0; font-size: 0.8rem;">${headerText}</h3>
         <span style="font-size: 0.7rem; color: var(--text-muted); text-align: right; margin-left: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fileName}</span>
      </div>
      <div class="video-stage">
        ${mediaTag}
      </div>
      <div class="action-bar" style="width: 100%; justify-content: flex-end;">
         ${isResult ? `
           <button class="action-btn btn-save" onclick="window.saveResult()">Save...</button>
           <button class="action-btn btn-discard" onclick="window.discardResult()">Discard</button>
         ` : `
           <button class="action-btn btn-discard" onclick="window.clearVideo(event, '${target}')">Clear</button>
         `}
      </div>
    </div>
  `;
};

function captureVideoStates() {
  document.querySelectorAll('video').forEach(v => {
    if (v.id) {
      state.videoStates[v.id] = {
        currentTime: v.currentTime,
        isPlaying: !v.paused
      };
    }
  });
}

function restoreVideoStates() {
  Object.keys(state.videoStates).forEach(id => {
    const v = document.getElementById(id);
    if (v) {
      const saved = state.videoStates[id];
      v.currentTime = saved.currentTime;
      if (saved.isPlaying) {
        v.play().catch(e => console.warn("Autoplay block or playback interrupted:", e));
      }
    }
  });
}

function render() {
  captureVideoStates();
  const app = document.querySelector('#app');

  // 1. Structural Initialization (Run once, never replace the scrolls again)
  if (!app.querySelector('.content')) {
    app.innerHTML = `
      <header class="tabs" style="display: flex; gap: 1rem; padding: 1rem 2rem; background: var(--bg-card); border-bottom: 1px solid var(--border); -webkit-app-region: drag;">
        <button class="tab-btn" onclick="window.switchTab('boomerang')">Boomerang</button>
        <button class="tab-btn" onclick="window.switchTab('cut')">Cut</button>
        <button class="tab-btn" onclick="window.switchTab('join')">Join</button>
        <button class="tab-btn" onclick="window.switchTab('pace')">Pace</button>
        <button class="tab-btn" onclick="window.switchTab('compare')">Compare (6X)</button>
      </header>
      <main class="content">
        <div id="video-workspace" style="display: grid; gap: 1.5rem; align-items: start; margin-bottom: 2rem;"></div>
        <div id="settings-workspace" style="width: 100%; margin-bottom: 2rem;"></div>
        <div class="footer-controls" style="border-top: 1px solid var(--border); padding-top: 1rem;">
          <div class="terminal" id="terminal"></div>
        </div>
      </main>
    `;
  }

  // 2. Tab Highlights (Fast CSS-only update)
  app.querySelectorAll('.tab-btn').forEach(btn => {
    // Match the tab name from the onclick attribute string
    const onclickStr = btn.getAttribute('onclick');
    if (onclickStr && onclickStr.includes(`'${state.activeTab}'`)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 3. Update Video Stage
  const videoStage = document.getElementById('video-workspace');
  videoStage.style.gridTemplateColumns = state.activeTab === 'compare' ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(380px, 1fr))';
  
  const videoInputHTML = renderTabInputs();
  const videoResultHTML = (state.output && state.activeTab !== 'compare') 
                           ? window.renderVideoPlayer(state.output, state.output.split('\\').pop(), 'result') 
                           : '';
  videoStage.innerHTML = videoInputHTML + videoResultHTML;

  // 4. Update Settings Layer
  document.getElementById('settings-workspace').innerHTML = renderTabSettings();

  // 5. Update Logs (Surgical terminal update)
  const terminal = document.getElementById('terminal');
  if (terminal) {
    const logHTML = state.logs.length === 0 ? '> Ready.' : state.logs.map(log => `<div>${log}</div>`).join('');
    // Only update if logs changed to avoid unnecessary repaint
    if (terminal.innerHTML !== logHTML) {
      terminal.innerHTML = logHTML;
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  restoreVideoStates();
}

function renderTabInputs() {
  const file1Name = state.video1.name || 'Drop Video Here';
  const file2Name = state.video2.name || 'Drop Video Here';

  if (state.activeTab === 'compare') {
    return state.compareMedia.map((media, index) => {
      const target = `compareMedia[${index}]`;
      if (media.path) {
        return window.renderVideoPlayer(media.path, media.name, 'input', target);
      }
      return `
        <div class="dropzone" ondrop="window.handleDrop(event, '${target}')" ondragover="window.handleDragOver(event)" onclick="window.pickFile('${target}')">
          <span class="dropzone-icon">+</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">Slot ${index + 1}</span>
        </div>
      `;
    }).join('');
  }

  if (state.activeTab === 'join') {
    return `
      ${state.video1.path ? window.renderVideoPlayer(state.video1.path, state.video1.name, 'input', 'video1') : `
        <div class="dropzone" ondrop="window.handleDrop(event, 'video1')" ondragover="window.handleDragOver(event)" onclick="window.pickFile('video1')">
          <span class="dropzone-icon">1</span>
          <span style="color: var(--accent); font-weight: 700;">${file1Name}</span>
        </div>
      `}
      ${state.video2.path ? window.renderVideoPlayer(state.video2.path, state.video2.name, 'input', 'video2') : `
        <div class="dropzone" ondrop="window.handleDrop(event, 'video2')" ondragover="window.handleDragOver(event)" onclick="window.pickFile('video2')">
          <span class="dropzone-icon">2</span>
          <span style="color: var(--accent); font-weight: 700;">${file2Name}</span>
        </div>
      `}
    `;
  }

  const iconMap = { 'boomerang': 'B', 'cut': 'C', 'pace': 'P' };
  const icon = iconMap[state.activeTab] || '+';
  return `
    ${state.video1.path ?
      window.renderVideoPlayer(state.video1.path, state.video1.name, 'input', 'video1') : `
      <div class="dropzone" ondrop="window.handleDrop(event, 'video1')" ondragover="window.handleDragOver(event)" onclick="window.pickFile('video1')">
        <span class="dropzone-icon">${icon}</span>
        <span style="color: var(--accent); font-weight: 700;">${file1Name}</span>
      </div>
    `}
  `;
}

function renderTabSettings() {
  const isLoaded = !!state.video1.path;

  if (state.activeTab === 'boomerang') {
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; align-items: flex-end; gap: 2rem; width: 100%; box-sizing: border-box;">
         <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
               <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Boomerang Trim: Exclude Frozen Frames</label>
               <span style="font-size: 1rem; color: var(--accent); font-family: monospace; font-weight: bold; background: var(--bg-dark); padding: 0.2rem 0.6rem; border-radius: 4px;">${state.excludeFrames} frames</span>
            </div>
            <input type="range" 
                   value="${state.excludeFrames}" 
                   min="0" max="60" 
                   ${!isLoaded ? 'disabled' : ''}
                   oninput="window.updateExcludeFrames(this.value)"
                   style="width: 100%; cursor: pointer; opacity: ${!isLoaded ? 0.3 : 1};" />
         </div>
         
         <button class="primary-btn" 
                 onclick="window.startProcessing()" 
                 style="min-width: 200px; padding: 1.2rem;"
                 ${canProcess() ? '' : 'disabled'}>
           ${state.isProcessing ? 'Processing...' : 'Run Boomerang'}
         </button>
      </div>
    `;
  }

  if (state.activeTab === 'cut') {
    const meta = state.video1Meta;
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; align-items: flex-end; gap: 2rem; width: 100%; box-sizing: border-box;">
         <div style="flex: 1; display: flex; flex-direction: column; gap: 1.5rem;">
            <h3 style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase; margin: 0;">Clip Boundary Adjustment</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
              <div style="width: 100%;">
                 <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                   <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold;">START: Frame ${state.cutStartFrame}</label>
                   <span style="font-size: 0.7rem; color: var(--accent); font-family: monospace;">${window.framesToTime(state.cutStartFrame, meta.fps)}</span>
                 </div>
                 <input type="range" 
                        value="${state.cutStartFrame}" 
                        min="0" max="${meta.frames || 0}" 
                        ${!isLoaded ? 'disabled' : ''}
                        oninput="window.updateCutFrames('start', this.value)"
                        style="width: 100%; cursor: pointer;" />
              </div>
              <div style="width: 100%;">
                 <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                   <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold;">END: Frame ${state.cutEndFrame}</label>
                   <span style="font-size: 0.7rem; color: var(--accent); font-family: monospace;">${window.framesToTime(state.cutEndFrame, meta.fps)}</span>
                 </div>
                 <input type="range" 
                        value="${state.cutEndFrame}" 
                        min="0" max="${meta.frames || 0}" 
                        ${!isLoaded ? 'disabled' : ''}
                        oninput="window.updateCutFrames('end', this.value)"
                        style="width: 100%; cursor: pointer;" />
              </div>
            </div>
         </div>

         <button class="primary-btn" 
                 onclick="window.startProcessing()" 
                 style="min-width: 200px; padding: 1.2rem;"
                 ${canProcess() ? '' : 'disabled'}>
            ${state.isProcessing ? 'Processing...' : 'Run Cut'}
         </button>
      </div>
    `;
  }

  if (state.activeTab === 'pace') {
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; align-items: flex-end; gap: 2rem; width: 100%; box-sizing: border-box;">
         <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
               <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Playback Velocity</label>
               <span style="font-size: 1rem; color: var(--accent); font-family: monospace; font-weight: bold; background: var(--bg-dark); padding: 0.2rem 0.6rem; border-radius: 4px;">x${state.pace.toFixed(1)}</span>
            </div>
            <input type="range" 
                   value="${state.pace}" 
                   min="0.1" max="5.0" step="0.1"
                   ${!isLoaded ? 'disabled' : ''}
                   oninput="window.updatePace(this.value)"
                   style="width: 100%; cursor: pointer; opacity: ${!isLoaded ? 0.3 : 1};" />
            
            <div style="display: flex; gap: 1.5rem; align-items: center; margin-top: 0.5rem;">
               <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Audio Handling:</span>
               <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; color: ${state.paceAudio === 'scale' ? 'var(--accent)' : 'var(--text-muted)'}; font-size: 0.8rem;">
                  <input type="radio" name="paceAudio" value="scale" ${state.paceAudio === 'scale' ? 'checked' : ''} onchange="window.updatePaceAudio(this.value)"> Scale Speed
               </label>
               <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; color: ${state.paceAudio === 'repeat' ? 'var(--accent)' : 'var(--text-muted)'}; font-size: 0.8rem;">
                  <input type="radio" name="paceAudio" value="repeat" ${state.paceAudio === 'repeat' ? 'checked' : ''} onchange="window.updatePaceAudio(this.value)"> Loop Original
               </label>
            </div>
         </div>
         
         <button class="primary-btn" 
                 onclick="window.startProcessing()" 
                 style="min-width: 200px; padding: 1.2rem;"
                 ${canProcess() ? '' : 'disabled'}>
           ${state.isProcessing ? 'Processing...' : 'Run Pace'}
         </button>
      </div>
    `;
  }

  if (state.activeTab === 'join') {
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;">
         <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">Sequence: Input 1 + Input 2</div>
         <button class="primary-btn" 
                 onclick="window.startProcessing()" 
                 style="min-width: 200px; padding: 1.2rem;"
                 ${canProcess() ? '' : 'disabled'}>
            ${state.isProcessing ? 'Processing...' : 'Run Join'}
         </button>
      </div>
    `;
  }

  if (state.activeTab === 'compare') {
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1rem 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;">
         <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">Compare View: Up to 6 slots</div>
         <button class="action-btn btn-discard" onclick="window.clearAllCompare()">Clear All Slots</button>
      </div>
    `;
  }

  return '';
}

function canProcess() {
  if (state.isProcessing) return false;
  if (state.activeTab === 'cut') return !!state.video1.path;
  if (state.activeTab === 'join') return !!state.video1.path && !!state.video2.path;
  return !!state.video1.path;
}

// Logic to process dropped files like "savenum"
window.handleDragOver = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

window.handleDrop = async (e, target) => {
  e.preventDefault();
  e.stopPropagation();

  const file = e.dataTransfer.files[0];
  if (!file) return;

  state.logs.push(`> Reading file: ${file.name}...`);
  render();

  const reader = new FileReader();
  reader.onload = async (event) => {
    const arrayBuffer = event.target.result;
    const bytes = new Uint8Array(arrayBuffer);

    try {
      // Send raw bytes to Go backend
      const tempPath = await SaveTemp(Array.from(bytes), file.name);
      if (target.includes('compareMedia')) {
        const index = parseInt(target.match(/\[(\d+)\]/)[1]);
        state.compareMedia[index] = { path: tempPath, name: file.name };
      } else {
        state[target] = { path: tempPath, name: file.name };
      }
      state.logs.push(`> Loaded into temp storage: ${file.name}`);

      // Render IMMEDIATELY after file is saved
      render();

      // Then probe in background if it's a video
      await window.probeVideo(target);
    } catch (err) {
      state.logs.push(`! Error loading data: ${err}`);
    }
  };
  reader.readAsArrayBuffer(file);
};

// Global Actions
window.switchTab = (tab) => {
  state.activeTab = tab;
  state.video1 = { path: '', name: '' };
  state.video2 = { path: '', name: '' };
  state.output = null;
  state.logs = ['> Switched to ' + tab.toUpperCase()];
  state.videoStates = {}; // Full reset on tab switch
  render();
};

window.pickFile = async (target) => {
  const path = await SelectFile();
  if (path) {
    const name = path.split('\\').pop();
    if (target.includes('compareMedia')) {
      const index = parseInt(target.match(/\[(\d+)\]/)[1]);
      state.compareMedia[index] = { path, name };
    } else {
      state[target] = { path, name };
    }
    state.logs.push(`> Selected: ${name}`);
    await window.probeVideo(target);
    render();
  }
};

window.clearVideo = (e, target) => {
  e.stopPropagation();
  delete state.videoStates[`v-${target}`]; // Clear state for this slot
  if (target.includes('compareMedia')) {
    const index = parseInt(target.match(/\[(\d+)\]/)[1]);
    state.compareMedia[index] = { path: '', name: '' };
  } else {
    state[target] = { path: '', name: '' };
  }
  render();
};

window.clearAllCompare = () => {
  state.compareMedia = Array(6).fill(null).map(() => ({ path: '', name: '' }));
  render();
};

window.saveResult = async () => {
  if (!state.output) return;
  try {
    const newPath = await SaveFileAs(state.output);
    if (newPath) {
      state.logs.push(`> Result saved successfully: ${newPath}`);
      state.output = null;
      render();
    }
  } catch (err) {
    state.logs.push(`! Save failed: ${err}`);
  }
};

window.discardResult = async () => {
  if (!state.output) return;
  try {
    await DeleteFile(state.output);
    state.logs.push(`> Discarded.`);
    state.output = null;
    render();
  } catch (err) {
    state.logs.push(`! Delete failed: ${err}`);
  }
};

window.startProcessing = async () => {
  state.isProcessing = true;
  state.output = null;
  state.logs = ['> Starting FFmpeg...'];
  render();

  try {
    let result = '';
    if (state.activeTab === 'join') {
      result = await ProcessJoin(state.video1.path, state.video2.path);
    } else if (state.activeTab === 'cut') {
      result = await ProcessCut(state.video1.path, state.cutStartFrame, state.cutEndFrame);
    } else if (state.activeTab === 'boomerang') {
      result = await ProcessBoomerang(state.video1.path, state.excludeFrames);
    } else if (state.activeTab === 'pace') {
      result = await ProcessPace(state.video1.path, state.pace, state.paceAudio);
    }

    state.output = result;
    state.logs.push(`> Final result at ${result}`);
  } catch (err) {
    state.logs.push(`! FFmpeg error: ${err}`);
  } finally {
    state.isProcessing = false;
    render();
  }
};

window.updatePace = (val) => {
  state.pace = parseFloat(val);
  render();
};

window.updatePaceAudio = (val) => {
  state.paceAudio = val;
  render();
};

// INITIALIZATION
render();

// FFmpeg Real-time Logs
runtime.EventsOn("ffmpeg-log", (line) => {
  state.logs.push(line);
  if (state.logs.length > 200) state.logs.shift();
  const terminal = document.getElementById('terminal');
  if (terminal) {
    terminal.innerHTML = state.logs.map(log => `<div style="margin-bottom: 2px;">${log}</div>`).join('');
    terminal.scrollTop = terminal.scrollHeight;
  }
});
