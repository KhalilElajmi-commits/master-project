/**
 * ╔══════════════════════════════════════════════╗
 * ║          DEV OVERLAY TOOL                    ║
 * ║  Press X to toggle • Place elements visually ║
 * ║  All coordinates saved as % of image         ║
 * ╚══════════════════════════════════════════════╝
 * 
 * USAGE:
 *   1. Navigate to an exercise or map page
 *   2. Press X to activate the overlay
 *   3. Select a tool type from the sidebar
 *   4. Click & drag anywhere (inside or outside the box) to place an element
 *   5. Type a label for the element (optional)
 *   6. Export JSON when done → share with the developer
 *   7. Press X again to deactivate
 *
 * KEYBOARD SHORTCUTS:
 *   X        → Toggle overlay on/off
 *   Delete   → Remove selected element
 *   Escape   → Deselect / cancel drawing
 *   1-7      → Quick-select tool
 */
(function DevOverlay() {
  'use strict';

  // ═══════════════════ CONFIG ═══════════════════
  const ACTIVATE_KEY = 'x';
  const STORAGE_PREFIX = 'devOverlay_';

  const TOOLS = [
    { id: 'box',         label: '📦 Box',       color: '#3498db', bg: 'rgba(52,152,219,0.25)',  key: '1' },
    { id: 'circle',      label: '⭕ Circle',    color: '#9b59b6', bg: 'rgba(155,89,182,0.25)',  key: '2' },
    { id: 'input',       label: '✏️ Input',     color: '#2ecc71', bg: 'rgba(46,204,113,0.25)',  key: '3' },
    { id: 'underline',   label: '〰️ Underline', color: '#e74c3c', bg: 'rgba(231,76,60,0.25)',   key: '4' },
    { id: 'match-left',  label: '◀ Match L',    color: '#2980b9', bg: 'rgba(41,128,185,0.25)',  key: '5' },
    { id: 'match-right', label: '▶ Match R',    color: '#e67e22', bg: 'rgba(230,126,34,0.25)',  key: '6' },
    { id: 'result',      label: '📝 Result',    color: '#1abc9c', bg: 'rgba(26,188,156,0.25)',  key: '7' },
  ];

  // ═══════════════════ STATE ═══════════════════
  let active = false;
  let currentTool = 'box';
  let elements = [];
  let selectedId = null;
  let nextId = 1;

  // Drawing state
  let mode = 'idle'; // idle | drawing | moving
  let drawStart = null;
  let moveOffset = null;
  let previewDiv = null;

  // DOM refs
  let sidebarEl = null;
  let overlayEl = null;
  let screenCaptureEl = null;
  let targetImg = null;
  let overlayParent = null;
  let listContainerEl = null;
  let labelInputEl = null;
  let imageNameEl = null;
  let elementCountEl = null;
  let statusEl = null;

  // ═══════════════════ UTILS ═══════════════════
  const round1 = v => Math.round(v * 10) / 10;
  const getToolConfig = id => TOOLS.find(t => t.id === id) || TOOLS[0];

  function getRelativePos(e) {
    const ref = targetImg || overlayEl;
    if (!ref) return { x: 0, y: 0 };
    const rect = ref.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: round1(((e.clientX - rect.left) / rect.width) * 100),
      y: round1(((e.clientY - rect.top) / rect.height) * 100)
    };
  }

  function normalizeRect(x1, y1, x2, y2) {
    return {
      left: round1(Math.min(x1, x2)),
      top: round1(Math.min(y1, y2)),
      width: round1(Math.abs(x2 - x1)),
      height: round1(Math.abs(y2 - y1))
    };
  }

  // ═══════════════════ IMAGE DETECTION ═══════════════════
  function findExerciseImage() {
    // 1. Look inside exercise-content-area
    const area = document.getElementById('exercise-content-area');
    if (area) {
      const img = area.querySelector('img');
      if (img && (img.naturalWidth > 0 || img.offsetWidth > 50)) return img;
    }
    // 2. Look for any exercise image (journe/JOURNE paths)
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      if (img.src && /journe/i.test(img.src) && img.offsetWidth > 100) return img;
    }
    // 3. Map background or largest visible image
    const bgMap = document.getElementById('initial-bg');
    if (bgMap && bgMap.offsetWidth > 200 && bgMap.style.display !== 'none') return bgMap;

    let best = null, bestArea = 0;
    allImgs.forEach(img => {
      const a = img.offsetWidth * img.offsetHeight;
      if (a > bestArea && img.offsetWidth > 200) { best = img; bestArea = a; }
    });
    return best;
  }

  function getImageName() {
    if (!targetImg) return 'unknown';
    const src = decodeURIComponent(targetImg.src);
    const parts = src.split('/');
    return parts.slice(-2).join('/').replace(/\.(png|jpg|jpeg|jfif|webp)$/i, '');
  }

  function getStorageKey() {
    return STORAGE_PREFIX + getImageName().replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // ═══════════════════ PERSISTENCE ═══════════════════
  function saveData() {
    try {
      const data = { elements, nextId };
      localStorage.setItem(getStorageKey(), JSON.stringify(data));
    } catch (e) { console.warn('DevOverlay: save failed', e); }
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (raw) {
        const data = JSON.parse(raw);
        elements = data.elements || [];
        nextId = data.nextId || (elements.length ? Math.max(...elements.map(e => e.id)) + 1 : 1);
      } else {
        elements = [];
        nextId = 1;
      }
    } catch (e) {
      elements = [];
      nextId = 1;
    }
  }

  function clearData() {
    elements = [];
    nextId = 1;
    selectedId = null;
    localStorage.removeItem(getStorageKey());
    renderAllElements();
    updateSidebar();
    showStatus('✓ All elements cleared');
  }

  // ═══════════════════ EXPORT ═══════════════════
  function buildExportJSON() {
    return JSON.stringify({
      image: getImageName(),
      exported_at: new Date().toISOString(),
      element_count: elements.length,
      elements: elements.map(el => ({
        id: el.id,
        type: el.type,
        label: el.label || '',
        left: el.left,
        top: el.top,
        width: el.width,
        height: el.height
      }))
    }, null, 2);
  }

  function copyJSON() {
    const json = buildExportJSON();
    navigator.clipboard.writeText(json).then(() => {
      showStatus('✓ JSON copied to clipboard!');
    }).catch(() => {
      prompt('Copy this JSON:', json);
    });
  }

  function downloadJSON() {
    const json = buildExportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'overlay_' + getImageName().replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('✓ JSON file downloaded!');
  }

  // ═══════════════════ STYLES ═══════════════════
  function injectStyles() {
    if (document.getElementById('dev-overlay-styles')) return;
    const style = document.createElement('style');
    style.id = 'dev-overlay-styles';
    style.textContent = `
      #dev-overlay-sidebar {
        position: fixed; right: 0; top: 0; bottom: 0; width: 310px;
        background: rgba(15, 17, 23, 0.96); backdrop-filter: blur(12px);
        border-left: 2px solid rgba(255,255,255,0.1);
        z-index: 100000; color: #e0e0e0;
        font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px; overflow-y: auto; overflow-x: visible;
        box-shadow: -4px 0 30px rgba(0,0,0,0.5);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); transform: translateX(0);
        user-select: none;
      }
      #dev-overlay-sidebar.hidden { transform: translateX(100%); pointer-events: none; }
      #dev-overlay-sidebar.collapsed { transform: translateX(100%); }

      /* Retract / collapse tab button sticking out to the left of the sidebar */
      #dov-retract-btn {
        position: absolute;
        left: -38px;
        top: 14px;
        width: 38px;
        height: 42px;
        background: #1f2430;
        border: 2px solid rgba(255,255,255,0.2);
        border-right: none;
        border-radius: 10px 0 0 10px;
        color: #3498db;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: -4px 2px 12px rgba(0,0,0,0.4);
        transition: background 0.2s, color 0.2s, transform 0.2s;
        z-index: 100001;
        pointer-events: auto !important;
      }
      #dov-retract-btn:hover {
        background: #3498db;
        color: #ffffff;
      }
      #dev-overlay-sidebar.collapsed #dov-retract-btn {
        color: #2ecc71;
      }
      
      .dov-header {
        padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
      }
      .dov-header h2 { margin: 0; font-size: 16px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
      .dov-collapse-btn { background: #34495e; border: none; color: #ecf0f1; width: 28px; height: 28px;
        border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s; }
      .dov-collapse-btn:hover { background: #2c3e50; color: #3498db; }
      .dov-close { background: #e74c3c; border: none; color: white; width: 28px; height: 28px;
        border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s; }
      .dov-close:hover { background: #c0392b; }
      
      .dov-section { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .dov-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 1.5px; color: rgba(255,255,255,0.4); margin-bottom: 10px; }
      
      .dov-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .dov-tool-btn {
        padding: 8px 6px; border: 2px solid transparent; border-radius: 8px;
        background: rgba(255,255,255,0.06); color: #ccc; font-size: 12px;
        cursor: pointer; text-align: center; transition: all 0.15s;
        font-weight: 600; white-space: nowrap;
      }
      .dov-tool-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
      .dov-tool-btn.active { border-color: var(--tool-color); color: #fff;
        background: rgba(255,255,255,0.1); box-shadow: 0 0 12px rgba(var(--tool-rgb),0.3); }
      
      .dov-label-input {
        width: 100%; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.15);
        border-radius: 8px; background: rgba(255,255,255,0.06); color: #fff;
        font-size: 13px; outline: none; font-family: inherit;
        transition: border-color 0.15s;
      }
      .dov-label-input:focus { border-color: #3498db; }
      .dov-label-input::placeholder { color: rgba(255,255,255,0.3); }
      
      .dov-image-name { color: #f39c12; font-family: 'Cascadia Code', 'Fira Code', monospace;
        font-size: 12px; word-break: break-all; }
      
      .dov-element-list { max-height: 300px; overflow-y: auto; scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.2) transparent; }
      .dov-element-list::-webkit-scrollbar { width: 5px; }
      .dov-element-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
      
      .dov-el-item {
        padding: 8px 10px; margin-bottom: 4px; border-radius: 8px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
        cursor: pointer; transition: all 0.15s; position: relative;
      }
      .dov-el-item:hover { background: rgba(255,255,255,0.08); }
      .dov-el-item.selected { border-color: #3498db; background: rgba(52,152,219,0.15); }
      .dov-el-item .dov-el-type { font-size: 11px; font-weight: 700; margin-bottom: 2px; }
      .dov-el-item .dov-el-label { font-size: 12px; color: #f1c40f; }
      .dov-el-item .dov-el-coords { font-size: 10px; font-family: 'Cascadia Code', 'Fira Code', monospace;
        color: rgba(255,255,255,0.5); margin-top: 3px; }
      .dov-el-delete {
        position: absolute; right: 6px; top: 6px; width: 22px; height: 22px;
        border: none; border-radius: 4px; background: rgba(231,76,60,0.2);
        color: #e74c3c; cursor: pointer; font-size: 12px;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.15s, background 0.15s;
      }
      .dov-el-item:hover .dov-el-delete { opacity: 1; }
      .dov-el-delete:hover { background: rgba(231,76,60,0.5); color: #fff; }
      
      .dov-actions { display: flex; flex-direction: column; gap: 8px; }
      .dov-btn {
        padding: 10px; border: none; border-radius: 8px; cursor: pointer;
        font-size: 13px; font-weight: 600; font-family: inherit;
        transition: all 0.15s; display: flex; align-items: center;
        justify-content: center; gap: 6px;
      }
      .dov-btn-copy { background: rgba(52,152,219,0.2); color: #3498db; }
      .dov-btn-copy:hover { background: rgba(52,152,219,0.35); }
      .dov-btn-export { background: rgba(46,204,113,0.2); color: #2ecc71; }
      .dov-btn-export:hover { background: rgba(46,204,113,0.35); }
      .dov-btn-clear { background: rgba(231,76,60,0.15); color: #e74c3c; }
      .dov-btn-clear:hover { background: rgba(231,76,60,0.3); }
      
      .dov-footer { padding: 14px 18px; color: rgba(255,255,255,0.3); font-size: 11px; line-height: 1.6; }
      .dov-footer kbd { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;
        font-family: inherit; font-size: 10px; border: 1px solid rgba(255,255,255,0.15); }
      
      .dov-status { padding: 8px 18px; background: rgba(46,204,113,0.15); color: #2ecc71;
        font-size: 12px; font-weight: 600; text-align: center;
        transition: opacity 0.3s; }
      .dov-status.error { background: rgba(231,76,60,0.15); color: #e74c3c; }
      
      /* Fullscreen capture layer to allow drawing outside the box */
      #dev-overlay-screen-capture {
        position: fixed; inset: 0; width: 100vw; height: 100vh;
        z-index: 99990; cursor: crosshair; pointer-events: auto;
      }

      /* Overlay canvas on image */
      #dev-overlay-canvas {
        position: absolute; left: 0; top: 0; width: 100%; height: 100%;
        z-index: 99998; cursor: crosshair; overflow: visible !important;
        pointer-events: auto;
      }
      
      .dov-placed-el {
        position: absolute; border: 2px solid; border-radius: 4px;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.9);
        text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: auto;
        cursor: grab; transition: box-shadow 0.15s;
        user-select: none; -webkit-user-select: none;
        overflow: visible; white-space: nowrap; z-index: 10;
      }
      .dov-placed-el:active { cursor: grabbing; }
      .dov-placed-el:hover { box-shadow: 0 0 0 2px rgba(255,255,255,0.6); z-index: 15; }
      .dov-placed-el.selected { box-shadow: 0 0 0 3px #fff, 0 0 15px rgba(52,152,219,0.6); z-index: 20; }
      
      .dov-placed-el .dov-el-id-badge {
        position: absolute; top: 2px; left: 2px; font-size: 9px;
        background: rgba(0,0,0,0.6); padding: 1px 5px; border-radius: 3px;
        color: #fff; font-weight: 700; pointer-events: none;
      }
      
      .dov-preview-rect {
        position: absolute; border: 2px dashed; border-radius: 4px;
        pointer-events: none; z-index: 99999;
      }
      
      /* Activation hint */
      #dev-overlay-hint {
        position: fixed; bottom: 12px; right: 12px; z-index: 99997;
        background: rgba(15,17,23,0.85); color: rgba(255,255,255,0.6);
        padding: 6px 14px; border-radius: 8px; font-size: 11px;
        font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
        border: 1px solid rgba(255,255,255,0.1);
        pointer-events: none; backdrop-filter: blur(8px);
      }
      #dev-overlay-hint kbd { background: rgba(255,255,255,0.15); padding: 2px 8px;
        border-radius: 4px; font-weight: 700; border: 1px solid rgba(255,255,255,0.2); }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════ SIDEBAR ═══════════════════
  function createSidebar() {
    if (sidebarEl) return;
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'dev-overlay-sidebar';
    sidebarEl.classList.add('hidden');

    sidebarEl.innerHTML = `
      <!-- Retract Tab Button -->
      <button id="dov-retract-btn" title="Retract / Expand Sidebar (Click to work under sidebar)">▶</button>
      <div class="dov-header">
        <h2>🔧 Dev Overlay</h2>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="dov-collapse-btn" id="dov-collapse-header-btn" title="Collapse / Hide Sidebar (Press H or Tab)">─</button>
          <button class="dov-close" id="dov-close-btn" title="Close (X)">✕</button>
        </div>
      </div>
      <div id="dov-status-bar" class="dov-status" style="display:none"></div>
      <div class="dov-section">
        <div class="dov-section-title">Tool</div>
        <div class="dov-tools" id="dov-tools-grid"></div>
      </div>
      <div class="dov-section">
        <div class="dov-section-title">Label for next element</div>
        <input type="text" class="dov-label-input" id="dov-label-input"
          placeholder="e.g. pa, btn_start, kilo..." />
      </div>
      <div class="dov-section">
        <div class="dov-section-title">
          Image: <span class="dov-image-name" id="dov-image-name">—</span>
        </div>
        <div class="dov-section-title" style="margin-top:8px">
          Elements (<span id="dov-el-count">0</span>)
        </div>
        <div class="dov-element-list" id="dov-el-list"></div>
      </div>
      <div class="dov-section dov-actions">
        <button class="dov-btn dov-btn-copy" id="dov-btn-copy">📋 Copy JSON</button>
        <button class="dov-btn dov-btn-export" id="dov-btn-export">💾 Download JSON</button>
        <button class="dov-btn dov-btn-clear" id="dov-btn-clear">🗑️ Clear All Elements</button>
      </div>
      <div class="dov-footer">
        <kbd>X</kbd> Toggle overlay<br>
        <kbd>H</kbd> / <kbd>Tab</kbd> Collapse sidebar<br>
        <kbd>1</kbd>-<kbd>7</kbd> Select tool<br>
        <kbd>Del</kbd> Remove selected<br>
        <kbd>Esc</kbd> Deselect<br>
        Click + drag anywhere to place<br>
        Drag even outside box to capture margins!
      </div>
    `;

    document.body.appendChild(sidebarEl);

    // Tool buttons
    const grid = document.getElementById('dov-tools-grid');
    TOOLS.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = 'dov-tool-btn';
      btn.textContent = tool.label;
      btn.style.setProperty('--tool-color', tool.color);
      btn.dataset.toolId = tool.id;
      if (tool.id === currentTool) btn.classList.add('active');
      btn.onclick = () => selectTool(tool.id);
      grid.appendChild(btn);
    });

    // Refs
    labelInputEl = document.getElementById('dov-label-input');
    listContainerEl = document.getElementById('dov-el-list');
    imageNameEl = document.getElementById('dov-image-name');
    elementCountEl = document.getElementById('dov-el-count');
    statusEl = document.getElementById('dov-status-bar');

    function toggleSidebarCollapse() {
      if (!sidebarEl) return;
      const isCollapsed = sidebarEl.classList.toggle('collapsed');
      const retractBtn = document.getElementById('dov-retract-btn');
      if (retractBtn) {
        retractBtn.textContent = isCollapsed ? '◀' : '▶';
        retractBtn.title = isCollapsed ? 'Expand Sidebar (H or Tab)' : 'Retract Sidebar (H or Tab)';
      }
      showStatus(isCollapsed ? 'Sidebar collapsed (Press H or Tab to show)' : 'Sidebar expanded');
    }

    const retractBtn = document.getElementById('dov-retract-btn');
    if (retractBtn) {
      retractBtn.onclick = (e) => {
        e.stopPropagation();
        toggleSidebarCollapse();
      };
    }

    const collapseHdrBtn = document.getElementById('dov-collapse-header-btn');
    if (collapseHdrBtn) {
      collapseHdrBtn.onclick = (e) => {
        e.stopPropagation();
        toggleSidebarCollapse();
      };
    }

    // Button handlers
    document.getElementById('dov-close-btn').onclick = deactivate;
    document.getElementById('dov-btn-copy').onclick = copyJSON;
    document.getElementById('dov-btn-export').onclick = downloadJSON;
    document.getElementById('dov-btn-clear').onclick = () => {
      if (elements.length === 0) return;
      if (confirm('Clear ALL elements for this page?')) clearData();
    };

    // Prevent keyboard shortcut when typing in label
    labelInputEl.addEventListener('keydown', e => e.stopPropagation());
  }

  function selectTool(toolId) {
    currentTool = toolId;
    const btns = sidebarEl.querySelectorAll('.dov-tool-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.toolId === toolId);
    });
  }

  function showStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'dov-status' + (isError ? ' error' : '');
    statusEl.style.display = 'block';
    clearTimeout(statusEl._timer);
    statusEl._timer = setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  }

  function updateSidebar() {
    if (!listContainerEl) return;

    imageNameEl.textContent = getImageName() || '—';
    elementCountEl.textContent = elements.length;
    listContainerEl.innerHTML = '';

    if (elements.length === 0) {
      listContainerEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);padding:12px 0;text-align:center;font-size:12px;">No elements placed yet.<br>Click & drag on image to create one.</div>';
      return;
    }

    elements.forEach(el => {
      const tool = getToolConfig(el.type);
      const item = document.createElement('div');
      item.className = 'dov-el-item' + (el.id === selectedId ? ' selected' : '');
      item.dataset.elId = el.id;

      item.innerHTML = `
        <div class="dov-el-type" style="color:${tool.color}">
          ${tool.label} #${el.id}
        </div>
        ${el.label ? `<div class="dov-el-label">"${el.label}"</div>` : ''}
        <div class="dov-el-coords">L:${el.left} T:${el.top} W:${el.width} H:${el.height}</div>
        <button class="dov-el-delete" title="Delete">🗑</button>
      `;

      item.onclick = (e) => {
        if (e.target.closest('.dov-el-delete')) return;
        selectElement(el.id);
      };

      item.querySelector('.dov-el-delete').onclick = (e) => {
        e.stopPropagation();
        removeElement(el.id);
      };

      listContainerEl.appendChild(item);
    });

    const sel = listContainerEl.querySelector('.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ═══════════════════ OVERLAY ═══════════════════
  function createOverlay() {
    if (overlayEl) removeOverlay();

    targetImg = findExerciseImage();
    if (!targetImg) {
      showStatus('No exercise image found!', true);
      return false;
    }

    // Ensure parent has relative positioning and allows overflow
    overlayParent = targetImg.parentElement;
    const parentPos = getComputedStyle(overlayParent).position;
    if (parentPos === 'static' || parentPos === '') {
      overlayParent.style.position = 'relative';
    }
    overlayParent.style.overflow = 'visible';

    // 1. Overlay container directly on the image/card
    overlayEl = document.createElement('div');
    overlayEl.id = 'dev-overlay-canvas';
    overlayParent.appendChild(overlayEl);

    // 2. Fullscreen capture layer to allow starting/finishing clicks outside the activity box
    screenCaptureEl = document.createElement('div');
    screenCaptureEl.id = 'dev-overlay-screen-capture';
    document.body.appendChild(screenCaptureEl);

    // Attach listeners
    screenCaptureEl.addEventListener('mousedown', onMouseDown);
    overlayEl.addEventListener('mousedown', onMouseDown);

    // Global window listeners so dragging outside the box NEVER drops the event!
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);

    // Touch support
    screenCaptureEl.addEventListener('touchstart', onTouchStart, { passive: false });
    overlayEl.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });

    // Load existing data
    loadData();
    renderAllElements();

    return true;
  }

  function removeOverlay() {
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('touchmove', onTouchMove, true);
    window.removeEventListener('touchend', onTouchEnd, true);

    if (screenCaptureEl) {
      screenCaptureEl.remove();
      screenCaptureEl = null;
    }
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    targetImg = null;
    overlayParent = null;
  }

  // ═══════════════════ ELEMENT RENDERING ═══════════════════
  function renderAllElements() {
    if (!overlayEl) return;

    overlayEl.querySelectorAll('.dov-placed-el').forEach(e => e.remove());
    elements.forEach(el => renderSingleElement(el));
  }

  function renderSingleElement(el) {
    if (!overlayEl) return;
    const tool = getToolConfig(el.type);

    const div = document.createElement('div');
    div.className = 'dov-placed-el' + (el.id === selectedId ? ' selected' : '');
    div.dataset.elId = el.id;
    div.style.left = el.left + '%';
    div.style.top = el.top + '%';
    div.style.width = el.width + '%';
    div.style.height = el.height + '%';
    div.style.background = tool.bg;
    div.style.borderColor = tool.color;

    if (el.type === 'circle') {
      div.style.borderRadius = '50%';
    }

    // ID badge
    const badge = document.createElement('span');
    badge.className = 'dov-el-id-badge';
    badge.textContent = '#' + el.id;
    div.appendChild(badge);

    // Label text
    if (el.label) {
      const lbl = document.createElement('span');
      lbl.textContent = el.label;
      lbl.style.zIndex = '1';
      lbl.style.fontSize = '12px';
      lbl.style.padding = '0 4px';
      div.appendChild(lbl);
    }

    // Click & Drag to select and move
    function startElementDrag(e) {
      e.stopPropagation();
      e.preventDefault();

      // Highlight selected without full re-render (which would destroy the DOM node mid-drag)
      selectedId = el.id;
      if (overlayEl) {
        overlayEl.querySelectorAll('.dov-placed-el').forEach(d => {
          if (parseInt(d.dataset.elId, 10) === el.id) {
            d.classList.add('selected');
          } else {
            d.classList.remove('selected');
          }
        });
      }
      updateSidebar();

      const pos = getRelativePos(e);
      mode = 'moving';
      moveOffset = { x: pos.x - el.left, y: pos.y - el.top };
    }

    div.addEventListener('mousedown', startElementDrag);
    div.addEventListener('touchstart', (e) => {
      const m = touchToMouse(e);
      if (m) startElementDrag(m);
    }, { passive: false });

    overlayEl.appendChild(div);
  }

  function selectElement(id) {
    selectedId = id;
    renderAllElements();
    updateSidebar();
  }

  function deselectAll() {
    selectedId = null;
    renderAllElements();
    updateSidebar();
  }

  // ═══════════════════ ELEMENT MANAGEMENT ═══════════════════
  function addElement(type, label, left, top, width, height) {
    if (width < 0.3 && height < 0.3) return;

    const el = {
      id: nextId++,
      type,
      label: label || '',
      left: round1(left),
      top: round1(top),
      width: round1(Math.max(width, 0.5)),
      height: round1(Math.max(height, 0.5))
    };

    elements.push(el);
    selectedId = el.id;
    saveData();
    renderAllElements();
    updateSidebar();
    showStatus(`✓ Added ${getToolConfig(type).label} #${el.id}`);
  }

  function removeElement(id) {
    elements = elements.filter(e => e.id !== id);
    if (selectedId === id) selectedId = null;
    saveData();
    renderAllElements();
    updateSidebar();
    showStatus('✓ Element deleted');
  }

  function moveElement(id, newLeft, newTop) {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    // Allow positioning outside the box (-100% to 200%)
    el.left = round1(Math.max(-100, Math.min(200, newLeft)));
    el.top = round1(Math.max(-100, Math.min(200, newTop)));

    const div = overlayEl ? overlayEl.querySelector(`[data-el-id="${id}"]`) : null;
    if (div) {
      div.style.left = el.left + '%';
      div.style.top = el.top + '%';
    }
  }

  // ═══════════════════ MOUSE / TOUCH HANDLERS ═══════════════════
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest('#dev-overlay-sidebar')) return;

    // Check if clicking on an existing element (handled by element's own mousedown)
    const clickedEl = e.target && e.target.closest('.dov-placed-el');
    if (clickedEl) return;

    e.preventDefault();

    if (selectedId !== null) {
      deselectAll();
    }

    const pos = getRelativePos(e);
    mode = 'drawing';
    drawStart = pos;

    const tool = getToolConfig(currentTool);
    if (previewDiv) previewDiv.remove();
    previewDiv = document.createElement('div');
    previewDiv.className = 'dov-preview-rect';
    previewDiv.style.borderColor = tool.color;
    previewDiv.style.background = tool.bg;
    previewDiv.style.left = pos.x + '%';
    previewDiv.style.top = pos.y + '%';
    previewDiv.style.width = '0%';
    previewDiv.style.height = '0%';
    if (currentTool === 'circle') previewDiv.style.borderRadius = '50%';
    
    if (overlayEl) overlayEl.appendChild(previewDiv);
  }

  function onMouseMove(e) {
    if (mode === 'idle') return;

    if (mode === 'drawing' && previewDiv && drawStart) {
      e.preventDefault();
      const pos = getRelativePos(e);
      const rect = normalizeRect(drawStart.x, drawStart.y, pos.x, pos.y);
      previewDiv.style.left = rect.left + '%';
      previewDiv.style.top = rect.top + '%';
      previewDiv.style.width = rect.width + '%';
      previewDiv.style.height = rect.height + '%';
    }

    if (mode === 'moving' && selectedId !== null && moveOffset) {
      e.preventDefault();
      const pos = getRelativePos(e);
      moveElement(selectedId, pos.x - moveOffset.x, pos.y - moveOffset.y);
    }
  }

  function onMouseUp(e) {
    if (mode === 'drawing' && drawStart) {
      e.preventDefault();
      const pos = getRelativePos(e);
      const rect = normalizeRect(drawStart.x, drawStart.y, pos.x, pos.y);

      if (previewDiv) { previewDiv.remove(); previewDiv = null; }

      const label = labelInputEl ? labelInputEl.value.trim() : '';
      addElement(currentTool, label, rect.left, rect.top, rect.width, rect.height);

      if (labelInputEl) labelInputEl.value = '';

      drawStart = null;
      mode = 'idle';
    }

    if (mode === 'moving') {
      mode = 'idle';
      moveOffset = null;
      saveData();
      renderAllElements();
      updateSidebar();
    }
  }

  // Touch event adapters
  function touchToMouse(e) {
    const t = (e.touches && e.touches.length > 0) ? e.touches[0] : (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null);
    if (!t) return null;
    return {
      clientX: t.clientX, clientY: t.clientY,
      button: 0,
      preventDefault: () => { if (e.cancelable) e.preventDefault(); },
      stopPropagation: () => e.stopPropagation(),
      target: document.elementFromPoint(t.clientX, t.clientY) || e.target
    };
  }

  function onTouchStart(e) { const m = touchToMouse(e); if (m) onMouseDown(m); }
  function onTouchMove(e) { const m = touchToMouse(e); if (m) onMouseMove(m); }
  function onTouchEnd(e) { const m = touchToMouse(e); if (m) onMouseUp(m); }

  // ═══════════════════ ACTIVATION ═══════════════════
  function activate() {
    if (active) return;

    injectStyles();
    createSidebar();

    const ok = createOverlay();
    if (!ok) {
      // Sidebar shows status
    }

    sidebarEl.classList.remove('hidden');
    sidebarEl.classList.remove('collapsed');
    const retractBtn = document.getElementById('dov-retract-btn');
    if (retractBtn) {
      retractBtn.textContent = '▶';
      retractBtn.title = 'Retract Sidebar (Hide to work underneath)';
    }
    active = true;
    updateSidebar();

    const hint = document.getElementById('dev-overlay-hint');
    if (hint) hint.style.display = 'none';
  }

  function deactivate() {
    if (!active) return;

    mode = 'idle';
    drawStart = null;
    moveOffset = null;
    selectedId = null;
    if (previewDiv) { previewDiv.remove(); previewDiv = null; }

    removeOverlay();

    if (sidebarEl) sidebarEl.classList.add('hidden');
    active = false;

    const hint = document.getElementById('dev-overlay-hint');
    if (hint) hint.style.display = '';
  }

  function toggle() {
    if (active) deactivate(); else activate();
  }

  // Watch for image changes while active
  let watchInterval = null;
  function startImageWatch() {
    if (watchInterval) return;
    watchInterval = setInterval(() => {
      if (!active) return;
      const newImg = findExerciseImage();
      if (newImg && newImg !== targetImg) {
        removeOverlay();
        createOverlay();
        updateSidebar();
        showStatus('📸 New image detected — loaded data');
      }
    }, 1000);
  }

  // ═══════════════════ KEYBOARD ═══════════════════
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable) return;

    if (e.key.toLowerCase() === ACTIVATE_KEY && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
      return;
    }

    if (!active) return;

    // H or Tab to collapse / expand sidebar
    if (e.key.toLowerCase() === 'h' || e.key === 'Tab') {
      e.preventDefault();
      if (sidebarEl) {
        const isCollapsed = sidebarEl.classList.toggle('collapsed');
        const retractBtn = document.getElementById('dov-retract-btn');
        if (retractBtn) {
          retractBtn.textContent = isCollapsed ? '◀' : '▶';
          retractBtn.title = isCollapsed ? 'Expand Sidebar (H or Tab)' : 'Retract Sidebar (H or Tab)';
        }
        showStatus(isCollapsed ? 'Sidebar collapsed (hidden)' : 'Sidebar expanded');
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId !== null) {
        e.preventDefault();
        removeElement(selectedId);
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (mode === 'drawing') {
        if (previewDiv) { previewDiv.remove(); previewDiv = null; }
        mode = 'idle';
        drawStart = null;
      } else {
        deselectAll();
      }
    }

    const num = parseInt(e.key);
    if (num >= 1 && num <= TOOLS.length) {
      selectTool(TOOLS[num - 1].id);
    }
  });

  // ═══════════════════ INIT ═══════════════════
  injectStyles();

  const hint = document.createElement('div');
  hint.id = 'dev-overlay-hint';
  hint.innerHTML = 'Press <kbd>X</kbd> to open Dev Overlay';
  document.body.appendChild(hint);

  startImageWatch();

  console.log('%c🔧 Dev Overlay loaded — Press X to activate', 
    'background: #0f1117; color: #3498db; padding: 8px 16px; border-radius: 6px; font-weight: bold;');
})();
