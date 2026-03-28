import './style.css';
import {ProcessJoin, ProcessCut, ProcessBoomerang, SelectFile} from '../wailsjs/go/main/App';
import * as runtime from '../wailsjs/runtime';

// App State
const state = {
  activeTab: 'boomerang',
  video1: '', // Path string
  video2: '',
  isProcessing: false,
  logs: [],
  output: null,
};

// UI Components
const components = {
  app: document.querySelector('#app'),
};

function render() {
  components.app.innerHTML = `
    <header class="tabs">
      <button class="tab-btn ${state.activeTab === 'boomerang' ? 'active' : ''}" onclick="window.switchTab('boomerang')">Boomerang</button>
      <button class="tab-btn ${state.activeTab === 'cut' ? 'active' : ''}" onclick="window.switchTab('cut')">Cut</button>
      <button class="tab-btn ${state.activeTab === 'join' ? 'active' : ''}" onclick="window.switchTab('join')">Join</button>
    </header>

    <main class="content">
      <div id="tab-view">
        ${renderActiveTab()}
      </div>

      <div class="controls">
        <button id="process-btn" 
                class="primary-btn" 
                onclick="window.startProcessing()"
                ${canProcess() ? '' : 'disabled'}>
          ${state.isProcessing ? 'Processing...' : 'Run ' + state.activeTab.toUpperCase()}
        </button>
      </div>

      <div class="terminal" id="terminal">
        ${state.logs.length === 0 ? '> Ready.' : state.logs.map(log => `<div>${log}</div>`).join('')}
      </div>

      ${state.output ? `
        <div class="result-box" style="margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 2rem;">
          <h2 style="color: var(--accent);">Final Output</h2>
          <video src="${runtime.BrowserOpenFile(state.output)}" controls autoplay style="max-width: 100%; border: 2px solid var(--accent); border-radius: 1rem;"></video>
          <div style="margin-top: 1rem; color: var(--text-muted);">Saved to: ${state.output}</div>
        </div>
      ` : ''}
    </main>
  `;
}

function renderActiveTab() {
  const file1Name = state.video1 ? state.video1.split('\\').pop() : 'No file selected';
  const file2Name = state.video2 ? state.video2.split('\\').pop() : 'No file selected';

  if (state.activeTab === 'boomerang') {
    return `
      <div class="dropzone-container">
        <div class="dropzone" onclick="window.pickFile('video1')">
          <span class="dropzone-icon">🪃</span>
          <span style="color: var(--accent); font-weight: 700;">${file1Name}</span>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Click to choose video</p>
        </div>
      </div>
    `;
  }
  
  if (state.activeTab === 'cut') {
    return `
      <div class="dropzone-container">
        <div class="dropzone" onclick="window.pickFile('video1')">
          <span style="color: var(--accent); font-weight: 700;">${file1Name}</span>
          <div class="time-inputs" style="margin-top: 1rem; display: flex; gap: 1rem;" onclick="event.stopPropagation()">
             <div style="display:flex; flex-direction:column; align-items:start;">
                <label style="font-size: 0.7rem; color: var(--text-muted);">Start</label>
                <input type="text" id="start-time" value="00:00:00" style="background: var(--bg-card); color: white; border: 1px solid var(--border); padding: 0.5rem; border-radius: 4px;" />
             </div>
             <div style="display:flex; flex-direction:column; align-items:start;">
                <label style="font-size: 0.7rem; color: var(--text-muted);">End</label>
                <input type="text" id="end-time" value="00:00:10" style="background: var(--bg-card); color: white; border: 1px solid var(--border); padding: 0.5rem; border-radius: 4px;" />
             </div>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 1rem;">Click to choose video</p>
        </div>
      </div>
    `;
  }

  if (state.activeTab === 'join') {
    return `
      <div class="dropzone-container">
        <div class="dropzone" onclick="window.pickFile('video1')">
          <span style="color: var(--accent); font-weight: 700;">${file1Name}</span>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Video 1 (Click to pick)</p>
        </div>
        <div class="dropzone" onclick="window.pickFile('video2')">
          <span style="color: var(--accent); font-weight: 700;">${file2Name}</span>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Video 2 (Click to pick)</p>
        </div>
      </div>
    `;
  }
}

function canProcess() {
  if (state.isProcessing) return false;
  if (state.activeTab === 'cut') return !!state.video1;
  if (state.activeTab === 'join') return !!state.video1 && !!state.video2;
  return !!state.video1;
}

// Global Actions
window.switchTab = (tab) => {
  state.activeTab = tab;
  state.video1 = '';
  state.video2 = '';
  state.output = null;
  state.logs = ['> Switched to ' + tab.toUpperCase()];
  render();
};

window.pickFile = async (target) => {
  const path = await SelectFile();
  if (path) {
    state[target] = path;
    const name = path.split('\\').pop();
    state.logs.push(`> Selected: ${name}`);
    render();
  }
};

window.startProcessing = async () => {
  state.isProcessing = true;
  state.output = null;
  state.logs = ['> Working...'];
  render();

  try {
    let result = '';
    if (state.activeTab === 'join') {
      result = await ProcessJoin(state.video1, state.video2);
    } else if (state.activeTab === 'cut') {
      const start = document.getElementById('start-time').value;
      const end = document.getElementById('end-time').value;
      result = await ProcessCut(state.video1, start, end);
    } else if (state.activeTab === 'boomerang') {
      result = await ProcessBoomerang(state.video1);
    }
    
    state.output = result;
    state.logs.push(`> Finished! Saved to ${result}`);
  } catch (err) {
    state.logs.push(`! ERROR: ${err}`);
  } finally {
    state.isProcessing = false;
    render();
  }
};

// Initial Render
render();

// Event Listeners
runtime.EventsOn("ffmpeg-log", (line) => {
  state.logs.push(line);
  if (state.logs.length > 200) state.logs.shift();
  const terminal = document.getElementById('terminal');
  if (terminal) {
    terminal.innerHTML = state.logs.map(log => `<div style="margin-bottom: 2px;">${log}</div>`).join('');
    terminal.scrollTop = terminal.scrollHeight;
  }
});
