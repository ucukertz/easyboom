import './style.css';
import { ProcessJoin, ProcessCut, ProcessBoomerang, ProcessPace, ProbeVideo, SelectFile, DeleteFile, SaveFileAs, ExtractFrame, CopyToTemp, ProcessStabilize } from '../wailsjs/go/main/App';
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
  excludeStart: 0,
  compareMedia: Array(10).fill(null).map(() => ({ path: '', name: '' })),
  videoStates: {}, // Keyed by target id, stores { currentTime, isPlaying }
  pace: 1.0,
  paceAudio: 'scale', // 'scale' or 'repeat'
  boomerangAudio: false,
  consoleCollapsed: true,
  stabilizeWorkers: 1,
  stabilizeThreshold: 0.3,
};

window.toggleConsole = () => {
  state.consoleCollapsed = !state.consoleCollapsed;
  render();
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
window.updateExcludeStart = (val) => {
  state.excludeStart = parseInt(val) || 0;
  render();
};

window.updateBoomerangAudio = (val) => {
  state.boomerangAudio = !!val;
  render();
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
  const trimInfo = isResult && state.activeTab === 'boomerang' && (state.excludeFrames > 0 || state.excludeStart > 0)
    ? `<span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.5rem;">[ -${state.excludeStart}f | -${state.excludeFrames}f ]</span>`
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
         ${!isResult ? `ondrop="window.handleDrop(event, '${target}')" ondragover="window.handleDragOver(event, '${target}')"` : ''}>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; width: 100%;">
         <h3 style="color: var(--accent); margin:0; font-size: 0.8rem;">${headerText}</h3>
         <span style="font-size: 0.7rem; color: var(--text-muted); text-align: right; margin-left: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fileName}</span>
      </div>
      <div class="video-stage">
        ${mediaTag}
      </div>
      <div class="action-bar" style="width: 100%; justify-content: flex-end;">
         ${isResult ? `
           <button class="action-btn btn-save" onclick="window.useAsInput()" style="background: var(--accent); color: var(--bg-dark);">Use as Input</button><button class="action-btn btn-save" onclick="window.saveResult()">Save...</button>
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
      <header class="app-header">
        <div class="app-title-bar">
          <img src="/logo-universal.png" class="app-logo" alt="EasyBoom Logo">
          <span class="app-title">EasyBoom</span>
          <span class="app-version">v1.0.1</span>
        </div>
        <nav class="tabs">
          <button class="tab-btn" onclick="window.switchTab('boomerang')">Boomerang</button>
          <button class="tab-btn" onclick="window.switchTab('cut')">Cut</button>
          <button class="tab-btn" onclick="window.switchTab('join')">Join</button>
          <button class="tab-btn" onclick="window.switchTab('pace')">Pace</button>
          <button class="tab-btn" onclick="window.switchTab('stabilize')">Stabilize</button>
          <button class="tab-btn" onclick="window.switchTab('extract')">Extract</button>
          <button class="tab-btn" onclick="window.switchTab('compare')">Compare</button>
        </nav>
      </header>
      <main class="content">
        <div id="video-workspace" style="display: grid; gap: 1.5rem; align-items: start; margin-bottom: 2rem;"></div>
        <div id="settings-workspace" style="width: 100%; margin-bottom: 2rem;"></div>
      </main>
      <footer class="console-drawer" id="console-drawer">
        <div class="console-header" onclick="window.toggleConsole()">
          <div class="console-title">
            <span class="status-indicator" id="status-indicator"></span>
            <span>Console Log</span>
          </div>
          <button class="console-toggle-btn" id="console-toggle-btn">
            <svg class="chevron-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
        </div>
        <div class="console-body">
          <div class="terminal" id="terminal"></div>
        </div>
      </footer>
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
  const consoleDrawer = document.getElementById('console-drawer');
  if (consoleDrawer) {
    if (state.consoleCollapsed) {
      consoleDrawer.classList.remove('expanded');
    } else {
      consoleDrawer.classList.add('expanded');
    }
  }

  const indicator = document.getElementById('status-indicator');
  if (indicator) {
    indicator.className = 'status-indicator'; // Reset
    if (state.isProcessing) {
      indicator.classList.add('processing');
    } else if (state.output) {
      indicator.classList.add('success');
    } else if (state.logs.some(l => l.includes('error') || l.includes('failed') || l.startsWith('!'))) {
      indicator.classList.add('error');
    }
  }

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
        <div class="dropzone" ondrop="window.handleDrop(event, '${target}')" ondragover="window.handleDragOver(event, '${target}')" onclick="window.pickFile('${target}')">
          <span class="dropzone-icon">+</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">Slot ${index + 1}</span>
        </div>
      `;
    }).join('');
  }

  if (state.activeTab === 'join') {
    return `
      ${state.video1.path ? window.renderVideoPlayer(state.video1.path, state.video1.name, 'input', 'video1') : `
        <div class="dropzone" ondrop="window.handleDrop(event, 'video1')" ondragover="window.handleDragOver(event, 'video1')" onclick="window.pickFile('video1')">
          <span class="dropzone-icon">1</span>
          <span style="color: var(--accent); font-weight: 700;">${file1Name}</span>
        </div>
      `}
      ${state.video2.path ? window.renderVideoPlayer(state.video2.path, state.video2.name, 'input', 'video2') : `
        <div class="dropzone" ondrop="window.handleDrop(event, 'video2')" ondragover="window.handleDragOver(event, 'video2')" onclick="window.pickFile('video2')">
          <span class="dropzone-icon">2</span>
          <span style="color: var(--accent); font-weight: 700;">${file2Name}</span>
        </div>
      `}
    `;
  }

  const iconMap = { 'boomerang': 'B', 'cut': 'C', 'pace': 'P', 'extract': 'F', 'stabilize': 'S' };
  const icon = iconMap[state.activeTab] || '+';
  return `
    ${state.video1.path ?
      window.renderVideoPlayer(state.video1.path, state.video1.name, 'input', 'video1') : `
      <div class="dropzone" ondrop="window.handleDrop(event, 'video1')" ondragover="window.handleDragOver(event, 'video1')" onclick="window.pickFile('video1')">
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
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
               <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                     <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Trim START</label>
                     <span style="font-size: 0.8rem; color: var(--accent); font-family: monospace; font-weight: bold;">${state.excludeStart} frames</span>
                  </div>
                  <input type="range" 
                         value="${state.excludeStart}" 
                         min="0" max="60" 
                         ${!isLoaded ? 'disabled' : ''}
                         oninput="window.updateExcludeStart(this.value)"
                         style="width: 100%; cursor: pointer; opacity: ${!isLoaded ? 0.3 : 1};" />
               </div>

               <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                     <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Trim END</label>
                     <span style="font-size: 0.8rem; color: var(--accent); font-family: monospace; font-weight: bold;">${state.excludeFrames} frames</span>
                  </div>
                  <input type="range" 
                         value="${state.excludeFrames}" 
                         min="0" max="60" 
                         ${!isLoaded ? 'disabled' : ''}
                         oninput="window.updateExcludeFrames(this.value)"
                         style="width: 100%; cursor: pointer; opacity: ${!isLoaded ? 0.3 : 1};" />
               </div>
            </div>
            
            <div style="display: flex; gap: 1.5rem; align-items: center; margin-top: 0.5rem;">
               <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; color: ${state.boomerangAudio ? 'var(--accent)' : 'var(--text-muted)'}; font-size: 0.8rem;">
                  <input type="checkbox" id="boomerangAudioCheck" ${state.boomerangAudio ? 'checked' : ''} onchange="window.updateBoomerangAudio(this.checked)"> Boomerang Audio (Reverse)
               </label>
            </div>
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

  if (state.activeTab === 'extract') {
    const meta = state.video1Meta;
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; align-items: flex-end; gap: 2rem; width: 100%; box-sizing: border-box;">
         <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
               <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Capture Frame</label>
               <span style="font-size: 1rem; color: var(--accent); font-family: monospace; font-weight: bold; background: var(--bg-dark); padding: 0.2rem 0.6rem; border-radius: 4px;">Time: ${state.videoStates['v-video1'] ? window.framesToTime(Math.floor(state.videoStates['v-video1'].currentTime * meta.fps), meta.fps) : '00:00:00.000'}</span>
            </div>
            <div style="color: var(--text-muted); font-size: 0.75rem;">Seek the video to the desired frame and click "Extract Current Frame".</div>
         </div>
         
         <button class="primary-btn" 
                 onclick="window.startProcessing()" 
                 style="min-width: 200px; padding: 1.2rem;"
                 ${isLoaded ? '' : 'disabled'}>
            ${state.isProcessing ? 'Capturing...' : 'Extract Current Frame'}
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

  if (state.activeTab === 'stabilize') {
    const maxWorkers = navigator.hardwareConcurrency || 4;
    const workerOpts = Array.from({length: maxWorkers}, (_, i) =>
      `<option value="${i+1}" ${state.stabilizeWorkers === i+1 ? 'selected' : ''}>${i+1}</option>`
    ).join('');
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;">
         <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Color Stabilization</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">Reinhard transfer — frame 0 is the color reference for every subsequent frame.</div>
            <div style="display: flex; align-items: center; gap: 1.5rem; margin-top: 0.3rem;">
               <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">Workers:</label>
                  <select onchange="window.updateStabilizeWorkers(this.value)"
                          style="background: var(--bg-dark); color: var(--accent); border: 1px solid var(--border); border-radius: 4px; padding: 0.3rem 0.5rem; font-size: 0.8rem; cursor: pointer;">
                     ${workerOpts}
                  </select>
               </div>
               <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                  <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase; white-space: nowrap;">Dark Protect:</label>
                  <input type="range"
                         min="0" max="1" step="0.005"
                         value="${state.stabilizeThreshold}"
                         oninput="window.updateStabilizeThreshold(this.value)"
                         style="flex: 1; cursor: pointer;" />
                  <span style="font-size: 0.75rem; color: var(--accent); font-family: monospace; font-weight: bold; min-width: 2.5rem; text-align: right;">${state.stabilizeThreshold.toFixed(3)}</span>
               </div>
            </div>
         </div>
         <button class="primary-btn" 
                 onclick="window.startProcessing()" 
                 style="min-width: 200px; padding: 1.2rem;"
                 ${canProcess() ? '' : 'disabled'}>
            ${state.isProcessing ? 'Processing...' : 'Run Stabilize'}
         </button>
      </div>
    `;
  }

  if (state.activeTab === 'compare') {
    return `
      <div class="settings-card" style="background: var(--bg-card); padding: 1rem 1.5rem; border-radius: 0.8rem; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;">
         <div style="color: var(--text-muted); font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">Compare View</div>
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

let _pendingDropTarget = '';

// Logic to process dropped files
window.handleDragOver = (e, target) => {
  e.preventDefault();
  _pendingDropTarget = target;
};

window.handleDrop = (e) => {
  e.preventDefault();
};

// Global Actions
window.switchTab = (tab) => {
  state.activeTab = tab;
  state.output = null;
  state.logs = ['> Switched to ' + tab.toUpperCase()];
  state.videoStates = {}; 
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
  state.compareMedia = Array(10).fill(null).map(() => ({ path: '', name: '' }));
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
  state.logs = ['> Starting FFmpeg...'];
  render();

  try {
    let result = '';
    if (state.activeTab === 'join') {
      result = await ProcessJoin(state.video1.path, state.video2.path);
    } else if (state.activeTab === 'cut') {
      result = await ProcessCut(state.video1.path, state.cutStartFrame, state.cutEndFrame);
    } else if (state.activeTab === 'boomerang') {
      result = await ProcessBoomerang(state.video1.path, state.excludeStart, state.excludeFrames, state.boomerangAudio);
    } else if (state.activeTab === 'pace') {
      result = await ProcessPace(state.video1.path, state.pace, state.paceAudio);
    } else if (state.activeTab === 'extract') {
      const videoEl = document.getElementById('v-video1');
      const frameIndex = videoEl ? Math.floor(videoEl.currentTime * state.video1Meta.fps) : 0;
      result = await ExtractFrame(state.video1.path, frameIndex);
    } else if (state.activeTab === 'stabilize') {
      result = await ProcessStabilize(state.video1.path, state.stabilizeWorkers, state.stabilizeThreshold);
    }

    state.output = result; render();
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

window.updateStabilizeWorkers = (val) => {
  state.stabilizeWorkers = parseInt(val) || 1;
  render();
};

window.updateStabilizeThreshold = (val) => {
  state.stabilizeThreshold = parseFloat(val) || 0;
  render();
};

window.useAsInput = async () => {
  if (!state.output) return;
  const path = state.output;
  const name = path.split('\\').pop();
  
  state.video1 = { path, name };
  state.output = null; // Important: Clear output as it's now an input
  state.logs.push(`> Result promoted to Input 1`);
  
  await window.probeVideo('video1');
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

// Register file drop handler via Wails runtime (gives native file paths on WebView2)
runtime.OnFileDrop(async (x, y, paths) => {
  if (!paths || paths.length === 0 || !_pendingDropTarget) return;

  const sourcePath = paths[0];
  const name = sourcePath.split('\\').pop();
  const target = _pendingDropTarget;

  state.logs.push(`> File dropped: ${name}`);
  render();

  try {
    const tempPath = await CopyToTemp(sourcePath, name);

    if (target.includes('compareMedia')) {
      const index = parseInt(target.match(/\[(\d+)\]/)[1]);
      state.compareMedia[index] = { path: tempPath, name };
    } else {
      state[target] = { path: tempPath, name };
    }

    state.logs.push(`> Loaded: ${name} via native copy`);
    render();
    await window.probeVideo(target);
  } catch (err) {
    state.logs.push(`! Error loading file: ${err}`);
  }
}, false); // useDropTarget=false — we track target via _pendingDropTarget
