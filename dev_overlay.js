/**
 * ╔══════════════════════════════════════════════╗
 * ║          DEV OVERLAY TOOL                    ║
 * ║  Press X to toggle • Place elements visually ║
 * ║  All coordinates saved as % of image         ║
 * ╚══════════════════════════════════════════════╝
 * 
 * USAGE:
 *   1. Navigate to an exercise page (with an image showing)
 *   2. Press X to activate the overlay
 *   3. Select a tool type from the sidebar
 *   4. Click & drag on the image to place an element
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
    const rect = overlayEl.getBoundingClientRect();
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
      if (img && img.naturalWidth > 0) return img;
    }
    // 2. Look for any exercise image (journe/JOURNE paths)
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      if (img.src && /journe/i.test(img.src) && img.offsetWidth > 100) return img;
    }
    // 3. Largest visible image
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
      // Fallback: show in prompt
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
        font-size: 13px; overflow-y: auto; overflow-x: hidden;
        box-shadow: -4px 0 30px rgba(0,0,0,0.5);
        transition: transform 0.3s ease; transform: translateX(0);
      }
      #dev-overlay-sidebar.hidden { transform: translateX(100%); pointer-events: none; }
      
      .dov-header {
        padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
      }
      .dov-header h2 { margin: 0; font-size: 16px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
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
      
      /* Overlay canvas */
      #dev-overlay-canvas {
        position: absolute; left: 0; top: 0; width: 100%; height: 100%;
        z-index: 99998; cursor: crosshair;
      }
      
      .dov-placed-el {
        position: absolute; border: 2px solid; border-radius: 4px;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.9);
        text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: auto;
        cursor: pointer; transition: box-shadow 0.15s;
        user-select: none; -webkit-user-select: none;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .dov-placed-el:hover { box-shadow: 0 0 0 2px rgba(255,255,255,0.5); }
      .dov-placed-el.selected { box-shadow: 0 0 0 3px #fff, 0 0 15px rgba(52,152,219,0.5); }
      
      .dov-placed-el .dov-el-id-badge {
        position: absolute; top: 2px; left: 2px; font-size: 9px;
        background: rgba(0,0,0,0.6); padding: 1px 5px; border-radius: 3px;
        color: #fff; font-weight: 700;
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
      <div class="dov-header">
        <h2>🔧 Dev Overlay</h2>
        <button class="dov-close" id="dov-close-btn" title="Close (X)">✕</button>
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
        <kbd>1</kbd>-<kbd>7</kbd> Select tool<br>
        <kbd>Del</kbd> Remove selected<br>
        <kbd>Esc</kbd> Deselect<br>
        Click + drag on image to place<br>
        Click element to select & move
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

    // Image name
    imageNameEl.textContent = getImageName() || '—';

    // Element count
    elementCountEl.textContent = elements.length;

    // Element list
    listContainerEl.innerHTML = '';
    elements.forEach(el => {
      const tool = getToolConfig(el.type);
      const item = document.createElement('div');
      item.className = 'dov-el-item' + (el.id === selectedId ? ' selected' : '');
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

    // Scroll to selected
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

    // Ensure parent has relative positioning
    overlayParent = targetImg.parentElement;
    const parentPos = getComputedStyle(overlayParent).position;
    if (parentPos === 'static' || parentPos === '') {
      overlayParent.style.position = 'relative';
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'dev-overlay-canvas';
    overlayParent.appendChild(overlayEl);

    // Attach mouse events
    overlayEl.addEventListener('mousedown', onMouseDown);
    overlayEl.addEventListener('mousemove', onMouseMove);
    overlayEl.addEventListener('mouseup', onMouseUp);
    overlayEl.addEventListener('click', e => e.stopPropagation());
    overlayEl.addEventListener('contextmenu', e => e.preventDefault());

    // Touch support
    overlayEl.addEventListener('touchstart', onTouchStart, { passive: false });
    overlayEl.addEventListener('touchmove', onTouchMove, { passive: false });
    overlayEl.addEventListener('touchend', onTouchEnd, { passive: false });

    // Load existing data
    loadData();
    renderAllElements();

    return true;
  }

  function removeOverlay() {
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

    // Clear existing rendered elements (keep preview if drawing)
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
      div.appendChild(lbl);
    }

    // Click to select
    div.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      selectElement(el.id);

      // Start moving
      const pos = getRelativePos(e);
      mode = 'moving';
      moveOffset = { x: pos.x - el.left, y: pos.y - el.top };
    });

    div.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      if (mode === 'moving') {
        mode = 'idle';
        saveData();
        renderAllElements();
        updateSidebar();
      }
    });

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
    // Don't add tiny elements (accidental clicks)
    if (width < 1 && height < 1) return;

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
    el.left = round1(Math.max(0, Math.min(100 - el.width, newLeft)));
    el.top = round1(Math.max(0, Math.min(100 - el.height, newTop)));

    // Update the DOM element directly for smooth movement
    const div = overlayEl.querySelector(`[data-el-id="${id}"]`);
    if (div) {
      div.style.left = el.left + '%';
      div.style.top = el.top + '%';
    }
  }

  // ═══════════════════ MOUSE HANDLERS ═══════════════════
  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Check if clicking on an existing element (handled by element's own handler)
    const clickedEl = e.target.closest('.dov-placed-el');
    if (clickedEl) return;

    // Deselect if clicking empty space with a selection
    if (selectedId !== null) {
      deselectAll();
    }

    // Start drawing new element
    const pos = getRelativePos(e);
    mode = 'drawing';
    drawStart = pos;

    // Create preview rectangle
    const tool = getToolConfig(currentTool);
    previewDiv = document.createElement('div');
    previewDiv.className = 'dov-preview-rect';
    previewDiv.style.borderColor = tool.color;
    previewDiv.style.background = tool.bg;
    previewDiv.style.left = pos.x + '%';
    previewDiv.style.top = pos.y + '%';
    previewDiv.style.width = '0%';
    previewDiv.style.height = '0%';
    if (currentTool === 'circle') previewDiv.style.borderRadius = '50%';
    overlayEl.appendChild(previewDiv);
  }

  function onMouseMove(e) {
    e.preventDefault();
    e.stopPropagation();

    if (mode === 'drawing' && previewDiv && drawStart) {
      const pos = getRelativePos(e);
      const rect = normalizeRect(drawStart.x, drawStart.y, pos.x, pos.y);
      previewDiv.style.left = rect.left + '%';
      previewDiv.style.top = rect.top + '%';
      previewDiv.style.width = rect.width + '%';
      previewDiv.style.height = rect.height + '%';
    }

    if (mode === 'moving' && selectedId !== null && moveOffset) {
      const pos = getRelativePos(e);
      moveElement(selectedId, pos.x - moveOffset.x, pos.y - moveOffset.y);
    }
  }

  function onMouseUp(e) {
    e.preventDefault();
    e.stopPropagation();

    if (mode === 'drawing' && drawStart) {
      const pos = getRelativePos(e);
      const rect = normalizeRect(drawStart.x, drawStart.y, pos.x, pos.y);

      // Remove preview
      if (previewDiv) { previewDiv.remove(); previewDiv = null; }

      // Get label from input
      const label = labelInputEl ? labelInputEl.value.trim() : '';

      // Add the element
      addElement(currentTool, label, rect.left, rect.top, rect.width, rect.height);

      // Clear label input
      if (labelInputEl) labelInputEl.value = '';

      drawStart = null;
      mode = 'idle';
    }

    if (mode === 'moving') {
      mode = 'idle';
      saveData();
      updateSidebar();
    }
  }

  // Touch event adapters
  function touchToMouse(e) {
    if (e.touches.length === 0 && e.changedTouches.length > 0) {
      return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY,
               button: 0, preventDefault: () => e.preventDefault(),
               stopPropagation: () => e.stopPropagation(),
               target: document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY) || e.target };
    }
    if (e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY,
               button: 0, preventDefault: () => e.preventDefault(),
               stopPropagation: () => e.stopPropagation(),
               target: document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY) || e.target };
    }
    return null;
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
      // Still show sidebar with an error message
    }

    sidebarEl.classList.remove('hidden');
    active = true;
    updateSidebar();

    // Remove hint
    const hint = document.getElementById('dev-overlay-hint');
    if (hint) hint.style.display = 'none';
  }

  function deactivate() {
    if (!active) return;

    mode = 'idle';
    drawStart = null;
    selectedId = null;
    if (previewDiv) { previewDiv.remove(); previewDiv = null; }

    removeOverlay();

    if (sidebarEl) sidebarEl.classList.add('hidden');
    active = false;

    // Show hint again
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
        // Image changed! Re-create overlay
        removeOverlay();
        createOverlay();
        updateSidebar();
        showStatus('📸 New image detected — loaded data');
      }
    }, 1000);
  }

  // ═══════════════════ KEYBOARD ═══════════════════
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable) return;

    if (e.key.toLowerCase() === ACTIVATE_KEY && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
      return;
    }

    if (!active) return;

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

    // Number keys for quick tool select
    const num = parseInt(e.key);
    if (num >= 1 && num <= TOOLS.length) {
      selectTool(TOOLS[num - 1].id);
    }
  });

  // ═══════════════════ INIT ═══════════════════
  injectStyles();

  // Show activation hint
  const hint = document.createElement('div');
  hint.id = 'dev-overlay-hint';
  hint.innerHTML = 'Press <kbd>X</kbd> to open Dev Overlay';
  document.body.appendChild(hint);

  // Start watching for image changes
  startImageWatch();

  console.log('%c🔧 Dev Overlay loaded — Press X to activate', 
    'background: #0f1117; color: #3498db; padding: 8px 16px; border-radius: 6px; font-weight: bold;');
})();
