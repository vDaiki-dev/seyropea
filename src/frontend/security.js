// Validaciones ligeras y deterministas para texto, rutas, IDs y dimensiones.
// Se usan tanto en la UI como en las pruebas; nunca realizan E/S ni acceso a red.

export const MAX_LABEL_LENGTH = 120;
export const MAX_DOCUMENT_PIXELS = 40_000_000;
export const MAX_DIMENSION = 20_000;

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Elimina caracteres de control y espacios sobrantes sin interpretar HTML. */
export function stripControlChars(value) {
  return String(value ?? '').replace(CONTROL_CHARS, '').trim();
}

/** Texto seguro para nombres de documento, capas, temas y metadatos visibles. */
export function sanitizeLabel(value, max = MAX_LABEL_LENGTH) {
  return stripControlChars(value).slice(0, max);
}

/** IDs seguros para atributos data-* y claves de historial/manifiesto. */
export function sanitizeId(value, fallback = 'id') {
  const id = stripControlChars(value);
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : fallback;
}

/** Solo colores HEX de 6 dígitos; bloquea inyección en atributos y estilos. */
export function safeHexColor(value, fallback = '#ffffff') {
  const color = stripControlChars(value).replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(color) ? `#${color.toLowerCase()}` : fallback;
}

/** Solo miniatureas locales embebidas; bloquea javascript:, file: y URLs remotas. */
export function safeThumbnail(src) {
  const value = stripControlChars(src);
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  return '';
}

/** URL externa permitida: únicamente el repositorio del proyecto o localhost. */
export function safeExternalUrl(url) {
  const value = stripControlChars(url);
  const repo = /^https:\/\/github\.com\/vDaiki-dev\/seyropea(?:[/?#].*)?$/;
  const local = /^http:\/\/localhost(?::\d+)?(?:[/?#].*)?$/;
  return repo.test(value) || local.test(value) ? value : '';
}

/** Normaliza una ruta para mostrarla: sin caracteres de control ni traversal. */
export function displayPath(value, max = 512) {
  const text = stripControlChars(value).replace(/[\\/]+/g, '/');
  const parts = [];
  for (const part of text.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { parts.pop(); continue; }
    parts.push(part);
  }
  return parts.join('/').slice(0, max);
}

const KNOWN_LOCALES = new Set(['es', 'en', 'pt', 'hi', 'ru', 'zh', 'fr', 'de', 'ja', 'ar']);
export const isAbsolutePath = (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
const BOOLEAN_KEYS = new Set([
  'monospaceNumbers', 'checkUpdates', 'autoBackup', 'showRulers', 'showGrid',
  'smartGuides', 'pngOptimized', 'wallpaperAuto',
]);
const NUMBER_RANGES = {
  fontSize: [10, 22], fontScale: [80, 140], historyLimit: [10, 200], pngColors: [0, 256],
};

/** Normaliza settings no confiables usando los valores por defecto como plantilla. */
export function normalizeSettings(input, defaults) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (BOOLEAN_KEYS.has(key)) {
      out[key] = typeof src[key] === 'boolean' ? src[key] : fallback;
    } else if (NUMBER_RANGES[key]) {
      const [min, max] = NUMBER_RANGES[key];
      out[key] = Number.isFinite(src[key]) ? Math.min(max, Math.max(min, Math.floor(src[key]))) : fallback;
    } else if (key === 'recentFiles') {
      out[key] = Array.isArray(src[key])
        ? src[key]
          .filter((p) => typeof p === 'string' && isAbsolutePath(p))
          .slice(0, 12)
          .map((p) => displayPath(p, 512))
        : [];
    } else if (key === 'customThemes') {
      out[key] = Array.isArray(src[key])
        ? src[key].filter((t) => t && typeof t === 'object' && t.palette).slice(0, 20).map((t) => ({
          ...t,
          id: sanitizeId(t.id, `custom-${Math.random().toString(36).slice(2, 8)}`),
          name: sanitizeLabel(t.name || 'Tema', 48),
          palette: Object.fromEntries(
            Object.entries(t.palette).map(([k, v]) => [sanitizeId(k, 'accent'), safeHexColor(v)]),
          ),
        }))
        : [];
    } else if (key === 'themeOverrides') {
      const raw = src[key];
      out[key] = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw).slice(0, 20).map(([id, palette]) => [
          sanitizeId(id, 'custom'),
          palette && typeof palette === 'object'
            ? Object.fromEntries(Object.entries(palette).map(([k, v]) => [sanitizeId(k, 'accent'), safeHexColor(v)]))
            : {},
        ]))
        : {};
    } else if (key === 'fontFamily') {
      const font = sanitizeLabel(src[key] ?? fallback, 60);
      out[key] = /^[A-Za-z0-9 _-]+$/.test(font) ? font : fallback;
    } else if (key === 'language') {
      out[key] = KNOWN_LOCALES.has(src[key]) ? src[key] : fallback;
    } else if (typeof fallback === 'string') {
      out[key] = sanitizeLabel(src[key] ?? fallback, 80) || fallback;
    }
  }
  return out;
}

/** Valida dimensiones enteras y el total de píxeles antes de asignar buffers. */
export function validateDimensions(width, height, {
  maxDimension = MAX_DIMENSION,
  maxPixels = MAX_DOCUMENT_PIXELS,
} = {}) {
  const w = Number(width), h = Number(height);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    return { ok: false, reason: 'Dimensiones no válidas' };
  }
  if (w > maxDimension || h > maxDimension) {
    return { ok: false, reason: 'Dimensiones fuera del límite' };
  }
  if (w > Math.floor(maxPixels / h)) {
    return { ok: false, reason: 'Imagen demasiado grande' };
  }
  return { ok: true, width: w, height: h };
}
