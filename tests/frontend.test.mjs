// Pruebas deterministas de la lógica pura del frontend. Sin DOM, sin npm, sin red.
// Ejecutar: node tests/frontend.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.ImageData = class {
  constructor(data, width, height) {
    this.data = data instanceof Uint8ClampedArray ? data
      : new Uint8ClampedArray(data || width * height * 4);
    this.width = width;
    this.height = height;
  }
};

const { FilterRegistry } = await import('../src/frontend/filters.js');
const { CommandHistory } = await import('../src/frontend/history.js');
const { floodSelection, ToolRegistry } = await import('../src/frontend/tools.js');
const { I18n, DICTIONARIES, SUPPORTED_LOCALES } = await import('../src/frontend/i18n.js');
const {
  clamp, hexToRgb, rgbToHex, rgbToHsl, hslToRgb, mulberry32,
  diffRect, extractRect, injectRect, rectFromPoints,
} = await import('../src/frontend/util.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok ${name}`);
}

function sample(width = 12, height = 8) {
  const data = new Uint8ClampedArray(width * height * 4);
  const rand = mulberry32(0x5eed1234);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = Math.floor(rand() * 256);
    data[i * 4 + 1] = Math.floor(rand() * 256);
    data[i * 4 + 2] = Math.floor(rand() * 256);
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

test('utilidades basicas', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.deepEqual(hexToRgb('#ff6b00'), [255, 107, 0]);
  assert.equal(rgbToHex(255, 107, 0), '#ff6b00');
  const [h, s, l] = rgbToHsl(255, 107, 0);
  const [r, g, b] = hslToRgb(h, s, l);
  assert.ok(Math.abs(r - 255) <= 1 && Math.abs(g - 107) <= 1 && Math.abs(b) <= 1);
  assert.deepEqual(rectFromPoints({ x: 9, y: 8 }, { x: 2, y: 3 }), { x: 2, y: 3, width: 7, height: 5 });
});

test('parches de pixeles limitados por bounding box', () => {
  const before = sample(8, 8);
  const after = new ImageData(new Uint8ClampedArray(before.data), 8, 8);
  after.data[(3 * 8 + 4) * 4] = 200;
  after.data[(5 * 8 + 6) * 4 + 2] = 17;
  const rect = diffRect(before.data, after.data, 8, 8);
  assert.deepEqual(rect, { x: 4, y: 3, width: 3, height: 3 });
  const patch = extractRect(after, rect);
  injectRect(before, rect, patch);
  assert.equal(diffRect(before.data, after.data, 8, 8), null);
});

test('PRNG determinista', () => {
  const a = mulberry32(1234), b = mulberry32(1234);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

const registry = new FilterRegistry();
test('registro de filtros completo', () => {
  assert.equal(registry.list().length, 18);
  assert.equal(new Set(registry.list().map((f) => f.id)).size, 18);
});

test('todos los filtros son deterministas y finitos', () => {
  for (const filter of registry.list()) {
    const params = { ...filter.defaults };
    const input = sample();
    const a = filter.apply(new ImageData(new Uint8ClampedArray(input.data), input.width, input.height), params);
    const b = filter.apply(new ImageData(new Uint8ClampedArray(input.data), input.width, input.height), params);
    assert.equal(a.width * a.height * 4, a.data.length, filter.id);
    assert.deepEqual(Array.from(a.data), Array.from(b.data), `no determinista: ${filter.id}`);
    for (let i = 0; i < a.data.length; i++) {
      assert.ok(Number.isFinite(a.data[i]), `valor no finito en ${filter.id}`);
    }
  }
});

test('invertir dos veces recupera el original', () => {
  const original = sample(16, 12);
  const once = registry.apply('invert', original);
  const twice = registry.apply('invert', once);
  for (let i = 0; i < original.data.length; i += 4) {
    assert.equal(twice.data[i], original.data[i]);
    assert.equal(twice.data[i + 1], original.data[i + 1]);
    assert.equal(twice.data[i + 2], original.data[i + 2]);
  }
});

test('historial deshace y rehace', () => {
  const calls = [];
  const editor = { ui: null, applyHistoryEntry: (entry, dir) => calls.push([entry.label, dir]) };
  const history = new CommandHistory(editor, 50);
  history.push({ label: 'A', kind: 'pixels', data: {} });
  history.push({ label: 'B', kind: 'pixels', data: {} });
  assert.equal(history.index, 2);
  assert.equal(history.undo(), true);
  assert.equal(history.undo(), true);
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), true);
  assert.equal(history.redo(), true);
  assert.equal(history.redo(), false);
  assert.deepEqual(calls, [
    ['B', 'undo'], ['A', 'undo'], ['A', 'redo'], ['B', 'redo'],
  ]);
});

test('relleno contiguo y no contiguo respetan tolerancia', () => {
  const width = 4, height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 0; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255;
  }
  for (const idx of [0, 15]) {
    data[idx * 4] = 255; data[idx * 4 + 1] = 0; data[idx * 4 + 2] = 0;
  }
  const image = { data, width, height };
  const doc = { width, height, selection: null };
  const contiguous = floodSelection(image, doc, { x: 0, y: 0 }, 12, true);
  const global = floodSelection(image, doc, { x: 0, y: 0 }, 12, false);
  assert.equal(contiguous.reduce((a, v) => a + v, 0) / 255, 1);
  assert.equal(global.reduce((a, v) => a + v, 0) / 255, 2);
});

test('relleno respeta selección y desplazamiento de capa', () => {
  const width = 4, height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
  }
  const selection = new Uint8Array(width * height);
  selection[1 * width + 1] = 255;
  const doc = { width, height, selection };
  const mask = floodSelection({ data, width, height }, doc, { x: 0, y: 0 }, 0, true, { x: 1, y: 1 });
  assert.equal(mask.reduce((a, v) => a + v, 0) / 255, 1);
});

test('cubeta con origen visible traslada la máscara a la capa activa y registra undo', () => {
  let written = null;
  const layer = {
    id: 'capa-1', x: 1, y: 1, width: 2, height: 2, locked: false,
    imageData: () => new ImageData(new Uint8ClampedArray(2 * 2 * 4), 2, 2),
    putImageData: (img) => { written = img; },
  };
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
  }
  const commits = [];
  const editor = {
    doc: {
      width: 4, height: 4, selection: null,
      activeLayer: () => layer,
      flattenedImageData: () => ({ data, width: 4, height: 4 }),
      invalidate: () => {},
    },
    state: { fgColor: '#00ff00', bgColor: '#ffffff' },
    toolOptions: { bucket: { tolerance: 0, contiguous: false, source: 'visible', useBackground: false } },
    commitPixels: (label, target, before) => commits.push([label, target.id, before]),
  };
  const bucket = new ToolRegistry(editor).get('bucket');
  bucket.onDown(editor, { x: 0, y: 0 });
  assert.ok(written);
  let green = 0;
  for (let i = 0; i < written.data.length; i += 4) {
    if (written.data[i] === 0 && written.data[i + 1] === 255) green++;
  }
  assert.equal(green, 4);
  assert.deepEqual(commits.map((c) => c[0]), ['Relleno']);
});

test('i18n resuelve idiomas, respeta fallback y expone diez locales', () => {
  const i18n = new I18n({ settings: { language: 'en' } });
  assert.equal(i18n.locale, 'en');
  assert.equal(i18n.t('welcome.title'), 'Welcome to SeyroPea');
  assert.equal(i18n.t('clave.inexistente', 'Respaldo'), 'Respaldo');
  assert.equal(SUPPORTED_LOCALES.length, 10);
  assert.ok(Object.values(DICTIONARIES.es).every((v) => typeof v === 'string'));
});

test('todas las claves i18n estáticas de la UI tienen traducción base', () => {
  const keys = new Set();
  for (const file of ['index.html', 'ui.js']) {
    const source = readFileSync(new URL(`../src/frontend/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)) keys.add(match[1]);
    for (const match of source.matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g)) keys.add(match[1]);
  }
  const missing = [...keys].filter((key) => !(key in DICTIONARIES.es));
  assert.deepEqual(missing, []);
});

test('estructura de una sola pestaña y capas sin bloqueo de clics', () => {
  const html = readFileSync(new URL('../src/frontend/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/frontend/styles.css', import.meta.url), 'utf8');
  assert.equal((html.match(/id="tabs"/g) || []).length, 1);
  assert.equal((html.match(/class="tabbar"/g) || []).length, 1);
  assert.match(html, /<div id="app" class="welcome-mode">/);
  assert.match(css, /#app\.welcome-mode \.workspace, #app\.welcome-mode \.options-bar \{ display: none; \}/);
  assert.match(css, /#modal-root \{[^}]*pointer-events: none/s);
  assert.match(css, /#toast-root \{[^}]*pointer-events: none/s);
  assert.match(css, /--checker-a:/);
  assert.match(css, /--checker-b:/);
});

const {
  sanitizeLabel, sanitizeId, safeHexColor, safeThumbnail, safeExternalUrl,
  displayPath, validateDimensions, normalizeSettings,
} = await import('../src/frontend/security.js');
const { Badge, SkeletonLoader } = await import('../src/frontend/components.js');

test('sanitización de texto, IDs y colores', () => {
  assert.equal(sanitizeLabel('  Capa\n<script>  ', 20), 'Capa<script>');
  assert.equal(sanitizeId('x" onmouseover="alert(1)'), 'id');
  assert.equal(sanitizeId('capa_1'), 'capa_1');
  assert.equal(safeHexColor('#FF6B00'), '#ff6b00');
  assert.equal(safeHexColor('"><img src=x>'), '#ffffff');
  assert.equal(safeHexColor('"><img src=x>', ''), '');
});

test('thumbnails y URLs externas solo locales o del repositorio', () => {
  assert.equal(safeThumbnail('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safeThumbnail('javascript:alert(1)'), '');
  assert.equal(safeExternalUrl('https://github.com/vDaiki-dev/seyropea'), 'https://github.com/vDaiki-dev/seyropea');
  assert.equal(safeExternalUrl('https://github.com.evil.com/'), '');
  assert.equal(displayPath('/home/../etc/passwd'), 'etc/passwd');
});

test('validación de dimensiones rechaza bombas y valores no enteros', () => {
  assert.deepEqual(validateDimensions(10, 10), { ok: true, width: 10, height: 10 });
  assert.equal(validateDimensions(0, 10).ok, false);
  assert.equal(validateDimensions(10.5, 10).ok, false);
  assert.equal(validateDimensions(10_000, 10_000).ok, false);
});

test('settings corruptos se normalizan sin propagar tipos peligrosos', () => {
  const defaults = {
    theme: 'seyro-dark-orange', language: 'es', fontSize: 13, historyLimit: 50,
    monospaceNumbers: true, recentFiles: [], customThemes: [], themeOverrides: {},
  };
  const clean = normalizeSettings({
    language: '<script>', fontSize: 9999, monospaceNumbers: 'si',
    recentFiles: ['../../secret', '/home/user/proyecto.seyro', 42],
    customThemes: [{ id: 'x" onmouseover', name: '<b>Tema</b>', palette: { accent: '"><img>' } }],
  }, defaults);
  assert.equal(clean.language, 'es');
  assert.equal(clean.fontSize, 22);
  assert.equal(clean.monospaceNumbers, true);
  assert.equal(clean.recentFiles.length, 1);
  assert.equal(clean.customThemes[0].id.startsWith('custom-'), true);
  assert.equal(clean.customThemes[0].name, '<b>Tema</b>');
  assert.equal(clean.customThemes[0].palette.accent, '#ffffff');
});

test('componentes generan HTML escapado y skeleton determinista', () => {
  assert.match(Badge.render('<img src=x>', 'accent'), /badge-accent/);
  assert.ok(!Badge.render('<img src=x>', 'accent').includes('<img'));
  const a = SkeletonLoader.render({ rows: 2, cells: 8, seed: 42 });
  const b = SkeletonLoader.render({ rows: 2, cells: 8, seed: 42 });
  assert.equal(a, b);
  assert.equal((a.match(/skeleton-dot /g) || []).length, 16);
  assert.ok(a.includes('aria-busy="true"'));
  assert.ok(!SkeletonLoader.render({ label: '<script>' }).includes('<script>'));
});

console.log(`\n${passed} pruebas frontend superadas`);
