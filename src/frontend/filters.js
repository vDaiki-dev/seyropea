// Registro de filtros: operaciones algorítmicas deterministas sobre ImageData RGBA8.
// Ninguna función usa IA, redes neuronales ni servicios externos.
import { clamp, cloneImageData, hexToRgb, rgbToHsl, hslToRgb, mulberry32 } from './util.js';

function prefixBlur(source, radius, horizontal) {
  const { width: w, height: h, data } = source;
  const out = new Uint8ClampedArray(data.length);
  const r = Math.max(0, Math.floor(radius));
  const channels = 4;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w * channels;
      const sums = new Float64Array((w + 1) * channels);
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < channels; c++) {
          sums[(x + 1) * channels + c] = sums[x * channels + c] + data[row + x * channels + c];
        }
      }
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const n = x1 - x0;
        for (let c = 0; c < channels; c++) {
          out[row + x * channels + c] =
            (sums[x1 * channels + c] - sums[x0 * channels + c]) / n;
        }
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      const sums = new Float64Array((h + 1) * channels);
      for (let y = 0; y < h; y++) {
        for (let c = 0; c < channels; c++) {
          sums[(y + 1) * channels + c] = sums[y * channels + c] + data[(y * w + x) * channels + c];
        }
      }
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        const n = y1 - y0;
        for (let c = 0; c < channels; c++) {
          out[(y * w + x) * channels + c] =
            (sums[y1 * channels + c] - sums[y0 * channels + c]) / n;
        }
      }
    }
  }
  return out;
}

function boxBlur(source, radius) {
  const tmp = new ImageData(prefixBlur(source, radius, true), source.width, source.height);
  return new ImageData(prefixBlur(tmp, radius, false), source.width, source.height);
}

function gaussianKernel(radius) {
  const r = Math.max(1, Math.floor(radius));
  const sigma = Math.max(0.6, r / 2);
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  return k.map((v) => v / sum);
}

function convolve1d(source, kernel, horizontal) {
  const { width: w, height: h, data } = source;
  const out = new Uint8ClampedArray(data.length);
  const r = (kernel.length - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0, rr = 0, g = 0, b = 0;
      for (let i = -r; i <= r; i++) {
        const xx = clamp(x + (horizontal ? i : 0), 0, w - 1);
        const yy = clamp(y + (horizontal ? 0 : i), 0, h - 1);
        const p = (yy * w + xx) * 4;
        const weight = kernel[i + r];
        a += data[p + 3] * weight;
        rr += data[p] * weight;
        g += data[p + 1] * weight;
        b += data[p + 2] * weight;
      }
      const q = (y * w + x) * 4;
      out[q] = rr; out[q + 1] = g; out[q + 2] = b; out[q + 3] = a;
    }
  }
  return out;
}

function gaussianBlur(source, radius) {
  const k = gaussianKernel(radius);
  const tmp = new ImageData(convolve1d(source, k, true), source.width, source.height);
  return new ImageData(convolve1d(tmp, k, false), source.width, source.height);
}

function transformData(source, mode) {
  const { width: w, height: h, data } = source;
  const swap = mode === 'rotate90' || mode === 'rotate270';
  const nw = swap ? h : w;
  const nh = swap ? w : h;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx = x, ny = y;
      if (mode === 'flipH') nx = w - 1 - x;
      else if (mode === 'flipV') ny = h - 1 - y;
      else if (mode === 'rotate180') { nx = w - 1 - x; ny = h - 1 - y; }
      else if (mode === 'rotate90') { nx = h - 1 - y; ny = x; }
      else if (mode === 'rotate270') { nx = y; ny = w - 1 - x; }
      const src = (y * w + x) * 4;
      const dst = (ny * nw + nx) * 4;
      out.set(data.subarray(src, src + 4), dst);
    }
  }
  return new ImageData(out, nw, nh);
}

export const CORE_FILTERS = [
  {
    id: 'gaussian', label: 'Desenfoque Gaussiano', group: 'Desenfoque',
    defaults: { radius: 6 },
    controls: [{ key: 'radius', label: 'Radio', min: 1, max: 40, step: 1 }],
    apply: (image, p) => gaussianBlur(image, p.radius),
  },
  {
    id: 'box', label: 'Desenfoque de Caja', group: 'Desenfoque',
    defaults: { radius: 6 },
    controls: [{ key: 'radius', label: 'Radio', min: 1, max: 60, step: 1 }],
    apply: (image, p) => boxBlur(image, p.radius),
  },
  {
    id: 'unsharp', label: 'Enfoque (Unsharp Mask)', group: 'Enfoque',
    defaults: { radius: 2, amount: 120 },
    controls: [
      { key: 'radius', label: 'Radio', min: 1, max: 12, step: 1 },
      { key: 'amount', label: 'Intensidad %', min: 10, max: 300, step: 5 },
    ],
    apply: (image, p) => {
      const blur = gaussianBlur(image, p.radius).data;
      const out = cloneImageData(image);
      const k = p.amount / 100;
      for (let i = 0; i < out.data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          out.data[i + c] = clamp(out.data[i + c] + (out.data[i + c] - blur[i + c]) * k, 0, 255);
        }
      }
      return out;
    },
  },
  {
    id: 'vignette', label: 'Viñeta', group: 'Estilo',
    defaults: { strength: 45, radius: 70 },
    controls: [
      { key: 'strength', label: 'Intensidad %', min: 0, max: 100, step: 1 },
      { key: 'radius', label: 'Radio %', min: 20, max: 100, step: 1 },
    ],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const { width: w, height: h } = image;
      const cx = w / 2, cy = h / 2;
      const max = Math.hypot(cx, cy) || 1;
      const start = clamp(p.radius / 100, 0.1, 1);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy) / max;
          const t = clamp((d - start) / Math.max(0.001, 1 - start), 0, 1);
          const f = 1 - (p.strength / 100) * (t * t * (3 - 2 * t));
          const i = (y * w + x) * 4;
          out.data[i] *= f; out.data[i + 1] *= f; out.data[i + 2] *= f;
        }
      }
      return out;
    },
  },
  {
    id: 'noise', label: 'Ruido', group: 'Estilo',
    defaults: { amount: 20, mono: 0 },
    controls: [
      { key: 'amount', label: 'Intensidad %', min: 1, max: 100, step: 1 },
      { key: 'mono', label: 'Monocromo (0/1)', min: 0, max: 1, step: 1 },
    ],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const rnd = mulberry32(0x5eed1234); // semilla fija: resultado reproducible
      const amp = (p.amount / 100) * 255;
      for (let i = 0; i < out.data.length; i += 4) {
        const base = (rnd() - 0.5) * amp;
        for (let c = 0; c < 3; c++) {
          const delta = p.mono ? base : (rnd() - 0.5) * amp;
          out.data[i + c] = clamp(out.data[i + c] + delta, 0, 255);
        }
      }
      return out;
    },
  },
  {
    id: 'pixelate', label: 'Pixelar', group: 'Estilo',
    defaults: { size: 8 },
    controls: [{ key: 'size', label: 'Tamaño de bloque', min: 2, max: 64, step: 1 }],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const size = Math.max(2, Math.floor(p.size));
      const { width: w, height: h } = image;
      for (let by = 0; by < h; by += size) {
        for (let bx = 0; bx < w; bx += size) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          const ex = Math.min(w, bx + size), ey = Math.min(h, by + size);
          for (let y = by; y < ey; y++) {
            for (let x = bx; x < ex; x++) {
              const i = (y * w + x) * 4;
              r += image.data[i]; g += image.data[i + 1];
              b += image.data[i + 2]; a += image.data[i + 3]; n++;
            }
          }
          r /= n; g /= n; b /= n; a /= n;
          for (let y = by; y < ey; y++) {
            for (let x = bx; x < ex; x++) {
              const i = (y * w + x) * 4;
              out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = a;
            }
          }
        }
      }
      return out;
    },
  },
];

export const ADJUSTMENTS = [
  {
    id: 'brightness', label: 'Brillo / Contraste', group: 'Ajustes',
    defaults: { brightness: 0, contrast: 0 },
    controls: [
      { key: 'brightness', label: 'Brillo', min: -100, max: 100, step: 1 },
      { key: 'contrast', label: 'Contraste', min: -100, max: 100, step: 1 },
    ],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const c = p.contrast;
      const factor = (259 * (c + 255)) / (255 * (259 - c));
      const add = p.brightness * 2.55;
      for (let i = 0; i < out.data.length; i += 4) {
        for (let k = 0; k < 3; k++) {
          out.data[i + k] = clamp(factor * (out.data[i + k] - 128) + 128 + add, 0, 255);
        }
      }
      return out;
    },
  },
  {
    id: 'huesat', label: 'Tono / Saturación', group: 'Ajustes',
    defaults: { hue: 0, saturation: 0, lightness: 0 },
    controls: [
      { key: 'hue', label: 'Tono (°)', min: -180, max: 180, step: 1 },
      { key: 'saturation', label: 'Saturación %', min: -100, max: 100, step: 1 },
      { key: 'lightness', label: 'Luminosidad %', min: -100, max: 100, step: 1 },
    ],
    apply: (image, p) => {
      const out = cloneImageData(image);
      for (let i = 0; i < out.data.length; i += 4) {
        const [h, s, l] = rgbToHsl(out.data[i], out.data[i + 1], out.data[i + 2]);
        const rgb = hslToRgb(
          h + p.hue / 360,
          clamp(s * (1 + p.saturation / 100), 0, 1),
          clamp(l + p.lightness / 200, 0, 1),
        );
        out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2];
      }
      return out;
    },
  },
  {
    id: 'levels', label: 'Niveles', group: 'Ajustes',
    defaults: { black: 0, white: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    controls: [
      { key: 'black', label: 'Negro de entrada', min: 0, max: 200, step: 1 },
      { key: 'white', label: 'Blanco de entrada', min: 55, max: 255, step: 1 },
      { key: 'gamma', label: 'Gamma', min: 0.2, max: 3, step: 0.05 },
      { key: 'outBlack', label: 'Negro de salida', min: 0, max: 100, step: 1 },
      { key: 'outWhite', label: 'Blanco de salida', min: 155, max: 255, step: 1 },
    ],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const lo = Math.min(p.black, p.white - 1);
      const span = Math.max(1, p.white - lo);
      const oSpan = Math.max(0, p.outWhite - p.outBlack);
      for (let i = 0; i < out.data.length; i += 4) {
        for (let k = 0; k < 3; k++) {
          const v = clamp((out.data[i + k] - lo) / span, 0, 1) ** (1 / Math.max(0.01, p.gamma));
          out.data[i + k] = clamp(p.outBlack + v * oSpan, 0, 255);
        }
      }
      return out;
    },
  },
  {
    id: 'exposure', label: 'Exposición', group: 'Ajustes',
    defaults: { stops: 0 },
    controls: [{ key: 'stops', label: 'Pasos EV', min: -3, max: 3, step: 0.05 }],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const f = 2 ** p.stops;
      for (let i = 0; i < out.data.length; i += 4) {
        for (let k = 0; k < 3; k++) out.data[i + k] = clamp(out.data[i + k] * f, 0, 255);
      }
      return out;
    },
  },
  {
    id: 'invert', label: 'Invertir', group: 'Ajustes',
    defaults: {}, controls: [],
    apply: (image) => {
      const out = cloneImageData(image);
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = 255 - out.data[i];
        out.data[i + 1] = 255 - out.data[i + 1];
        out.data[i + 2] = 255 - out.data[i + 2];
      }
      return out;
    },
  },
  {
    id: 'desaturate', label: 'Desaturar', group: 'Ajustes',
    defaults: {}, controls: [],
    apply: (image) => {
      const out = cloneImageData(image);
      for (let i = 0; i < out.data.length; i += 4) {
        const y = 0.2126 * out.data[i] + 0.7152 * out.data[i + 1] + 0.0722 * out.data[i + 2];
        out.data[i] = out.data[i + 1] = out.data[i + 2] = y;
      }
      return out;
    },
  },
  {
    id: 'tint', label: 'Teñir con color', group: 'Ajustes',
    defaults: { color: '#ff6b00', strength: 35 },
    controls: [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'strength', label: 'Intensidad %', min: 0, max: 100, step: 1 },
    ],
    apply: (image, p) => {
      const out = cloneImageData(image);
      const [r, g, b] = hexToRgb(p.color);
      const a = clamp(p.strength / 100, 0, 1);
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = out.data[i] * (1 - a) + r * a;
        out.data[i + 1] = out.data[i + 1] * (1 - a) + g * a;
        out.data[i + 2] = out.data[i + 2] * (1 - a) + b * a;
      }
      return out;
    },
  },
];

export const TRANSFORMS = [
  { id: 'rotate90', label: 'Rotar 90° horario', apply: (image) => transformData(image, 'rotate90') },
  { id: 'rotate270', label: 'Rotar 90° antihorario', apply: (image) => transformData(image, 'rotate270') },
  { id: 'rotate180', label: 'Rotar 180°', apply: (image) => transformData(image, 'rotate180') },
  { id: 'flipH', label: 'Voltear horizontal', apply: (image) => transformData(image, 'flipH') },
  { id: 'flipV', label: 'Voltear vertical', apply: (image) => transformData(image, 'flipV') },
];

export class FilterRegistry {
  constructor() {
    this.filters = new Map();
    for (const f of [...CORE_FILTERS, ...ADJUSTMENTS, ...TRANSFORMS]) this.register(f);
  }

  register(filter) {
    if (!filter?.id || typeof filter.apply !== 'function') throw new Error('Filtro inválido');
    this.filters.set(filter.id, { defaults: {}, controls: [], ...filter });
  }

  get(id) { return this.filters.get(id); }
  list() { return [...this.filters.values()]; }
  byGroup() {
    const groups = new Map();
    for (const f of this.list()) {
      const key = f.group || 'Transformaciones';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    return groups;
  }

  apply(id, imageData, params = {}) {
    const filter = this.get(id);
    if (!filter) throw new Error(`Filtro desconocido: ${id}`);
    const values = { ...filter.defaults, ...params };
    return filter.apply(imageData, values);
  }
}
