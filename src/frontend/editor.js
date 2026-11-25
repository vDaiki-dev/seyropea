// Controlador central de SeyroPea. Orquesta documento, historial, herramientas y UI.
import { api, listen } from './api.js';
import { SeyroDocument } from './document.js';
import { CommandHistory } from './history.js';
import { ToolRegistry, renderTextLayer } from './tools.js';
import { FilterRegistry } from './filters.js';
import { ThemeEngine } from './theme.js';
import { UI } from './ui.js';
import {
  uid, debounce, clamp, imageDataToBase64, base64ToBytes, arrayBufferToBase64,
  extractRect, injectRect, diffRect,
} from './util.js';

const DEFAULT_SETTINGS = {
  theme: 'seyro-dark-orange', fontFamily: 'sans-serif', fontSize: 13, fontScale: 100,
  monospaceNumbers: true, customThemes: [], themeOverrides: {}, recentFiles: [],
  checkUpdates: true, historyLimit: 50, showRulers: true, showGrid: false,
  smartGuides: true, pngColors: 0, wallpaperAuto: true,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });
}

export class Editor {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.state = { fgColor: '#ff6b00', bgColor: '#ffffff', transform: null, previewRect: null,
      previewPolygon: null, cropRect: null, filterPreview: false };
    this.docs = [];
    this.doc = null;
    this.histories = new WeakMap();
    this.toolOptions = {};
    this.clipboard = null;
    this.appInfo = null;
    this.tools = null;
    this.filters = new FilterRegistry();
    this.ui = null;
    this.persistSettings = debounce(() => {
      api.saveSettings(this.settings).catch((e) => this.ui?.toast(`No se pudo guardar la configuración: ${e}`, 'error'));
    }, 400);
  }

  get history() {
    if (!this.doc) return null;
    if (!this.histories.has(this.doc)) {
      this.histories.set(this.doc, new CommandHistory(this, this.settings.historyLimit));
    }
    return this.histories.get(this.doc);
  }

  async init() {
    try {
      this.settings = { ...DEFAULT_SETTINGS, ...(await api.loadSettings()) };
    } catch (e) {
      console.warn('No se pudo cargar settings.json', e);
    }
    this.tools = new ToolRegistry(this);
    for (const tool of this.tools.list()) {
      this.toolOptions[tool.id] = Object.fromEntries(
        (tool.options || []).map((o) => [o.key, o.value]),
      );
    }
    this.theme = new ThemeEngine(this);
    this.ui = new UI(this);
    this.ui.mount();
    this.newDocument(1200, 800, 'Sin título');
    await this.theme.init();
    try { this.appInfo = await api.appInfo(); } catch { this.appInfo = null; }
    await listen('menu-action', (payload) => {
      const action = typeof payload === 'string' ? payload : payload?.payload;
      if (action) this.handleMenuAction(action);
    });
    await listen('app-ready', () => this.ui.updateTitle());
    if (this.settings.checkUpdates) this.checkUpdates(true);
  }

  /* ---------- Documentos ---------- */

  newDocument(width = 1200, height = 800, name = 'Sin título', background = 'transparent') {
    const doc = SeyroDocument.create(this, width, height, name, background);
    this.docs.push(doc);
    this.doc = doc;
    this.ui?.renderAll();
    this.ui?.toast(`Nuevo documento ${width} × ${height}`);
    return doc;
  }

  addDocument(doc) {
    this.docs.push(doc);
    this.doc = doc;
    this.ui?.renderAll();
    return doc;
  }

  closeDocument() {
    if (!this.doc) return;
    const index = this.docs.indexOf(this.doc);
    this.docs.splice(index, 1);
    this.doc = this.docs[Math.max(0, index - 1)] || null;
    if (!this.doc) {
      this.newDocument(1200, 800);
    } else {
      this.ui.renderAll();
    }
  }

  async openImage() {
    try {
      const path = await api.pickImageFile();
      if (!path) return;
      const decoded = await api.decodeImage(path);
      const doc = SeyroDocument.fromDecoded(this, decoded);
      doc.filePath = path;
      this.addDocument(doc);
      this.addRecent(path);
      this.ui.toast(`Abrida: ${decoded.name}`);
    } catch (e) {
      this.ui?.toast(`No se pudo abrir la imagen: ${e.message || e}`, 'error');
    }
  }

  async openProject() {
    try {
      const path = await api.pickProjectFile();
      if (!path) return;
      const project = await api.loadProject(path);
      const doc = SeyroDocument.fromProjectFile(this, project);
      doc.filePath = path;
      this.addDocument(doc);
      this.addRecent(path);
      this.ui.toast(`Proyecto abierto: ${doc.name}`);
    } catch (e) {
      this.ui?.toast(`No se pudo abrir el proyecto: ${e.message || e}`, 'error');
    }
  }

  addRecent(path) {
    this.settings.recentFiles = [path, ...(this.settings.recentFiles || []).filter((p) => p !== path)].slice(0, 12);
    this.persistSettings();
  }

  async saveProject(saveAs = false) {
    if (!this.doc) return;
    try {
      let path = this.doc.filePath;
      if (!path || saveAs || !path.endsWith('.seyro')) {
        path = await api.saveProjectFile(`${this.doc.name || 'proyecto'}.seyro`);
      }
      if (!path) return;
      if (!path.toLowerCase().endsWith('.seyro')) path += '.seyro';
      await api.saveProject(path, this.doc.toProjectFile());
      this.doc.filePath = path;
      this.doc.markDirty(false);
      this.addRecent(path);
      this.ui.toast(`Proyecto guardado: ${path}`);
    } catch (e) {
      this.ui?.toast(`No se pudo guardar: ${e.message || e}`, 'error');
    }
  }

  async exportImage(format = 'png') {
    if (!this.doc) return;
    try {
      const name = `${this.doc.name || 'imagen'}.${format}`;
      const path = await api.saveExportFile(name, format);
      if (!path) return;
      const image = this.doc.flattenedImageData();
      if (format === 'png' && this.settings.pngOptimized !== false) {
        await this.exportOptimizedPng(path, image);
      } else {
        await api.encodeImage(path, imageDataToBase64(image), image.width, image.height, format);
      }
      this.ui.toast(`Exportado: ${path}`);
    } catch (e) {
      this.ui?.toast(`No se pudo exportar: ${e.message || e}`, 'error');
    }
  }

  async exportOptimizedPng(path, image) {
    if (!window.UPNG) {
      await loadScript('./vendor/upng/pako.min.js');
      await loadScript('./vendor/upng/UPNG.js');
    }
    const colors = Number(this.settings.pngColors) || 0;
    const buffer = window.UPNG.encode([image.data.slice().buffer], image.width, image.height, colors);
    await api.writeFile(path, arrayBufferToBase64(buffer));
  }

  /* ---------- Historial y edición ---------- */

  pushHistory(entry) {
    this.history?.push(entry);
    this.doc?.markDirty();
  }

  pushStructural(label, mutate) {
    if (!this.doc) return;
    const before = this.doc.snapshot();
    mutate();
    const after = this.doc.snapshot();
    this.pushHistory({ label, kind: 'structural', data: { before, after } });
    this.doc.invalidate();
  }

  commitPixels(label, layer, before) {
    const after = layer.imageData();
    const rect = diffRect(before.data, after.data, layer.width, layer.height);
    if (!rect) return false;
    this.pushHistory({
      label, kind: 'pixels',
      data: {
        layerId: layer.id, rect,
        before: extractRect(before, rect),
        after: extractRect(after, rect),
      },
    });
    this.doc.invalidate();
    return true;
  }

  applyHistoryEntry(entry, direction) {
    if (!this.doc) return;
    const data = entry.data;
    if (entry.kind === 'pixels') {
      const layer = this.doc.layerById(data.layerId);
      if (!layer) return;
      const image = layer.imageData();
      injectRect(image, data.rect, direction === 'undo' ? data.before : data.after);
      layer.putImageData(image);
    } else if (entry.kind === 'move') {
      const layer = this.doc.layerById(data.layerId);
      if (!layer) return;
      const target = direction === 'undo' ? data.from : data.to;
      layer.x = target.x; layer.y = target.y;
    } else if (entry.kind === 'structural') {
      this.doc.restore(direction === 'undo' ? data.before : data.after);
      this.ui.renderLayers();
    } else if (entry.kind === 'fullLayer') {
      const layer = this.doc.layerById(data.layerId);
      if (!layer) return;
      const target = direction === 'undo' ? data.before : data.after;
      const bytes = base64ToBytes(target.rgba);
      const canvas = document.createElement('canvas');
      canvas.width = target.width; canvas.height = target.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes), target.width, target.height), 0, 0);
      layer.canvas = canvas; layer.ctx = ctx;
      layer.width = target.width; layer.height = target.height;
      layer.x = target.x; layer.y = target.y;
    }
    this.doc.invalidate();
    this.doc.markDirty(direction === 'undo');
  }

  setTool(id) {
    return this.tools?.setTool(id) || false;
  }

  undo() {
    if (!this.history?.undo()) this.ui?.toast('No hay cambios para deshacer');
  }

  redo() {
    if (!this.history?.redo()) this.ui?.toast('No hay cambios para rehacer');
  }

  applyFilter(filterId, params, target = 'layer') {
    if (!this.doc) return;
    const filter = this.filters.get(filterId);
    if (!filter) return;
    const layer = this.doc.activeLayer();
    if (!layer || layer.locked) {
      this.ui?.toast('La capa activa está bloqueada o no existe', 'error');
      return;
    }
    if (['rotate90', 'rotate270', 'rotate180', 'flipH', 'flipV'].includes(filterId)) {
      this.pushStructural(filter.label, () => {
        if (target === 'all') {
          for (const l of this.doc.layers) {
            const out = filter.apply(l.imageData());
            const canvas = document.createElement('canvas');
            canvas.width = out.width; canvas.height = out.height;
            canvas.getContext('2d').putImageData(out, 0, 0);
            l.canvas = canvas;
            l.ctx = canvas.getContext('2d', { willReadFrequently: true });
            l.width = out.width; l.height = out.height;
          }
          if (filterId.startsWith('rotate')) [this.doc.width, this.doc.height] = [this.doc.height, this.doc.width];
        } else {
          const out = filter.apply(layer.imageData());
          const canvas = document.createElement('canvas');
          canvas.width = out.width; canvas.height = out.height;
          canvas.getContext('2d').putImageData(out, 0, 0);
          layer.canvas = canvas;
          layer.ctx = canvas.getContext('2d', { willReadFrequently: true });
          layer.width = out.width; layer.height = out.height;
        }
        this.doc.fitZoom(this.ui.viewportSize());
      });
      this.ui.toast(`${filter.label} aplicado`);
      return;
    }
    const before = layer.imageData();
    const out = filter.apply(before, params);
    layer.putImageData(out);
    this.commitPixels(filter.label, layer, before);
    this.ui.toast(`${filter.label} aplicado`);
  }

  cropDocument(rect) {
    const r = {
      x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)),
      width: 0, height: 0,
    };
    r.width = Math.min(this.doc.width - r.x, Math.floor(rect.width));
    r.height = Math.min(this.doc.height - r.y, Math.floor(rect.height));
    if (r.width <= 0 || r.height <= 0) return;
    this.pushStructural('Recortar', () => {
      for (const layer of this.doc.layers) {
        const src = layer.imageData();
        const overlap = {
          x: Math.max(0, r.x - layer.x), y: Math.max(0, r.y - layer.y),
        };
        overlap.width = Math.max(0, Math.min(layer.width - overlap.x, r.width - Math.max(0, layer.x - r.x)));
        overlap.height = Math.max(0, Math.min(layer.height - overlap.y, r.height - Math.max(0, layer.y - r.y)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, r.width); canvas.height = Math.max(1, r.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (overlap.width > 0 && overlap.height > 0) {
          const pixels = new ImageData(
            extractRect(src, overlap), overlap.width, overlap.height,
          );
          const tmp = document.createElement('canvas');
          tmp.width = overlap.width; tmp.height = overlap.height;
          tmp.getContext('2d').putImageData(pixels, 0, 0);
          ctx.drawImage(tmp, overlap.x + layer.x - r.x, overlap.y + layer.y - r.y);
        }
        layer.canvas = canvas; layer.ctx = ctx;
        layer.width = canvas.width; layer.height = canvas.height;
        layer.x = 0; layer.y = 0;
        layer.text = null; layer.shape = null; layer.kind = 'raster';
      }
      this.doc.width = r.width;
      this.doc.height = r.height;
      this.doc.clearSelection();
      this.doc.fitZoom(this.ui.viewportSize());
    });
    this.ui.toast(`Recortado a ${r.width} × ${r.height}`);
  }

  resizeImage(width, height, interpolate = true) {
    if (!this.doc) return;
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    this.pushStructural('Tamaño de imagen', () => {
      const sx = width / this.doc.width, sy = height / this.doc.height;
      for (const layer of this.doc.layers) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(layer.width * sx));
        canvas.height = Math.max(1, Math.round(layer.height * sy));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = interpolate;
        ctx.drawImage(layer.canvas, 0, 0, canvas.width, canvas.height);
        layer.canvas = canvas; layer.ctx = ctx;
        layer.width = canvas.width; layer.height = canvas.height;
        layer.x = Math.round(layer.x * sx); layer.y = Math.round(layer.y * sy);
      }
      this.doc.width = width; this.doc.height = height;
      this.doc.selection = null; this.doc.selectionPath = null; this.doc.selectionRect = null;
      this.doc.fitZoom(this.ui.viewportSize());
    });
  }

  resizeCanvas(width, height, anchor = 'center') {
    if (!this.doc) return;
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    this.pushStructural('Tamaño de lienzo', () => {
      const dx = anchor === 'center' ? (width - this.doc.width) / 2 : 0;
      const dy = anchor === 'center' ? (height - this.doc.height) / 2 : 0;
      for (const layer of this.doc.layers) { layer.x += Math.round(dx); layer.y += Math.round(dy); }
      this.doc.width = width; this.doc.height = height;
      this.doc.selection = null; this.doc.selectionPath = null; this.doc.selectionRect = null;
      this.doc.fitZoom(this.ui.viewportSize());
    });
  }

  addLayer() {
    if (!this.doc) return;
    this.pushStructural('Nueva capa', () => this.doc.createLayer({ name: `Capa ${this.doc.layers.length + 1}` }));
    this.ui.renderLayers();
  }

  duplicateLayer() {
    if (!this.doc?.activeLayer()) return;
    this.pushStructural('Duplicar capa', () => this.doc.duplicateLayer(this.doc.activeLayerId));
    this.ui.renderLayers();
  }

  deleteLayer() {
    if (!this.doc?.activeLayer()) return;
    if (this.doc.layers.length <= 1) return this.ui.toast('El documento debe tener al menos una capa', 'error');
    const id = this.doc.activeLayerId;
    this.pushStructural('Eliminar capa', () => this.doc.removeLayer(id));
    this.ui.renderLayers();
  }

  setLayerProperty(id, key, value) {
    const layer = this.doc?.layerById(id);
    if (!layer) return;
    this.pushStructural(`Cambiar ${key}`, () => { layer[key] = value; });
    this.ui.renderLayers();
  }

  /* ---------- Portapapeles ---------- */

  copy(cut = false) {
    if (!this.doc) return;
    const rawRect = this.doc.selectionRect || { x: 0, y: 0, width: this.doc.width, height: this.doc.height };
    const rect = {
      x: clamp(Math.floor(rawRect.x), 0, this.doc.width - 1),
      y: clamp(Math.floor(rawRect.y), 0, this.doc.height - 1),
      width: 0, height: 0,
    };
    rect.width = Math.max(1, Math.min(Math.floor(rawRect.width), this.doc.width - rect.x));
    rect.height = Math.max(1, Math.min(Math.floor(rawRect.height), this.doc.height - rect.y));
    const image = this.doc.flattenedImageData();
    const pixels = extractRect(image, rect);
    this.clipboard = { width: rect.width, height: rect.height, data: pixels };
    if (cut) {
      const layer = this.doc.activeLayer();
      if (layer && !layer.locked) {
        const before = layer.imageData();
        const data = layer.imageData();
        const local = {
          x: Math.max(0, rect.x - layer.x), y: Math.max(0, rect.y - layer.y),
          width: 0, height: 0,
        };
        local.width = Math.min(layer.width - local.x, rect.width);
        local.height = Math.min(layer.height - local.y, rect.height);
        if (local.width > 0 && local.height > 0) {
          const clear = new Uint8ClampedArray(local.width * local.height * 4);
          injectRect(data, local, clear);
          layer.putImageData(data);
          this.commitPixels('Cortar', layer, before);
        }
      }
    }
    this.ui.toast(cut ? 'Cortado al portapapeles interno' : 'Copiado al portapapeles interno');
  }

  paste() {
    if (!this.doc || !this.clipboard) return this.ui?.toast('El portapapeles está vacío', 'error');
    const { width, height, data } = this.clipboard;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    this.pushStructural('Pegar', () => {
      const layer = this.doc.createLayer({
        name: 'Pegado', x: Math.round((this.doc.width - width) / 2),
        y: Math.round((this.doc.height - height) / 2), width, height, canvas,
      });
      this.doc.activeLayerId = layer.id;
    });
    this.ui.renderLayers();
  }

  /* ---------- Menú y atajos ---------- */

  handleMenuAction(action) {
    const map = {
      'file.new': () => this.ui.openNewDocument(),
      'file.open': () => this.openImage(),
      'file.openRecent': () => this.ui.openRecent(),
      'file.save': () => this.saveProject(false),
      'file.saveAs': () => this.saveProject(true),
      'file.export': () => this.ui.openExport(),
      'file.close': () => this.closeDocument(),
      'file.quit': () => this.ui.toast('Use el botón de cierre de la ventana para salir'),
      'edit.undo': () => this.undo(),
      'edit.redo': () => this.redo(),
      'edit.cut': () => this.copy(true),
      'edit.copy': () => this.copy(false),
      'edit.paste': () => this.paste(),
      'edit.transform': () => this.tools.setTool('transform'),
      'edit.preferences': () => this.ui.openSettings(),
      'image.size': () => this.ui.openResizeImage(),
      'image.canvas': () => this.ui.openResizeCanvas(),
      'image.rotateCW': () => this.applyFilter('rotate90', {}, 'all'),
      'image.rotateCCW': () => this.applyFilter('rotate270', {}, 'all'),
      'image.rotate180': () => this.applyFilter('rotate180', {}, 'all'),
      'image.flipH': () => this.applyFilter('flipH', {}, 'all'),
      'image.flipV': () => this.applyFilter('flipV', {}, 'all'),
      'image.brightness': () => this.ui.openFilterDialog('brightness'),
      'image.hueSat': () => this.ui.openFilterDialog('huesat'),
      'image.levels': () => this.ui.openFilterDialog('levels'),
      'image.exposure': () => this.ui.openFilterDialog('exposure'),
      'image.invert': () => this.applyFilter('invert'),
      'image.desaturate': () => this.applyFilter('desaturate'),
      'layer.new': () => this.addLayer(),
      'layer.duplicate': () => this.duplicateLayer(),
      'layer.delete': () => this.deleteLayer(),
      'layer.mergeDown': () => {
        if (!this.doc) return;
        const id = this.doc.activeLayerId;
        this.pushStructural('Combinar hacia abajo', () => this.doc.mergeDown(id));
        this.ui.renderLayers();
      },
      'layer.flatten': () => this.pushStructural('Acoplar imagen', () => this.doc.flatten()),
      'layer.up': () => { this.doc.moveLayer(this.doc.activeLayerId, 1); this.ui.renderLayers(); },
      'layer.down': () => { this.doc.moveLayer(this.doc.activeLayerId, -1); this.ui.renderLayers(); },
      'filter.gaussian': () => this.ui.openFilterDialog('gaussian'),
      'filter.box': () => this.ui.openFilterDialog('box'),
      'filter.unsharp': () => this.ui.openFilterDialog('unsharp'),
      'filter.vignette': () => this.ui.openFilterDialog('vignette'),
      'filter.noise': () => this.ui.openFilterDialog('noise'),
      'filter.pixelate': () => this.ui.openFilterDialog('pixelate'),
      'view.zoomIn': () => this.doc.setZoom(this.doc.zoom * 1.25),
      'view.zoomOut': () => this.doc.setZoom(this.doc.zoom / 1.25),
      'view.fit': () => this.doc.fitZoom(this.ui.viewportSize()),
      'view.actual': () => this.doc.setZoom(1),
      'view.rulers': () => { this.settings.showRulers = !this.settings.showRulers; this.persistSettings(); this.ui.renderViewport(); },
      'view.grid': () => { this.settings.showGrid = !this.settings.showGrid; this.persistSettings(); this.ui.renderViewport(); },
      'view.guides': () => { this.settings.smartGuides = !this.settings.smartGuides; this.persistSettings(); },
      'help.shortcuts': () => this.ui.openShortcuts(),
      'help.update': () => this.checkUpdates(false),
      'help.about': () => this.ui.openAbout(),
    };
    const fn = map[action];
    if (!fn) {
      if (action.startsWith('recent:')) this.openRecentPath(action.slice(7));
      else if (action.startsWith('theme:')) this.theme.setTheme(action.slice(6));
      return;
    }
    try { fn(); } catch (e) { this.ui.toast(`Error: ${e.message || e}`, 'error'); }
  }

  async checkUpdates(silent) {
    if (!this.settings.checkUpdates && silent) return;
    try {
      const info = await api.checkUpdates();
      if (info) this.ui.showUpdate(info);
      else if (!silent) this.ui.toast('No hay actualizaciones disponibles');
    } catch {
      if (!silent) this.ui.toast('No se pudo consultar GitHub Releases (offline)', 'error');
      // Fallo silencioso en modo automático: la app funciona sin red.
    }
  }

  async openRecentPath(path) {
    try {
      const project = await api.loadProject(path);
      this.addDocument(SeyroDocument.fromProjectFile(this, project));
      this.addRecent(path);
    } catch (e) {
      this.ui.toast(`No se pudo abrir reciente: ${e.message || e}`, 'error');
    }
  }

  updateTextLayer(layer, options) {
    const before = this.doc.snapshot();
    layer.text = { ...layer.text, ...options };
    renderTextLayer(layer);
    layer.width = layer.canvas.width;
    layer.height = layer.canvas.height;
    this.doc.invalidate();
    this.pushHistory({ label: 'Editar texto', kind: 'structural', data: { before, after: this.doc.snapshot() } });
    this.ui.renderLayers();
  }
}
