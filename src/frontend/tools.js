// ToolRegistry: herramientas de edición deterministas sobre capas raster.
import { uid, clamp, rectFromPoints, rgbToHex, cloneImageData } from './util.js';
import { Layer } from './document.js';

function pointToLayer(layer, point) {
  return { x: point.x - layer.x, y: point.y - layer.y };
}

function makeLayerCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

function applySelectionToCanvas(temp, layer, doc, erase = false) {
  if (!doc.selection) return temp;
  const data = temp.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, temp.width, temp.height);
  for (let y = 0; y < temp.height; y++) {
    for (let x = 0; x < temp.width; x++) {
      const dx = layer.x + x, dy = layer.y + y;
      const inside = dx >= 0 && dy >= 0 && dx < doc.width && dy < doc.height &&
        doc.selection[dy * doc.width + dx];
      if (!inside) data.data[(y * temp.width + x) * 4 + 3] = 0;
    }
  }
  temp.getContext('2d').putImageData(data, 0, 0);
  return temp;
}

function stampPath(layer, doc, points, options, erase) {
  const temp = makeLayerCanvas(layer.width, layer.height);
  const ctx = temp.getContext('2d');
  const size = clamp(Number(options.size) || 8, 1, 400);
  const hardness = clamp(Number(options.hardness ?? 80), 0, 100) / 100;
  const color = options.useBackground ? options.bgColor : options.fgColor;
  const alpha = clamp(Number(options.opacity ?? 100), 1, 100) / 100;
  const dense = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0) { dense.push(p); continue; }
    const prev = points[i - 1];
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, size * 0.18)));
    for (let s = 1; s <= steps; s++) {
      dense.push({ x: prev.x + (p.x - prev.x) * s / steps, y: prev.y + (p.y - prev.y) * s / steps });
    }
  }
  for (const pt of dense) {
    const local = pointToLayer(layer, pt);
    const radius = size / 2;
    const gradient = ctx.createRadialGradient(local.x, local.y, radius * hardness * 0.85, local.x, local.y, radius);
    if (erase) {
      gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
      gradient.addColorStop(1, `rgba(0,0,0,${alpha * (1 - hardness) * 0.4})`);
    } else {
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(local.x, local.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  applySelectionToCanvas(temp, layer, doc, erase);
  layer.ctx.save();
  layer.ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  layer.ctx.globalAlpha = 1;
  layer.ctx.drawImage(temp, 0, 0);
  layer.ctx.restore();
}

function colorDistance(a, i, r, g, b, alpha) {
  const dr = a[i] - r, dg = a[i + 1] - g, db = a[i + 2] - b, da = a[i + 3] - alpha;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da) / Math.sqrt(4 * 255 * 255);
}

function floodSelection(imageData, doc, start, tolerance, contiguous, offset = { x: 0, y: 0 }) {
  const { width: w, height: h, data } = imageData;
  const sx = Math.floor(start.x), sy = Math.floor(start.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return new Uint8Array(w * h);
  const p = (sy * w + sx) * 4;
  const target = [data[p], data[p + 1], data[p + 2], data[p + 3]];
  const limit = clamp(tolerance, 0, 100) / 100;
  const mask = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    if (colorDistance(data, i, ...target) > limit) continue;
    const dx = (idx % w) + offset.x;
    const dy = Math.floor(idx / w) + offset.y;
    if (doc.selection && (dx < 0 || dy < 0 || dx >= doc.width || dy >= doc.height || !doc.selection[dy * doc.width + dx])) continue;
    mask[idx] = 255;
    if (!contiguous) continue;
    const x = idx % w, y = Math.floor(idx / w);
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  return mask;
}

export function renderTextLayer(layer) {
  const t = layer.text;
  if (!t) return;
  const canvas = makeLayerCanvas(layer.width, layer.height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = t.color || '#ffffff';
  ctx.font = `${Number(t.weight) || 400} ${Number(t.fontSize) || 32}px ${t.fontFamily || 'sans-serif'}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = t.align || 'left';
  const lines = String(t.text).split('\n');
  const lineHeight = (Number(t.lineHeight) || 1.2) * (Number(t.fontSize) || 32);
  const anchorX = t.align === 'center' ? canvas.width / 2 : t.align === 'right' ? canvas.width : 0;
  if (t.background && t.background !== 'transparent') {
    ctx.fillStyle = t.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = t.color || '#ffffff';
  }
  lines.forEach((line, i) => ctx.fillText(line, anchorX, i * lineHeight, canvas.width));
  layer.canvas = canvas;
  layer.ctx = canvas.getContext('2d', { willReadFrequently: true });
}

function renderShapeLayer(layer) {
  const s = layer.shape;
  if (!s) return;
  const canvas = makeLayerCanvas(layer.width, layer.height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = Math.max(0, Number(s.strokeWidth) || 0) / 2 + 1;
  ctx.beginPath();
  if (s.shape === 'ellipse') {
    ctx.ellipse(layer.width / 2, layer.height / 2,
      Math.max(1, layer.width / 2 - pad), Math.max(1, layer.height / 2 - pad), 0, 0, Math.PI * 2);
  } else if (s.shape === 'line') {
    ctx.moveTo(pad, layer.height - pad);
    ctx.lineTo(layer.width - pad, pad);
  } else {
    const r = Math.min(Number(s.radius) || 0, layer.width / 2, layer.height / 2);
    ctx.roundRect ? ctx.roundRect(pad, pad, layer.width - pad * 2, layer.height - pad * 2, r)
      : ctx.rect(pad, pad, layer.width - pad * 2, layer.height - pad * 2);
  }
  if (s.fill && s.fill !== 'transparent') {
    ctx.fillStyle = s.fill;
    if (s.shape === 'line') { ctx.lineWidth = Number(s.strokeWidth) || 1; ctx.strokeStyle = s.fill; ctx.stroke(); }
    else ctx.fill();
  }
  if (s.stroke && s.stroke !== 'transparent' && Number(s.strokeWidth) > 0) {
    ctx.lineWidth = Number(s.strokeWidth);
    ctx.strokeStyle = s.stroke;
    ctx.stroke();
  }
  layer.canvas = canvas;
  layer.ctx = canvas.getContext('2d', { willReadFrequently: true });
}

function transformLayerCanvas(layer, rect, angle) {
  const source = document.createElement('canvas');
  source.width = layer.width;
  source.height = layer.height;
  source.getContext('2d').drawImage(layer.canvas, 0, 0);
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const out = makeLayerCanvas(w, h);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.translate(w / 2, h / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.scale(rect.scaleX || 1, rect.scaleY || 1);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  layer.canvas = out;
  layer.ctx = ctx;
  layer.width = w;
  layer.height = h;
}

function handleAt(box, point) {
  const hs = [
    { x: box.x, y: box.y, id: 'nw' }, { x: box.x + box.width / 2, y: box.y, id: 'n' },
    { x: box.x + box.width, y: box.y, id: 'ne' }, { x: box.x + box.width, y: box.y + box.height / 2, id: 'e' },
    { x: box.x + box.width, y: box.y + box.height, id: 'se' },
    { x: box.x + box.width / 2, y: box.y + box.height, id: 's' },
    { x: box.x, y: box.y + box.height, id: 'sw' }, { x: box.x, y: box.y + box.height / 2, id: 'w' },
  ];
  return hs.find((h) => Math.hypot(h.x - point.x, h.y - point.y) <= 8 / (point.zoom || 1));
}

const TOOL_DEFS = [
  {
    id: 'move', key: 'V', label: 'Mover', icon: '✥', cursor: 'move',
    options: [{ key: 'autoSelect', label: 'Seleccionar capa bajo el puntero', type: 'check', value: true }],
    onDown(editor, ctx, s) {
      const layer = editor.doc.activeLayer();
      if (!layer) return;
      if (editor.toolOptions.move.autoSelect) {
        const hit = editor.doc.layers.slice().reverse().find((l) =>
          l.visible && ctx.x >= l.x && ctx.y >= l.y && ctx.x < l.x + l.width && ctx.y < l.y + l.height);
        if (hit) { editor.doc.setActiveLayer(hit.id); s.layer = hit; }
      }
      s.layer = editor.doc.activeLayer();
      s.from = { x: s.layer.x, y: s.layer.y };
      s.start = { x: ctx.x, y: ctx.y };
    },
    onMove(editor, ctx, s) {
      if (!s.layer) return;
      s.layer.x = Math.round(s.from.x + ctx.x - s.start.x);
      s.layer.y = Math.round(s.from.y + ctx.y - s.start.y);
      editor.doc.invalidate();
    },
    onUp(editor, ctx, s) {
      if (!s.layer) return;
      if (s.layer.x !== s.from.x || s.layer.y !== s.from.y) {
        editor.pushHistory({
          label: 'Mover capa', kind: 'move',
          data: { layerId: s.layer.id, from: s.from, to: { x: s.layer.x, y: s.layer.y } },
        });
      }
    },
  },
  {
    id: 'transform', key: '', label: 'Transformar', icon: '⤢', cursor: 'move',
    options: [{ key: 'angle', label: 'Rotación (°)', type: 'range', min: -180, max: 180, value: 0, step: 1 }],
    onActivate(editor) {
      const layer = editor.doc.activeLayer();
      if (!layer) return;
      editor.state.transform = {
        layerId: layer.id,
        box: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, scaleX: 1, scaleY: 1 },
        original: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
        angle: 0,
      };
      editor.ui.scheduleRender();
    },
    onDeactivate(editor) {
      editor.state.transform = null;
      editor.ui.scheduleRender();
    },
    onDown(editor, ctx, s) {
      const t = editor.state.transform;
      if (!t) return;
      s.transform = t;
      s.handle = handleAt(t.box, { ...ctx, zoom: editor.doc.zoom });
      s.start = { x: ctx.x, y: ctx.y };
      s.original = { ...t.box };
      if (!s.handle) {
        s.mode = 'move';
        s.boxStart = { x: t.box.x, y: t.box.y };
      }
    },
    onMove(editor, ctx, s) {
      if (!s.transform) return;
      const t = s.transform;
      const dx = ctx.x - s.start.x, dy = ctx.y - s.start.y;
      if (s.mode === 'move') {
        t.box.x = s.boxStart.x + dx;
        t.box.y = s.boxStart.y + dy;
      } else if (s.handle) {
        const h = s.handle.id;
        if (h.includes('e')) t.box.width = Math.max(8, s.original.width + dx);
        if (h.includes('s')) t.box.height = Math.max(8, s.original.height + dy);
        if (h.includes('w')) { t.box.x = s.original.x + dx; t.box.width = Math.max(8, s.original.width - dx); }
        if (h.includes('n')) { t.box.y = s.original.y + dy; t.box.height = Math.max(8, s.original.height - dy); }
        t.box.scaleX = t.box.width / s.original.width;
        t.box.scaleY = t.box.height / s.original.height;
      }
      t.angle = Number(editor.toolOptions.transform.angle) || 0;
      editor.ui.scheduleRender();
    },
    onUp(editor, ctx, s) {
      const t = s.transform;
      if (!t) return;
      const layer = editor.doc.layerById(t.layerId);
      if (!layer) return;
      const changed = t.box.x !== t.original.x || t.box.y !== t.original.y ||
        Math.abs(t.box.scaleX - 1) > 0.001 || Math.abs(t.box.scaleY - 1) > 0.001 || t.angle !== 0;
      if (changed) {
        editor.pushStructural('Transformar capa', () => {
          transformLayerCanvas(layer, t.box, t.angle);
          layer.x = Math.round(t.box.x);
          layer.y = Math.round(t.box.y);
          layer.invalidate?.();
          editor.doc.invalidate();
        });
      }
      editor.state.transform = null;
      editor.setTool('move');
    },
  },
  {
    id: 'marquee', key: 'M', label: 'Marco rectangular', icon: '▧', cursor: 'crosshair',
    options: [{
      key: 'mode', label: 'Modo', type: 'select', value: 'new',
      choices: [['new', 'Nueva'], ['add', 'Añadir'], ['subtract', 'Restar'], ['intersect', 'Intersección']],
    }],
    onDown(editor, ctx, s) { s.start = { x: ctx.x, y: ctx.y }; s.mode = editor.toolOptions.marquee.mode; },
    onMove(editor, ctx, s) {
      if (!s.start) return;
      s.rect = rectFromPoints(s.start, ctx);
      editor.state.previewRect = s.rect;
      editor.ui.scheduleRender();
    },
    onUp(editor, ctx, s) {
      editor.state.previewRect = null;
      if (s.rect) editor.doc.setSelectionRect(s.rect, s.mode);
    },
  },
  {
    id: 'lasso', key: 'L', label: 'Lazo', icon: '⌁', cursor: 'crosshair',
    options: [{
      key: 'mode', label: 'Modo', type: 'select', value: 'new',
      choices: [['new', 'Nueva'], ['add', 'Añadir'], ['subtract', 'Restar']],
    }],
    onDown(editor, ctx, s) { s.points = [{ x: ctx.x, y: ctx.y }]; },
    onMove(editor, ctx, s) {
      if (!s.points) return;
      const last = s.points[s.points.length - 1];
      if (Math.hypot(ctx.x - last.x, ctx.y - last.y) > 2 / editor.doc.zoom) s.points.push({ x: ctx.x, y: ctx.y });
      editor.state.previewPolygon = s.points;
      editor.ui.scheduleRender();
    },
    onUp(editor, ctx, s) {
      editor.state.previewPolygon = null;
      if (s.points?.length >= 3) editor.doc.setSelectionPolygon(s.points, editor.toolOptions.lasso.mode);
    },
  },
  {
    id: 'wand', key: 'W', label: 'Varita mágica', icon: '✦', cursor: 'crosshair',
    options: [
      { key: 'tolerance', label: 'Tolerancia %', type: 'range', min: 0, max: 100, value: 12, step: 1 },
      { key: 'contiguous', label: 'Contiguo', type: 'check', value: true },
    ],
    onDown(editor, ctx) {
      const mask = floodSelection(
        editor.doc.composite().getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, editor.doc.width, editor.doc.height),
        editor.doc, { x: ctx.x, y: ctx.y },
        editor.toolOptions.wand.tolerance, editor.toolOptions.wand.contiguous,
      );
      editor.doc.setSelectionMask(mask);
    },
  },
  {
    id: 'crop', key: 'C', label: 'Recortar', icon: '▢', cursor: 'crosshair',
    options: [],
    onDown(editor, ctx, s) { s.start = { x: ctx.x, y: ctx.y }; },
    onMove(editor, ctx, s) {
      if (!s.start) return;
      s.rect = rectFromPoints(s.start, ctx);
      editor.state.cropRect = s.rect;
      editor.ui.scheduleRender();
    },
    onUp(editor, ctx, s) {
      editor.state.cropRect = null;
      if (s.rect && s.rect.width > 2 && s.rect.height > 2) editor.cropDocument(s.rect);
    },
  },
  {
    id: 'eyedropper', key: 'I', label: 'Cuentagotas', icon: '◉', cursor: 'crosshair',
    options: [{ key: 'sampleSize', label: 'Muestreo', type: 'select', value: '1', choices: [['1', '1 px'], ['3', '3×3'], ['5', '5×5']] }],
    onDown(editor, ctx) {
      const doc = editor.doc;
      const size = Number(editor.toolOptions.eyedropper.sampleSize) || 1;
      const image = doc.flattenedImageData();
      let r = 0, g = 0, b = 0, n = 0;
      const half = Math.floor(size / 2);
      for (let y = Math.max(0, Math.floor(ctx.y) - half); y < Math.min(doc.height, Math.floor(ctx.y) + half + 1); y++) {
        for (let x = Math.max(0, Math.floor(ctx.x) - half); x < Math.min(doc.width, Math.floor(ctx.x) + half + 1); x++) {
          const i = (y * doc.width + x) * 4;
          r += image.data[i]; g += image.data[i + 1]; b += image.data[i + 2]; n++;
        }
      }
      if (n) {
        editor.state.fgColor = rgbToHex(r / n, g / n, b / n);
        editor.ui.updateColorControls?.();
      }
    },
  },
  {
    id: 'brush', key: 'B', label: 'Pincel', icon: '✎', cursor: 'crosshair',
    options: [
      { key: 'size', label: 'Tamaño', type: 'range', min: 1, max: 200, value: 14, step: 1 },
      { key: 'hardness', label: 'Dureza %', type: 'range', min: 0, max: 100, value: 85, step: 1 },
      { key: 'opacity', label: 'Opacidad %', type: 'range', min: 1, max: 100, value: 100, step: 1 },
      { key: 'useBackground', label: 'Usar color de fondo', type: 'check', value: false },
    ],
    onDown(editor, ctx, s) {
      const layer = editor.doc.activeLayer();
      if (!layer || layer.locked) return;
      s.layer = layer;
      s.before = layer.imageData();
      s.points = [{ x: ctx.x, y: ctx.y }];
      stampPath(layer, editor.doc, s.points, {
        ...editor.toolOptions.brush, fgColor: editor.state.fgColor, bgColor: editor.state.bgColor,
      }, false);
      editor.doc.invalidate();
    },
    onMove(editor, ctx, s) {
      if (!s.layer) return;
      s.points.push({ x: ctx.x, y: ctx.y });
      stampPath(s.layer, editor.doc, s.points.slice(-12), {
        ...editor.toolOptions.brush, fgColor: editor.state.fgColor, bgColor: editor.state.bgColor,
      }, false);
      editor.doc.invalidate();
    },
    onUp(editor, ctx, s) {
      if (s.layer && s.before) editor.commitPixels('Pincel', s.layer, s.before);
    },
  },
  {
    id: 'eraser', key: 'E', label: 'Borrador', icon: '◐', cursor: 'crosshair',
    options: [
      { key: 'size', label: 'Tamaño', type: 'range', min: 1, max: 200, value: 20, step: 1 },
      { key: 'hardness', label: 'Dureza %', type: 'range', min: 0, max: 100, value: 90, step: 1 },
      { key: 'opacity', label: 'Opacidad %', type: 'range', min: 1, max: 100, value: 100, step: 1 },
    ],
    onDown(editor, ctx, s) {
      const layer = editor.doc.activeLayer();
      if (!layer || layer.locked) return;
      s.layer = layer;
      s.before = layer.imageData();
      s.points = [{ x: ctx.x, y: ctx.y }];
      stampPath(layer, editor.doc, s.points, { ...editor.toolOptions.eraser, bgColor: editor.state.bgColor }, true);
      editor.doc.invalidate();
    },
    onMove(editor, ctx, s) {
      if (!s.layer) return;
      s.points.push({ x: ctx.x, y: ctx.y });
      stampPath(s.layer, editor.doc, s.points.slice(-12), { ...editor.toolOptions.eraser }, true);
      editor.doc.invalidate();
    },
    onUp(editor, ctx, s) {
      if (s.layer && s.before) editor.commitPixels('Borrador', s.layer, s.before);
    },
  },
  {
    id: 'bucket', key: 'G', label: 'Relleno', icon: '▣', cursor: 'crosshair',
    options: [
      { key: 'tolerance', label: 'Tolerancia %', type: 'range', min: 0, max: 100, value: 10, step: 1 },
      { key: 'contiguous', label: 'Contiguo', type: 'check', value: true },
      { key: 'useBackground', label: 'Usar color de fondo', type: 'check', value: false },
    ],
    onDown(editor, ctx) {
      const layer = editor.doc.activeLayer();
      if (!layer || layer.locked) return;
      const original = layer.imageData();
      const working = cloneImageData(original);
      const local = pointToLayer(layer, ctx);
      const mask = floodSelection(working, editor.doc, local,
        editor.toolOptions.bucket.tolerance, editor.toolOptions.bucket.contiguous,
        { x: layer.x, y: layer.y });
      const color = editor.toolOptions.bucket.useBackground ? editor.state.bgColor : editor.state.fgColor;
      const hex = color.replace('#', '');
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const p = i * 4;
        working.data[p] = rgb[0]; working.data[p + 1] = rgb[1]; working.data[p + 2] = rgb[2]; working.data[p + 3] = 255;
      }
      layer.putImageData(working);
      editor.doc.invalidate();
      editor.commitPixels('Relleno', layer, original);
    },
  },
  {
    id: 'text', key: 'T', label: 'Texto', icon: 'T', cursor: 'text',
    options: [
      { key: 'text', label: 'Texto', type: 'text', value: 'Escribe aquí' },
      { key: 'fontFamily', label: 'Fuente', type: 'font', value: 'sans-serif' },
      { key: 'fontSize', label: 'Tamaño', type: 'range', min: 8, max: 160, value: 40, step: 1 },
      { key: 'color', label: 'Color', type: 'color', value: '#ffffff' },
    ],
    onDown(editor, ctx) {
      const opts = editor.toolOptions.text;
      const size = Number(opts.fontSize) || 40;
      let layer;
      editor.pushStructural('Nuevo texto', () => {
        layer = editor.doc.createLayer({
          name: 'Texto',
          kind: 'text',
          x: Math.round(ctx.x), y: Math.round(ctx.y),
          width: Math.max(40, Math.ceil(String(opts.text).length * size * 0.62)),
          height: Math.ceil(size * 1.5 * String(opts.text).split('\n').length),
          text: {
            text: opts.text, fontFamily: opts.fontFamily, fontSize: size, weight: 400,
            color: opts.color || editor.state.fgColor, align: 'left', lineHeight: 1.2,
          },
        });
        renderTextLayer(layer);
      });
      editor.ui.openTextEditor?.(layer);
    },
  },
  {
    id: 'shape', key: 'U', label: 'Formas', icon: '◇', cursor: 'crosshair',
    options: [
      { key: 'shape', label: 'Forma', type: 'select', value: 'rect', choices: [['rect', 'Rectángulo'], ['ellipse', 'Elipse'], ['line', 'Línea']] },
      { key: 'fill', label: 'Relleno', type: 'color', value: 'transparent' },
      { key: 'stroke', label: 'Trazo', type: 'color', value: '#ffffff' },
      { key: 'strokeWidth', label: 'Grosor', type: 'range', min: 0, max: 20, value: 2, step: 1 },
      { key: 'radius', label: 'Radio', type: 'range', min: 0, max: 80, value: 0, step: 1 },
    ],
    onDown(editor, ctx, s) { s.start = { x: ctx.x, y: ctx.y }; },
    onMove(editor, ctx, s) {
      if (!s.start) return;
      s.rect = rectFromPoints(s.start, ctx);
      editor.state.previewRect = s.rect;
      editor.ui.scheduleRender();
    },
    onUp(editor, ctx, s) {
      editor.state.previewRect = null;
      if (!s.rect || s.rect.width < 3 || s.rect.height < 3) return;
      const opts = editor.toolOptions.shape;
      editor.pushStructural('Nueva forma', () => {
        const layer = editor.doc.createLayer({
          name: opts.shape === 'ellipse' ? 'Elipse' : opts.shape === 'line' ? 'Línea' : 'Rectángulo',
          kind: 'shape', x: s.rect.x, y: s.rect.y, width: s.rect.width, height: s.rect.height,
          shape: {
            shape: opts.shape, fill: opts.fill, stroke: opts.stroke,
            strokeWidth: Number(opts.strokeWidth) || 0, radius: Number(opts.radius) || 0,
          },
        });
        renderShapeLayer(layer);
      });
    },
  },
  {
    id: 'hand', key: 'H', label: 'Mano', icon: '✋', cursor: 'grab',
    options: [],
    onDown(editor, ctx, s) { s.start = { x: ctx.raw.x, y: ctx.raw.y }; s.pan = { x: editor.doc.panX, y: editor.doc.panY }; },
    onMove(editor, ctx, s) {
      if (!s.start) return;
      editor.doc.panX = s.pan.x + ctx.raw.x - s.start.x;
      editor.doc.panY = s.pan.y + ctx.raw.y - s.start.y;
      editor.ui.scheduleRender();
    },
  },
  {
    id: 'zoom', key: 'Z', label: 'Zoom', icon: '⌕', cursor: 'zoom-in',
    options: [],
    onDown(editor, ctx) {
      const factor = ctx.event.altKey ? 1 / 1.25 : 1.25;
      editor.doc.setZoom(editor.doc.zoom * factor, ctx.raw);
      editor.ui.renderStatus?.();
    },
  },
];

export class ToolRegistry {
  constructor(editor) {
    this.editor = editor;
    this.tools = new Map();
    this.keyMap = new Map();
    this.current = 'move';
    for (const def of TOOL_DEFS) this.register(def);
  }

  register(def) {
    this.tools.set(def.id, def);
    if (def.key) this.keyMap.set(def.key.toLowerCase(), def.id);
  }

  list() { return [...this.tools.values()]; }
  get(id) { return this.tools.get(id); }
  currentTool() { return this.tools.get(this.current); }

  setTool(id) {
    if (!this.tools.has(id)) return false;
    const previous = this.currentTool();
    if (previous?.onDeactivate) previous.onDeactivate(this.editor);
    this.current = id;
    const tool = this.currentTool();
    if (tool?.onActivate) tool.onActivate(this.editor);
    this.editor.ui?.renderToolbar?.();
    this.editor.ui?.renderToolOptions?.();
    this.editor.ui?.renderStatus?.();
    return true;
  }

  fromKey(key) { return this.keyMap.get(String(key).toLowerCase()); }

  dispatch(method, ctx) {
    const tool = this.currentTool();
    if (!tool?.[method]) return;
    if (!this._drag && method === 'onDown') this._drag = {};
    tool[method](this.editor, ctx, this._drag || {});
    if (method === 'onUp') {
      this._drag = null;
      this.editor.doc?.markDirty?.();
    }
  }
}

export { renderShapeLayer, TOOL_DEFS };
