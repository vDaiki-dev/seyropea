// Interfaz de escritorio: paneles, lienzo Canvas2D, diálogos locales y atajos.
import { api } from './api.js';
import { BLEND_MODES } from './document.js';
import { escapeHtml, clamp, formatBytes, downloadText, cloneImageData } from './util.js';

const SHORTCUTS = [
  ['V', 'Mover'], ['M', 'Marco rectangular'], ['L', 'Lazo'], ['W', 'Varita mágica'],
  ['C', 'Recortar'], ['I', 'Cuentagotas'], ['B', 'Pincel'], ['E', 'Borrador'],
  ['G', 'Relleno'], ['T', 'Texto'], ['U', 'Formas'], ['H', 'Mano'], ['Z', 'Zoom'],
  ['Ctrl + N', 'Nuevo documento'], ['Ctrl + O', 'Abrir imagen'], ['Ctrl + S', 'Guardar .seyro'],
  ['Ctrl + Shift + S', 'Guardar como'], ['Ctrl + Alt + Shift + S', 'Exportar imagen'],
  ['Ctrl + Z', 'Deshacer'], ['Ctrl + Shift + Z', 'Rehacer'], ['Ctrl + T', 'Transformar'],
  ['Ctrl + K', 'Preferencias y temas'], ['Ctrl + 0', 'Ajustar a pantalla'], ['Ctrl + 1', 'Píxeles reales'],
  ['Ctrl + R', 'Reglas'], ["Ctrl + '", 'Cuadrícula'], ['Espacio', 'Mano temporal'],
];

export class UI {
  constructor(editor) {
    this.editor = editor;
    this.canvas = null;
    this.ctx = null;
    this._raf = 0;
    this._lastAction = new Map();
    this._cursor = null;
    this.modal = null;
  }

  get doc() { return this.editor.doc; }
  get tools() { return this.editor.tools; }
  get settings() { return this.editor.settings; }

  mount() {
    this.canvas = document.getElementById('editor-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.viewport = document.getElementById('viewport');
    this.toolbarEl = document.getElementById('toolbar');
    this.optionsEl = document.getElementById('tool-options');
    this.tabsEl = document.getElementById('tabs');
    this.layersEl = document.getElementById('layers');
    this.historyEl = document.getElementById('history');
    this.statusEl = document.getElementById('status');
    this.fgInput = document.getElementById('fg-color');
    this.bgInput = document.getElementById('bg-color');
    this.fgSwatch = document.getElementById('fg-swatch');
    this.bgSwatch = document.getElementById('bg-swatch');

    this.buildToolbar();
    this.bindDock();
    this.bindCanvas();
    this.bindKeyboard();
    new ResizeObserver(() => this.scheduleRender()).observe(this.viewport);
    this.renderAll();
  }

  /* ---------- Construcción y eventos ---------- */

  buildToolbar() {
    this.toolbarEl.innerHTML = this.tools.list().map((tool) => `
      <button class="tool-btn" data-tool="${tool.id}" title="${escapeHtml(tool.label)} (${tool.key || 'Ctrl+T'})">
        ${tool.icon}<small>${tool.key || ''}</small>
      </button>`).join('');
    this.toolbarEl.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.tools.setTool(btn.dataset.tool));
    });
  }

  bindDock() {
    document.getElementById('undo-btn').addEventListener('click', () => this.editor.undo());
    document.getElementById('redo-btn').addEventListener('click', () => this.editor.redo());
    document.getElementById('layer-add').addEventListener('click', () => this.editor.addLayer());
    document.getElementById('layer-dup').addEventListener('click', () => this.editor.duplicateLayer());
    document.getElementById('layer-up').addEventListener('click', () => {
      if (this.doc) { this.doc.moveLayer(this.doc.activeLayerId, 1); this.renderLayers(); }
    });
    document.getElementById('layer-down').addEventListener('click', () => {
      if (this.doc) { this.doc.moveLayer(this.doc.activeLayerId, -1); this.renderLayers(); }
    });
    document.getElementById('layer-del').addEventListener('click', () => this.editor.deleteLayer());

    this.fgInput.addEventListener('input', (e) => {
      this.editor.state.fgColor = e.target.value;
      this.updateColorControls();
    });
    this.bgInput.addEventListener('input', (e) => {
      this.editor.state.bgColor = e.target.value;
      this.updateColorControls();
    });
    document.getElementById('swap-colors').addEventListener('click', () => {
      const { fgColor, bgColor } = this.editor.state;
      this.editor.state.fgColor = bgColor;
      this.editor.state.bgColor = fgColor;
      this.updateColorControls();
    });

    this.layersEl.addEventListener('click', (e) => {
      const row = e.target.closest('.layer-row');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('[data-toggle="visible"]')) {
        const layer = this.doc.layerById(id);
        if (layer) { layer.visible = !layer.visible; this.doc.invalidate(); this.renderLayers(); }
        return;
      }
      if (e.target.closest('[data-toggle="lock"]')) {
        const layer = this.doc.layerById(id);
        if (layer) { layer.locked = !layer.locked; this.renderLayers(); }
        return;
      }
      this.doc.setActiveLayer(id);
      this.renderLayers();
    });
    this.layersEl.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.layer-row');
      if (!row || e.target.closest('button')) return;
      const layer = this.doc.layerById(row.dataset.id);
      if (!layer) return;
      const name = window.prompt('Nombre de la capa', layer.name);
      if (name) this.editor.setLayerProperty(layer.id, 'name', name.slice(0, 60));
    });
    this.layersEl.addEventListener('change', (e) => {
      const layer = this.doc?.activeLayer();
      if (!layer) return;
      if (e.target.matches('[data-layer="blend"]')) this.editor.setLayerProperty(layer.id, 'blend', e.target.value);
      if (e.target.matches('[data-layer="opacity"]')) {
        this.editor.setLayerProperty(layer.id, 'opacity', Number(e.target.value) / 100);
      }
    });
    this.historyEl.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item');
      if (!item) return;
      this.jumpHistory(Number(item.dataset.index));
    });
  }

  bindCanvas() {
    const ctxFor = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const raw = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const point = this.screenToDoc(raw.x, raw.y);
      return { ...point, raw, event };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this._spacePan = e.button === 1 || this._spaceDown;
      if (this._spacePan) {
        this._panStart = { raw: { x: e.clientX, y: e.clientY }, pan: { x: this.doc.panX, y: this.doc.panY } };
        return;
      }
      this.tools.dispatch('onDown', ctxFor(e));
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const ctx = ctxFor(e);
      this._cursor = ctx;
      this.renderStatus();
      if (this._spacePan && this._panStart) {
        this.doc.panX = this._panStart.pan.x + e.clientX - this._panStart.raw.x;
        this.doc.panY = this._panStart.pan.y + e.clientY - this._panStart.raw.y;
        this.scheduleRender();
        return;
      }
      if (e.buttons) this.tools.dispatch('onMove', ctx);
      this.scheduleRender();
    });
    const end = (e) => {
      if (this._spacePan) {
        this._spacePan = false;
        this._panStart = null;
        return;
      }
      this.tools.dispatch('onUp', ctxFor(e));
      this.renderLayers();
      this.renderHistory();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('dblclick', () => {
      if (this.editor.state.cropRect) this.editor.cropDocument(this.editor.state.cropRect);
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        this.doc.panX -= e.deltaY;
      } else {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const rect = this.canvas.getBoundingClientRect();
        this.doc.setZoom(this.doc.zoom * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      this.renderStatus();
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.modal) {
        if (e.key === 'Escape') this.modal.close();
        return;
      }
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.code === 'Space') {
        this._spaceDown = true;
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const k = e.key.toLowerCase();
        const map = {
          n: 'file.new', o: 'file.open', s: e.altKey ? 'file.export' : (e.shiftKey ? 'file.saveAs' : 'file.save'),
          w: 'file.close', q: 'file.quit', z: e.shiftKey ? 'edit.redo' : 'edit.undo',
          x: 'edit.cut', c: 'edit.copy', v: 'edit.paste', k: 'edit.preferences',
          t: 'edit.transform', r: 'view.rulers', '0': 'view.fit', '1': 'view.actual',
          '+': 'view.zoomIn', '=': 'view.zoomIn', '-': 'view.zoomOut', "'": 'view.grid',
        };
        const action = map[k];
        if (action) {
          e.preventDefault();
          this.runAction(action);
          return;
        }
      }
      if (e.key === 'Delete' && this.doc?.selectionRect) {
        const layer = this.doc.activeLayer();
        if (layer && !layer.locked) {
          const before = layer.imageData();
          const data = layer.imageData();
          const rect = this.doc.selectionRect;
          const local = {
            x: Math.max(0, rect.x - layer.x), y: Math.max(0, rect.y - layer.y),
            width: Math.min(layer.width - Math.max(0, rect.x - layer.x), rect.width),
            height: Math.min(layer.height - Math.max(0, rect.y - layer.y), rect.height),
          };
          if (local.width > 0 && local.height > 0) {
            injectClear(data, local);
            layer.putImageData(data);
            this.editor.commitPixels('Borrar selección', layer, before);
          }
        }
        return;
      }
      if (e.key === 'Enter' && this.editor.state.cropRect) {
        this.editor.cropDocument(this.editor.state.cropRect);
        return;
      }
      const tool = this.tools.fromKey(e.key);
      if (tool && !mod) {
        e.preventDefault();
        this.tools.setTool(tool);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this._spaceDown = false;
    });
  }

  runAction(action) {
    const now = performance.now();
    if (now - (this._lastAction.get(action) || 0) < 250) return;
    this._lastAction.set(action, now);
    this.editor.handleMenuAction(action);
  }

  /* ---------- Render ---------- */

  renderAll() {
    this.renderToolbar();
    this.renderToolOptions();
    this.renderTabs();
    this.renderLayers();
    this.renderHistory();
    this.updateColorControls();
    this.updateTitle();
    this.renderStatus();
    this.scheduleRender();
  }

  renderToolbar() {
    this.toolbarEl.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === this.tools.current);
    });
  }

  renderToolOptions() {
    const tool = this.tools.currentTool();
    if (!tool?.options?.length) {
      this.optionsEl.innerHTML = `<span class="opt-title">${escapeHtml(tool?.label || '')}</span>
        <span class="hint">Sin opciones configurables</span>`;
      return;
    }
    const options = this.editor.toolOptions[tool.id] || {};
    this.optionsEl.innerHTML = `<span class="opt-title">${escapeHtml(tool.label)}</span>` + tool.options.map((o) => {
      const value = options[o.key] ?? o.value;
      let control;
      if (o.type === 'range') {
        control = `<input type="range" data-option="${o.key}" min="${o.min}" max="${o.max}" step="${o.step ?? 1}" value="${value}">
          <output data-output="${o.key}">${value}</output>`;
      } else if (o.type === 'check') {
        control = `<input type="checkbox" data-option="${o.key}" ${value ? 'checked' : ''}>`;
      } else if (o.type === 'select') {
        control = `<select data-option="${o.key}">${o.choices.map(([v, l]) =>
          `<option value="${v}" ${v === value ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
      } else if (o.type === 'font') {
        const fonts = this.editor.theme?.fonts?.length ? this.editor.theme.fonts : ['sans-serif', 'serif', 'monospace'];
        control = `<select data-option="${o.key}">${fonts.map((f) =>
          `<option value="${escapeHtml(f)}" ${f === value ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select>`;
      } else if (o.type === 'color') {
        control = `<input type="color" data-option="${o.key}" value="${escapeHtml(value || '#ffffff')}">`;
      } else {
        control = `<input type="text" data-option="${o.key}" value="${escapeHtml(value || '')}" size="24">`;
      }
      return `<span class="opt-group"><label>${escapeHtml(o.label)}</label>${control}</span>`;
    }).join('');
    this.optionsEl.querySelectorAll('[data-option]').forEach((input) => {
      const key = input.dataset.option;
      const handler = () => {
        let value;
        if (input.type === 'checkbox') value = input.checked;
        else if (input.type === 'range') value = Number(input.value);
        else value = input.value;
        options[key] = value;
        const output = this.optionsEl.querySelector(`[data-output="${key}"]`);
        if (output) output.textContent = value;
        if (tool.id === 'transform' && key === 'angle' && this.editor.state.transform) {
          this.editor.state.transform.angle = value;
          this.scheduleRender();
        }
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
  }

  renderTabs() {
    if (!this.editor.docs.length) {
      this.tabsEl.innerHTML = '';
      return;
    }
    this.tabsEl.innerHTML = this.editor.docs.map((doc) => `
      <div class="tab ${doc === this.doc ? 'active' : ''}" data-doc="${doc.id}">
        <span>${escapeHtml(doc.name)}${doc.dirty ? '*' : ''}</span>
        <button class="close" data-close="${doc.id}" title="Cerrar">×</button>
      </div>`).join('');
    this.tabsEl.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) return;
        this.editor.doc = this.editor.docs.find((d) => d.id === tab.dataset.doc);
        this.renderAll();
      });
    });
    this.tabsEl.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = this.editor.docs.find((d) => d.id === btn.dataset.close);
        if (!target) return;
        const previous = this.doc;
        this.editor.doc = target;
        this.editor.closeDocument();
        if (this.editor.doc !== previous) this.renderAll();
      });
    });
  }

  renderLayers() {
    if (!this.doc) return;
    const rows = this.doc.layers.slice().reverse().map((layer) => `
      <div class="layer-row ${layer.id === this.doc.activeLayerId ? 'active' : ''}" data-id="${layer.id}">
        <button class="toggle ${layer.visible ? '' : 'locked'}" data-toggle="visible" title="Visibilidad">${layer.visible ? '◉' : '○'}</button>
        <img alt="" src="${layer.canvas.toDataURL('image/png')}">
        <span class="name">${escapeHtml(layer.name)} ${layer.locked ? '🔒' : ''}</span>
        <button class="toggle ${layer.locked ? 'locked' : ''}" data-toggle="lock" title="Bloquear" style="grid-column:3;justify-self:end;margin-top:-22px">${layer.locked ? '🔒' : '🔓'}</button>
      </div>`).join('');
    const active = this.doc.activeLayer();
    this.layersEl.innerHTML = rows + (active ? `
      <div class="layer-props">
        <select data-layer="blend" title="Modo de fusión">
          ${BLEND_MODES.map((m) => `<option value="${m}" ${m === active.blend ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <input type="range" data-layer="opacity" min="0" max="100" value="${Math.round(active.opacity * 100)}">
        <span>${Math.round(active.opacity * 100)}%</span>
      </div>` : '');
    document.getElementById('layer-count').textContent = `${this.doc.layers.length}`;
    const output = this.layersEl.querySelector('.layer-props span');
    const range = this.layersEl.querySelector('[data-layer="opacity"]');
    if (range && output) {
      range.addEventListener('input', () => { output.textContent = `${range.value}%`; });
    }
  }

  renderHistory() {
    const history = this.editor.history;
    if (!history) return;
    this.historyEl.innerHTML = history.panelEntries().map((entry) => `
      <div class="history-item ${entry.active ? 'active' : ''} ${entry.applied ? 'applied' : ''}" data-index="${entry.index}">
        <span class="dot">•</span><span>${escapeHtml(entry.label)}</span>
      </div>`).join('') || '<span class="hint">Sin cambios todavía</span>';
    document.getElementById('history-count').textContent = `${history.index}/${history.entries.length}`;
    document.getElementById('undo-btn').disabled = !history.canUndo();
    document.getElementById('redo-btn').disabled = !history.canRedo();
  }

  jumpHistory(target) {
    const history = this.editor.history;
    if (!history) return;
    while (history.index > target) history.undo();
    while (history.index < target) history.redo();
    this.renderHistory();
    this.renderLayers();
  }

  renderStatus() {
    if (!this.doc) return;
    const tool = this.tools.currentTool();
    const cursor = this._cursor;
    const coords = cursor ? `${Math.floor(cursor.x)}, ${Math.floor(cursor.y)}` : '—';
    const selection = this.doc.selectionRect
      ? `Sel ${this.doc.selectionRect.width}×${this.doc.selectionRect.height}`
      : 'Sin selección';
    this.statusEl.innerHTML = `
      <span>${escapeHtml(this.doc.name)}${this.doc.dirty ? ' *' : ''}</span><span class="sep">|</span>
      <span>${this.doc.width} × ${this.doc.height} px</span><span class="sep">|</span>
      <span>${Math.round(this.doc.zoom * 100)}%</span><span class="sep">|</span>
      <span>${escapeHtml(tool?.label || '')}</span><span class="sep">|</span>
      <span>${coords}</span><span class="sep">|</span>
      <span>${selection}</span><span class="sep">|</span>
      <span>${escapeHtml(this.editor.theme?.find().name || '')}</span><span class="sep">|</span>
      <span> GPL-3.0 · ${formatBytes(this.doc.layers.length * this.doc.width * this.doc.height * 4)} RAM aprox.</span>`;
  }

  renderSelectionInfo() { this.renderStatus(); }

  updateTitle() {
    const name = this.doc?.name || 'SeyroPea';
    document.title = `${name}${this.doc?.dirty ? '*' : ''} — SeyroPea`;
    document.getElementById('document-title').textContent = `${name}${this.doc?.dirty ? ' *' : ''}`;
    this.renderTabs?.();
  }

  updateColorControls() {
    const { fgColor, bgColor } = this.editor.state;
    this.fgInput.value = fgColor;
    this.bgInput.value = bgColor;
    this.fgSwatch.style.background = fgColor;
    this.bgSwatch.style.background = bgColor;
  }

  refreshThemeControls() {
    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = this.editor.theme.find().name;
    });
    if (this.modal?.el?.dataset?.kind === 'settings') {
      const themeSelect = this.modal.el.querySelector('[data-setting="theme"]');
      if (themeSelect) themeSelect.value = this.editor.theme.currentId;
      this.modal.el.querySelectorAll('[data-palette-key]').forEach((input) => {
        input.value = this.editor.theme.resolvedPalette()[input.dataset.paletteKey];
      });
    }
    this.renderStatus();
  }

  /* ---------- Lienzo ---------- */

  viewportSize() {
    return { width: this.viewport.clientWidth || 900, height: this.viewport.clientHeight || 600 };
  }

  rulerOffset() { return this.settings.showRulers ? 18 : 0; }

  screenToDoc(x, y) {
    const r = this.rulerOffset();
    return {
      x: (x - r - this.doc.panX) / this.doc.zoom,
      y: (y - r - this.doc.panY) / this.doc.zoom,
    };
  }

  docToScreen(x, y) {
    const r = this.rulerOffset();
    return { x: x * this.doc.zoom + this.doc.panX + r, y: y * this.doc.zoom + this.doc.panY + r };
  }

  scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.renderViewport();
    });
  }

  checkerPattern() {
    if (this._checker) return this._checker;
    const pattern = document.createElement('canvas');
    pattern.width = 16; pattern.height = 16;
    const ctx = pattern.getContext('2d');
    ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8);
    this._checker = this.ctx.createPattern(pattern, 'repeat');
    return this._checker;
  }

  renderViewport() {
    if (!this.canvas || !this.doc) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = this.viewportSize();
    const pw = Math.max(1, Math.floor(width * dpr));
    const ph = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--background') || '#121214';
    ctx.fillRect(0, 0, width, height);

    const r = this.rulerOffset();
    if (r) {
      ctx.fillStyle = '#1c1c20';
      ctx.fillRect(0, 0, width, r);
      ctx.fillRect(0, 0, r, height);
      ctx.strokeStyle = '#3a3a42';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, r + 0.5); ctx.lineTo(width, r + 0.5);
      ctx.moveTo(r + 0.5, 0); ctx.lineTo(r + 0.5, height);
      ctx.stroke();
      const step = this.doc.zoom >= 1 ? 50 : this.doc.zoom >= 0.4 ? 100 : 200;
      ctx.fillStyle = '#8b8b93';
      ctx.font = '9px monospace';
      const startX = Math.floor((-this.doc.panX / this.doc.zoom) / step) * step;
      for (let x = startX; x < (-this.doc.panX + width) / this.doc.zoom; x += step) {
        const sx = this.docToScreen(x, 0).x;
        ctx.fillRect(sx, r - 5, 1, 5);
        ctx.fillText(String(x), sx + 2, 11);
      }
      const startY = Math.floor((-this.doc.panY / this.doc.zoom) / step) * step;
      for (let y = startY; y < (-this.doc.panY + height) / this.doc.zoom; y += step) {
        const sy = this.docToScreen(0, y).y;
        ctx.fillRect(r - 5, sy, 5, 1);
        ctx.save(); ctx.translate(3, sy + 9); ctx.rotate(-Math.PI / 2); ctx.fillText(String(y), 0, 0); ctx.restore();
      }
    }

    const origin = this.docToScreen(0, 0);
    const dw = this.doc.width * this.doc.zoom;
    const dh = this.doc.height * this.doc.zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r, r, width - r, height - r);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = this.checkerPattern();
    ctx.fillRect(origin.x, origin.y, dw, dh);
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = this.doc.zoom < 4;
    ctx.drawImage(this.doc.composite(), origin.x, origin.y, dw, dh);
    ctx.restore();
    ctx.strokeStyle = '#4b4b55';
    ctx.lineWidth = 1;
    ctx.strokeRect(origin.x - 0.5, origin.y - 0.5, dw + 1, dh + 1);

    if (this.settings.showGrid) this.drawGrid(ctx, origin, dw, dh);
    this.drawSelection(ctx);
    this.drawOverlays(ctx);
  }

  drawGrid(ctx, origin, dw, dh) {
    const spacing = 32 * this.doc.zoom;
    if (spacing < 6) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = origin.x; x <= origin.x + dw; x += spacing) { ctx.moveTo(x, origin.y); ctx.lineTo(x, origin.y + dh); }
    for (let y = origin.y; y <= origin.y + dh; y += spacing) { ctx.moveTo(origin.x, y); ctx.lineTo(origin.x + dw, y); }
    ctx.stroke();
    ctx.restore();
  }

  drawSelection(ctx) {
    const state = this.editor.state;
    const path = state.previewPolygon || this.doc.selectionPath;
    const rect = state.previewRect || state.cropRect || this.doc.selectionRect;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    if (path?.length > 1) {
      ctx.beginPath();
      path.forEach((p, i) => {
        const s = this.docToScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      if (!state.previewPolygon) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = '#1a1a1a';
      ctx.stroke();
    } else if (rect) {
      const s = this.docToScreen(rect.x, rect.y);
      ctx.strokeRect(s.x, s.y, rect.width * this.doc.zoom, rect.height * this.doc.zoom);
      if (this.editor.state.cropRect) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        const r = this.rulerOffset();
        const vp = this.viewportSize();
        ctx.fillRect(r, r, vp.width - r, s.y - r);
        ctx.fillRect(r, s.y + rect.height * this.doc.zoom, vp.width - r, vp.height);
      }
    }
    ctx.restore();
  }

  drawOverlays(ctx) {
    const transform = this.editor.state.transform;
    if (transform) {
      const s = this.docToScreen(transform.box.x, transform.box.y);
      const w = transform.box.width * this.doc.zoom;
      const h = transform.box.height * this.doc.zoom;
      ctx.save();
      ctx.strokeStyle = '#ff9f43';
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(s.x, s.y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ff6b00';
      const handles = [
        [s.x, s.y], [s.x + w / 2, s.y], [s.x + w, s.y], [s.x + w, s.y + h / 2],
        [s.x + w, s.y + h], [s.x + w / 2, s.y + h], [s.x, s.y + h], [s.x, s.y + h / 2],
      ];
      for (const [hx, hy] of handles) {
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
        ctx.strokeRect(hx - 4, hy - 4, 8, 8);
      }
      ctx.restore();
    }
    const cursor = this._cursor;
    if (cursor && ['brush', 'eraser'].includes(this.tools.current)) {
      const size = Number(this.editor.toolOptions[this.tools.current].size) || 10;
      const s = this.docToScreen(cursor.x, cursor.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(2, size * this.doc.zoom / 2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- Modales ---------- */

  createModal(title, body, { wide = false, kind = '' } = {}) {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    if (kind) backdrop.dataset.kind = kind;
    backdrop.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">
      <h2>${escapeHtml(title)}</h2><div class="body">${body}</div>
      <div class="actions"></div></div>`;
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) this.closeModal(); });
    document.getElementById('modal-root').appendChild(backdrop);
    const modal = {
      el: backdrop,
      body: backdrop.querySelector('.body'),
      actions: backdrop.querySelector('.actions'),
      close: () => this.closeModal(),
    };
    this.modal = modal;
    return modal;
  }

  closeModal() {
    if (this.modal) {
      this.modal.el.remove();
      this.modal = null;
    }
  }

  addButtons(modal, buttons) {
    buttons.forEach(({ label, primary, run }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (primary) btn.className = 'primary';
      btn.addEventListener('click', run);
      modal.actions.appendChild(btn);
    });
  }

  row(label, control) {
    return `<div class="row"><label>${escapeHtml(label)}</label>${control}</div>`;
  }

  toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  /* ---------- Diálogos ---------- */

  openNewDocument() {
    const modal = this.createModal('Nuevo documento',
      this.row('Ancho (px)', '<input type="number" data-field="width" min="1" max="20000" value="1200">') +
      this.row('Alto (px)', '<input type="number" data-field="height" min="1" max="20000" value="800">') +
      this.row('Fondo', '<select data-field="background"><option value="transparent">Transparente</option><option value="white">Blanco</option></select>'));
    this.addButtons(modal, [
      { label: 'Cancelar', run: () => modal.close() },
      { label: 'Crear', primary: true, run: () => {
        const get = (k) => modal.el.querySelector(`[data-field="${k}"]`).value;
        const w = clamp(Number(get('width')) || 1200, 1, 20000);
        const h = clamp(Number(get('height')) || 800, 1, 20000);
        modal.close();
        this.editor.newDocument(w, h, 'Sin título', get('background'));
      } },
    ]);
  }

  openRecent() {
    const recent = this.settings.recentFiles || [];
    const body = recent.length
      ? recent.map((p, i) => `<div class="row"><label>${i + 1}</label><button data-recent="${escapeHtml(p)}">${escapeHtml(p)}</button></div>`).join('')
      : '<p class="hint">No hay archivos recientes.</p>';
    const modal = this.createModal('Abrir recientes', body);
    modal.el.querySelectorAll('[data-recent]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modal.close();
        this.editor.openRecentPath(btn.dataset.recent);
      });
    });
    this.addButtons(modal, [{ label: 'Cerrar', run: () => modal.close() }]);
  }

  openExport() {
    const modal = this.createModal('Exportar imagen',
      this.row('Formato', `<select data-field="format">
        <option value="png">PNG</option><option value="jpg">JPEG</option>
        <option value="webp">WebP</option><option value="bmp">BMP</option></select>`) +
      this.row('PNG optimizado (UPNG.js local)', `<input type="checkbox" data-field="optimized" ${this.settings.pngOptimized !== false ? 'checked' : ''}>`) +
      this.row('Colores PNG (0 = sin pérdida)', `<input type="number" data-field="colors" min="0" max="256" value="${this.settings.pngColors || 0}">`) +
      '<p class="hint">UPNG.js y pako se incluyen localmente. La exportación nunca contacta con Internet.</p>');
    this.addButtons(modal, [
      { label: 'Cancelar', run: () => modal.close() },
      { label: 'Exportar', primary: true, run: () => {
        const get = (k) => modal.el.querySelector(`[data-field="${k}"]`);
        this.settings.pngOptimized = get('optimized').checked;
        this.settings.pngColors = clamp(Number(get('colors').value) || 0, 0, 256);
        this.editor.persistSettings();
        const format = get('format').value;
        modal.close();
        this.editor.exportImage(format);
      } },
    ]);
  }

  openResizeImage() {
    if (!this.doc) return;
    const modal = this.createModal('Tamaño de imagen',
      this.row('Ancho (px)', `<input type="number" data-field="width" min="1" value="${this.doc.width}">`) +
      this.row('Alto (px)', `<input type="number" data-field="height" min="1" value="${this.doc.height}">`) +
      this.row('Interpolación', '<input type="checkbox" data-field="interpolate" checked>'));
    this.addButtons(modal, [
      { label: 'Cancelar', run: () => modal.close() },
      { label: 'Aplicar', primary: true, run: () => {
        const w = Number(modal.el.querySelector('[data-field="width"]').value);
        const h = Number(modal.el.querySelector('[data-field="height"]').value);
        const interpolate = modal.el.querySelector('[data-field="interpolate"]').checked;
        modal.close();
        this.editor.resizeImage(w, h, interpolate);
      } },
    ]);
  }

  openResizeCanvas() {
    if (!this.doc) return;
    const modal = this.createModal('Tamaño de lienzo',
      this.row('Ancho (px)', `<input type="number" data-field="width" min="1" value="${this.doc.width}">`) +
      this.row('Alto (px)', `<input type="number" data-field="height" min="1" value="${this.doc.height}">`) +
      this.row('Ancla', '<select data-field="anchor"><option value="center">Centro</option><option value="topleft">Superior izquierda</option></select>'));
    this.addButtons(modal, [
      { label: 'Cancelar', run: () => modal.close() },
      { label: 'Aplicar', primary: true, run: () => {
        const w = Number(modal.el.querySelector('[data-field="width"]').value);
        const h = Number(modal.el.querySelector('[data-field="height"]').value);
        const anchor = modal.el.querySelector('[data-field="anchor"]').value;
        modal.close();
        this.editor.resizeCanvas(w, h, anchor);
      } },
    ]);
  }

  openFilterDialog(id) {
    const filter = this.editor.filters.get(id);
    if (!filter) return;
    const layer = this.doc?.activeLayer();
    if (!layer) return;
    if (!filter.controls.length) {
      this.editor.applyFilter(id);
      return;
    }
    const params = { ...filter.defaults };
    const controls = filter.controls.map((c) => {
      const value = params[c.key] ?? c.value;
      if (c.type === 'color') {
        return this.row(c.label, `<input type="color" data-param="${c.key}" value="${escapeHtml(value || '#ffffff')}">`);
      }
      return this.row(`${c.label} <output data-output="${c.key}">${value}</output>`,
        `<input type="range" data-param="${c.key}" min="${c.min}" max="${c.max}" step="${c.step ?? 1}" value="${value}">`);
    }).join('');
    const modal = this.createModal(`Filtro · ${filter.label}`, `
      <canvas class="preview" id="filter-preview"></canvas>
      <div class="row"><button id="compare-btn">Comparar: resultado</button><span class="hint">Mantén pulsado para ver el original</span></div>
      ${controls}`, { wide: true });
    const preview = modal.el.querySelector('#filter-preview');
    const original = layer.imageData();
    let showingOriginal = false;

    const draw = (image) => {
      const maxW = 700, maxH = 300;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      preview.width = Math.max(1, Math.floor(image.width * scale));
      preview.height = Math.max(1, Math.floor(image.height * scale));
      const tmp = document.createElement('canvas');
      tmp.width = image.width; tmp.height = image.height;
      tmp.getContext('2d').putImageData(image, 0, 0);
      const ctx = preview.getContext('2d');
      ctx.clearRect(0, 0, preview.width, preview.height);
      ctx.drawImage(tmp, 0, 0, preview.width, preview.height);
    };

    const update = () => {
      if (showingOriginal) { draw(original); return; }
      try { draw(this.editor.filters.apply(id, cloneImageData(original), params)); }
      catch (e) { this.toast(`No se pudo previsualizar: ${e.message}`, 'error'); }
    };
    modal.el.querySelectorAll('[data-param]').forEach((input) => {
      const handler = () => {
        params[input.dataset.param] = input.type === 'range' ? Number(input.value) : input.value;
        const output = modal.el.querySelector(`[data-output="${input.dataset.param}"]`);
        if (output) output.textContent = input.value;
        update();
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
    const compare = modal.el.querySelector('#compare-btn');
    const setCompare = (on) => {
      showingOriginal = on;
      compare.textContent = `Comparar: ${on ? 'original' : 'resultado'}`;
      update();
    };
    compare.addEventListener('pointerdown', () => setCompare(true));
    compare.addEventListener('pointerup', () => setCompare(false));
    compare.addEventListener('pointerleave', () => setCompare(false));
    update();

    this.addButtons(modal, [
      { label: 'Cancelar', run: () => modal.close() },
      { label: 'Aplicar', primary: true, run: () => {
        modal.close();
        this.editor.applyFilter(id, params);
      } },
    ]);
  }

  openTextEditor(layer) {
    if (!layer?.text) return;
    const t = layer.text;
    const fonts = this.editor.theme?.fonts?.length ? this.editor.theme.fonts : ['sans-serif', 'serif', 'monospace'];
    const modal = this.createModal('Editar texto', `
      <label class="field"><span>Contenido</span><textarea data-field="text" rows="4">${escapeHtml(t.text)}</textarea></label>
      <div class="row"><label>Fuente</label><select data-field="fontFamily">${fonts.map((f) =>
        `<option ${f === t.fontFamily ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select></div>
      ${this.row('Tamaño', `<input type="range" data-field="fontSize" min="8" max="200" value="${t.fontSize}">`)}
      ${this.row('Color', `<input type="color" data-field="color" value="${t.color}">`)}
      ${this.row('Alineación', `<select data-field="align"><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select>`)}`);
    modal.el.querySelector('[data-field="align"]').value = t.align || 'left';
    this.addButtons(modal, [
      { label: 'Cancelar', run: () => modal.close() },
      { label: 'Aplicar', primary: true, run: () => {
        const get = (key) => modal.el.querySelector(`[data-field="${key}"]`).value;
        modal.close();
        this.editor.updateTextLayer(layer, {
          text: get('text'), fontFamily: get('fontFamily'), fontSize: Number(get('fontSize')),
          color: get('color'), align: get('align'),
        });
      } },
    ]);
  }

  openSettings() {
    const theme = this.editor.theme;
    const current = theme.resolvedPalette();
    const fonts = theme.fonts.length ? theme.fonts : ['sans-serif', 'serif', 'monospace'];
    const body = `
      <div class="section-title">Apariencia</div>
      ${this.row('Tema', `<select data-setting="theme">${theme.allThemes().map((t) =>
        `<option value="${escapeHtml(t.id)}" ${t.id === theme.currentId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select>`)}
      <div class="color-grid">${theme.colorInputs()}</div>
      ${this.row('Fuente UI', `<select data-setting="fontFamily">${fonts.map((f) =>
        `<option value="${escapeHtml(f)}" ${f === this.settings.fontFamily ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select>`)}
      ${this.row('Tamaño UI', `<input type="range" data-setting="fontScale" min="80" max="140" value="${this.settings.fontScale || 100}">`)}
      ${this.row('Números monoespaciados', `<input type="checkbox" data-setting="monospaceNumbers" ${this.settings.monospaceNumbers ? 'checked' : ''}>`)}
      <div class="section-title">Fondo de pantalla → paleta</div>
      <div class="row"><button id="detect-wallpaper">Detectar fondo automáticamente</button><button id="choose-wallpaper">Elegir imagen local</button></div>
      ${this.row('Detección automática al iniciar', `<input type="checkbox" data-setting="wallpaperAuto" ${this.settings.wallpaperAuto !== false ? 'checked' : ''}>`)}
      ${this.settings.wallpaperPath ? `<p class="hint">Referencia actual: ${escapeHtml(this.settings.wallpaperPath)}</p>` : ''}
      <div class="section-title">Temas personalizados</div>
      <div class="row"><button id="clone-theme">Clonar tema actual</button><button id="export-theme">Exportar JSON</button><button id="import-theme">Importar JSON</button><button id="delete-theme">Eliminar</button></div>
      <input type="file" id="import-theme-file" accept="application/json,.json" hidden>
      <div class="section-title">Editor</div>
      ${this.row('Historial (pasos)', `<input type="number" data-setting="historyLimit" min="10" max="200" value="${this.settings.historyLimit || 50}">`)}
      ${this.row('Mostrar reglas', `<input type="checkbox" data-setting="showRulers" ${this.settings.showRulers ? 'checked' : ''}>`)}
      ${this.row('Mostrar cuadrícula', `<input type="checkbox" data-setting="showGrid" ${this.settings.showGrid ? 'checked' : ''}>`)}
      ${this.row('Guías inteligentes', `<input type="checkbox" data-setting="smartGuides" ${this.settings.smartGuides ? 'checked' : ''}>`)}
      ${this.row('Buscar actualizaciones al iniciar', `<input type="checkbox" data-setting="checkUpdates" ${this.settings.checkUpdates ? 'checked' : ''}>`)}`;
    const modal = this.createModal('Preferencias y temas', body, { wide: true, kind: 'settings' });
    const get = (key) => modal.el.querySelector(`[data-setting="${key}"]`);

    get('theme').addEventListener('change', (e) => theme.setTheme(e.target.value));
    modal.el.querySelectorAll('[data-palette-key]').forEach((input) => {
      input.addEventListener('input', () => {
        theme.setOverride(input.dataset.paletteKey, input.value);
        const code = modal.el.querySelector(`[data-color-code="${input.dataset.paletteKey}"]`);
        if (code) code.textContent = input.value;
      });
    });
    const simple = (key, type = 'change') => {
      const input = get(key);
      input.addEventListener(type, () => {
        const value = input.type === 'checkbox' ? input.checked
          : input.type === 'range' || input.type === 'number' ? Number(input.value) : input.value;
        this.settings[key] = value;
        theme.apply();
        this.editor.persistSettings();
        this.renderViewport();
      });
    };
    ['fontFamily', 'fontScale', 'monospaceNumbers', 'wallpaperAuto', 'historyLimit',
      'showRulers', 'showGrid', 'smartGuides', 'checkUpdates'].forEach((k) => simple(k,
      k === 'fontScale' ? 'input' : 'change'));

    modal.el.querySelector('#detect-wallpaper').addEventListener('click', async () => {
      const path = await theme.detectWallpaper();
      this.toast(path ? `Paleta derivada de ${path}` : 'No se pudo detectar el fondo del sistema', path ? 'info' : 'error');
      this.openSettings();
    });
    modal.el.querySelector('#choose-wallpaper').addEventListener('click', async () => {
      const path = await theme.chooseWallpaper();
      if (path) { this.toast('Paleta derivada de la imagen local'); this.openSettings(); }
    });
    modal.el.querySelector('#clone-theme').addEventListener('click', () => {
      const name = window.prompt('Nombre del nuevo tema', `${theme.find().name} copia`);
      if (name) { theme.cloneCurrent(name); this.openSettings(); }
    });
    modal.el.querySelector('#export-theme').addEventListener('click', () => theme.exportCurrent());
    modal.el.querySelector('#delete-theme').addEventListener('click', () => {
      if (!theme.find().custom) return this.toast('Los temas integrados no se pueden eliminar', 'error');
      theme.deleteCustom(theme.currentId);
      this.openSettings();
    });
    const fileInput = modal.el.querySelector('#import-theme-file');
    modal.el.querySelector('#import-theme').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const imported = theme.importTheme(await file.text());
        this.toast(`Tema importado: ${imported.name}`);
        this.openSettings();
      } catch (e) { this.toast(`Theme inválido: ${e.message}`, 'error'); }
    });
    this.addButtons(modal, [{ label: 'Cerrar', primary: true, run: () => modal.close() }]);
  }

  openAbout() {
    const info = this.editor.appInfo || {};
    const modal = this.createModal('Acerca de SeyroPea', `
      <p><strong>SeyroPea v${escapeHtml(info.version || '0.1.0')}</strong> — estudio de edición de imágenes nativo, ligero y offline.</p>
      <p>Procesamiento algorítmico determinista sobre buffers RGBA. Sin IA generativa, sin telemetría y sin dependencias de red en producción.</p>
      <p>Licencia: <strong>GPL-3.0-only</strong> · Repositorio: github.com/vDaiki-dev/seyropea</p>
      <p class="hint">Incluye UPNG.js y pako (MIT) de forma local para exportación PNG optimizada.</p>`);
    this.addButtons(modal, [{ label: 'Cerrar', primary: true, run: () => modal.close() }]);
  }

  openShortcuts() {
    const modal = this.createModal('Atajos de teclado', `
      <table><thead><tr><th>Tecla</th><th>Acción</th></tr></thead><tbody>
      ${SHORTCUTS.map(([key, label]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(label)}</td></tr>`).join('')}
      </tbody></table>`, { wide: true });
    this.addButtons(modal, [{ label: 'Cerrar', primary: true, run: () => modal.close() }]);
  }

  showUpdate(info) {
    const modal = this.createModal(`Actualización disponible · ${escapeHtml(info.version)}`, `
      <p>Se encontró una versión nueva en GitHub Releases. La consulta es opcional y nunca bloquea la edición.</p>
      <pre style="white-space:pre-wrap;max-height:220px;overflow:auto">${escapeHtml(info.notes || 'Sin notas')}</pre>
      ${info.assetName ? `<p class="hint">Paquete recomendado: ${escapeHtml(info.assetName)}</p>` : ''}`);
    this.addButtons(modal, [
      { label: 'Ahora no', run: () => modal.close() },
      { label: 'Abrir Releases', primary: true, run: async () => {
        try { await api.openUrl(info.url); } catch (e) { this.toast(e.message, 'error'); }
        modal.close();
      } },
    ]);
  }
}

// Limpieza rápida de un rectángulo en un ImageData (evita import circular de util).
function injectClear(imageData, rect) {
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * imageData.width + rect.x) * 4;
    imageData.data.fill(0, start, start + rect.width * 4);
  }
}
