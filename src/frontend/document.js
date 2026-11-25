// Modelo de documento, capas, selección y composición determinista.
import {
  uid, imageDataFromBase64, imageDataToBase64, cloneImageData, rectFromPoints, pointInPolygon,
} from './util.js';

export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'luminosity',
];

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

export function copyCanvas(source) {
  const canvas = makeCanvas(source.width, source.height);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0);
  return canvas;
}

export class Layer {
  constructor(options) {
    this.id = options.id || uid('layer');
    this.name = options.name || 'Capa';
    this.kind = options.kind || 'raster';
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.width = options.width || 1;
    this.height = options.height || 1;
    this.opacity = options.opacity ?? 1;
    this.blend = BLEND_MODES.includes(options.blend) ? options.blend : 'normal';
    this.visible = options.visible ?? true;
    this.locked = options.locked ?? false;
    this.text = options.text || null;
    this.shape = options.shape || null;
    this.canvas = options.canvas || makeCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (options.imageData) this.ctx.putImageData(options.imageData, 0, 0);
  }

  imageData() {
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  putImageData(data) {
    this.ctx.putImageData(data, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  clone() {
    return new Layer({
      ...this.serializeMeta(),
      id: uid('layer'),
      name: `${this.name} copia`,
      canvas: copyCanvas(this.canvas),
    });
  }

  serializeMeta(dataLength = this.width * this.height * 4) {
    return {
      id: this.id, name: this.name, kind: this.kind, x: this.x, y: this.y,
      width: this.width, height: this.height, opacity: this.opacity, blend: this.blend,
      visible: this.visible, locked: this.locked, text: this.text, shape: this.shape,
      dataLen: dataLength,
    };
  }
}

export class SeyroDocument {
  constructor(editor, width = 1200, height = 800, name = 'Sin título') {
    this.editor = editor;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.name = name;
    this.dpi = 72;
    this.layers = [];
    this.activeLayerId = null;
    this.selection = null;      // Uint8Array con 0/255
    this.selectionPath = null;  // [{x,y}] para marco/lazo
    this.selectionRect = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.dirty = false;
    this.filePath = null;
    this._composite = null;
    this._compositeDirty = true;
  }

  static create(editor, width, height, name, background = 'transparent') {
    const doc = new SeyroDocument(editor, width, height, name);
    const layer = doc.createLayer({ name: 'Fondo' });
    if (background === 'white') {
      layer.ctx.fillStyle = '#ffffff';
      layer.ctx.fillRect(0, 0, width, height);
      doc.markDirty();
    }
    doc.activeLayerId = layer.id;
    doc.fitZoom(editor.ui?.viewportSize?.() || { width: 900, height: 600 });
    return doc;
  }

  static fromDecoded(editor, decoded) {
    const imageData = imageDataFromBase64(decoded.rgba, decoded.width, decoded.height);
    const doc = new SeyroDocument(editor, decoded.width, decoded.height, decoded.name.replace(/\.[^.]+$/, ''));
    const layer = doc.createLayer({ name: decoded.name, imageData });
    doc.activeLayerId = layer.id;
    doc.fitZoom(editor.ui?.viewportSize?.() || { width: 900, height: 600 });
    return doc;
  }

  createLayer(options = {}) {
    const layer = new Layer({
      width: options.width || this.width,
      height: options.height || this.height,
      x: options.x || 0,
      y: options.y || 0,
      ...options,
    });
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    this.invalidate();
    this.markDirty();
    return layer;
  }

  activeLayer() {
    return this.layers.find((l) => l.id === this.activeLayerId) || this.layers[0] || null;
  }

  layerById(id) {
    return this.layers.find((l) => l.id === id) || null;
  }

  setActiveLayer(id) {
    if (this.layerById(id)) {
      this.activeLayerId = id;
      this.editor.ui?.renderLayers?.();
    }
  }

  removeLayer(id) {
    if (this.layers.length <= 1) return false;
    const index = this.layers.findIndex((l) => l.id === id);
    if (index < 0) return false;
    this.layers.splice(index, 1);
    if (this.activeLayerId === id) this.activeLayerId = this.layers[Math.max(0, index - 1)].id;
    this.invalidate();
    this.markDirty();
    return true;
  }

  duplicateLayer(id) {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index < 0) return null;
    const clone = this.layers[index].clone();
    this.layers.splice(index + 1, 0, clone);
    this.activeLayerId = clone.id;
    this.invalidate();
    this.markDirty();
    return clone;
  }

  moveLayer(id, direction) {
    const index = this.layers.findIndex((l) => l.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.layers.length) return false;
    [this.layers[index], this.layers[target]] = [this.layers[target], this.layers[index]];
    this.invalidate();
    this.markDirty();
    return true;
  }

  mergeDown(id) {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index <= 0) return false;
    const top = this.layers[index];
    const bottom = this.layers[index - 1];
    const tmp = makeCanvas(this.width, this.height);
    const ctx = tmp.getContext('2d');
    ctx.globalAlpha = bottom.opacity;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bottom.canvas, bottom.x, bottom.y);
    ctx.globalAlpha = top.opacity;
    ctx.globalCompositeOperation = this.blendMode(top.blend);
    ctx.drawImage(top.canvas, top.x, top.y);
    bottom.canvas = tmp;
    bottom.ctx = tmp.getContext('2d', { willReadFrequently: true });
    bottom.x = 0; bottom.y = 0; bottom.width = this.width; bottom.height = this.height;
    bottom.opacity = 1; bottom.blend = 'normal';
    this.layers.splice(index, 1);
    this.activeLayerId = bottom.id;
    this.invalidate();
    this.markDirty();
    return true;
  }

  flatten() {
    const merged = this.composite();
    this.layers = [new Layer({
      name: 'Acoplada', width: this.width, height: this.height,
      canvas: copyCanvas(merged),
    })];
    this.activeLayerId = this.layers[0].id;
    this.clearSelection();
    this.invalidate();
    this.markDirty();
    return this.layers[0];
  }

  blendMode(mode) {
    return mode === 'normal' ? 'source-over' : mode;
  }

  invalidate() {
    this._compositeDirty = true;
    this.editor.ui?.scheduleRender?.();
  }

  markDirty(value = true) {
    this.dirty = value;
    this.editor.ui?.updateTitle?.();
  }

  composite() {
    if (!this._compositeDirty && this._composite) return this._composite;
    const canvas = makeCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, this.width, this.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = this.blendMode(layer.blend);
      ctx.drawImage(layer.canvas, layer.x, layer.y);
      ctx.restore();
    }
    this._composite = canvas;
    this._compositeDirty = false;
    return canvas;
  }

  flattenedImageData() {
    return this.composite().getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, this.width, this.height);
  }

  fitZoom(viewport) {
    const pad = 48;
    const zx = (viewport.width - pad) / this.width;
    const zy = (viewport.height - pad) / this.height;
    this.zoom = Math.max(0.05, Math.min(4, Math.min(zx, zy)));
    this.panX = (viewport.width - this.width * this.zoom) / 2;
    this.panY = (viewport.height - this.height * this.zoom) / 2;
  }

  setZoom(zoom, focal) {
    const vp = this.editor.ui?.viewportSize?.() || { width: 900, height: 600 };
    const point = focal || { x: vp.width / 2, y: vp.height / 2 };
    const docX = (point.x - this.panX) / this.zoom;
    const docY = (point.y - this.panY) / this.zoom;
    this.zoom = Math.max(0.05, Math.min(16, zoom));
    this.panX = point.x - docX * this.zoom;
    this.panY = point.y - docY * this.zoom;
    this.editor.ui?.scheduleRender?.();
  }

  /** Selecciones */
  setSelectionRect(rect, mode = 'new') {
    if (mode === 'new' || !this.selection) {
      this.selection = new Uint8Array(this.width * this.height);
    }
    if (mode === 'subtract' || mode === 'intersect') {
      const other = new Uint8Array(this.width * this.height);
      this.fillMaskRect(other, rect, 255);
      for (let i = 0; i < this.selection.length; i++) {
        if (mode === 'subtract') this.selection[i] = this.selection[i] && !other[i] ? 255 : 0;
        else this.selection[i] = this.selection[i] && other[i] ? 255 : 0;
      }
    } else {
      this.fillMaskRect(this.selection, rect, mode === 'add' ? 255 : 255);
    }
    this.selectionRect = rect;
    this.selectionPath = [
      { x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height },
    ];
    this.trimSelection();
    this.editor.ui?.scheduleRender?.();
  }

  fillMaskRect(mask, rect, value) {
    const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
    const x1 = Math.min(this.width, rect.x + rect.width);
    const y1 = Math.min(this.height, rect.y + rect.height);
    for (let y = y0; y < y1; y++) mask.fill(value, y * this.width + x0, y * this.width + x1);
  }

  setSelectionPolygon(points, mode = 'new') {
    if (mode === 'new' || !this.selection) this.selection = new Uint8Array(this.width * this.height);
    const bounds = rectFromPoints(
      points.reduce((a, p) => ({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y) }), { x: Infinity, y: Infinity }),
      points.reduce((a, p) => ({ x: Math.max(a.x, p.x), y: Math.max(a.y, p.y) }), { x: -Infinity, y: -Infinity }),
    );
    for (let y = Math.max(0, bounds.y); y < Math.min(this.height, bounds.y + bounds.height); y++) {
      for (let x = Math.max(0, bounds.x); x < Math.min(this.width, bounds.x + bounds.width); x++) {
        if (pointInPolygon({ x: x + 0.5, y: y + 0.5 }, points)) {
          this.selection[y * this.width + x] = mode === 'subtract' ? 0 : 255;
        }
      }
    }
    this.selectionPath = points;
    this.selectionRect = bounds;
    this.trimSelection();
    this.editor.ui?.scheduleRender?.();
  }

  setSelectionMask(mask) {
    this.selection = mask;
    this.selectionPath = null;
    this.trimSelection();
    this.editor.ui?.scheduleRender?.();
  }

  trimSelection() {
    if (!this.selection) return;
    let minX = this.width, minY = this.height, maxX = -1, maxY = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.selection[y * this.width + x]) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    this.selectionRect = maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    if (maxX < 0) this.selectionPath = null;
    this.editor.ui?.renderSelectionInfo?.();
  }

  clearSelection() {
    this.selection = null;
    this.selectionPath = null;
    this.selectionRect = null;
    this.editor.ui?.scheduleRender?.();
    this.editor.ui?.renderSelectionInfo?.();
  }

  selectAll() {
    this.selection = new Uint8Array(this.width * this.height).fill(255);
    this.selectionRect = { x: 0, y: 0, width: this.width, height: this.height };
    this.selectionPath = [
      { x: 0, y: 0 }, { x: this.width, y: 0 },
      { x: this.width, y: this.height }, { x: 0, y: this.height },
    ];
    this.editor.ui?.scheduleRender?.();
    this.editor.ui?.renderSelectionInfo?.();
  }

  applySelectionToImageData(imageData) {
    if (!this.selection) return;
    const data = imageData.data;
    for (let i = 0; i < this.selection.length; i++) {
      if (!this.selection[i]) data[i * 4 + 3] = 0;
    }
  }

  /** Serialización para .seyro */
  snapshot() {
    return {
      name: this.name,
      width: this.width,
      height: this.height,
      dpi: this.dpi,
      layers: this.layers.map((l) => ({
        ...l.serializeMeta(),
        rgba: imageDataToBase64(l.imageData()),
      })),
      activeLayerId: this.activeLayerId,
      selection: this.selection ? Array.from(this.selection) : null,
    };
  }

  restore(snapshot) {
    this.name = snapshot.name;
    this.width = snapshot.width;
    this.height = snapshot.height;
    this.dpi = snapshot.dpi || 72;
    this.layers = snapshot.layers.map((meta) => new Layer({
      ...meta,
      canvas: null,
      imageData: imageDataFromBase64(meta.rgba, meta.width, meta.height),
    }));
    this.activeLayerId = this.layers.some((l) => l.id === snapshot.activeLayerId)
      ? snapshot.activeLayerId : this.layers[0]?.id;
    this.selection = snapshot.selection ? Uint8Array.from(snapshot.selection) : null;
    this.selectionPath = null;
    this.trimSelection();
    this.invalidate();
  }

  toProjectFile() {
    return {
      manifest: {
        format: 'seyro',
        version: 1,
        name: this.name,
        width: this.width,
        height: this.height,
        dpi: this.dpi,
        layers: this.layers.map((l) => l.serializeMeta()),
      },
      layers: this.layers.map((l) => imageDataToBase64(l.imageData())),
    };
  }

  static fromProjectFile(editor, project) {
    const m = project.manifest;
    const doc = new SeyroDocument(editor, m.width, m.height, m.name);
    doc.dpi = m.dpi || 72;
    doc.layers = m.layers.map((meta, index) => new Layer({
      ...meta,
      canvas: null,
      imageData: imageDataFromBase64(project.layers[index], meta.width, meta.height),
    }));
    doc.activeLayerId = doc.layers[0]?.id || null;
    doc.fitZoom(editor.ui?.viewportSize?.() || { width: 900, height: 600 });
    return doc;
  }
}
