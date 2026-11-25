// Pruebas deterministas de la lógica pura del frontend. Sin DOM, sin npm, sin red.
// Ejecutar: node tests/frontend.test.mjs
import assert from 'node:assert/strict';

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

console.log(`\n${passed} pruebas frontend superadas`);
