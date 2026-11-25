// ThemeEngine: temas locales deterministas, persistencia y paleta derivada del fondo.
import { api } from './api.js';
import { clamp, downloadText, escapeHtml } from './util.js';

export const BUILTIN_THEMES = [
  {
    id: 'seyro-dark-orange',
    name: 'Seyro Dark Orange',
    palette: {
      background: '#121214', surface: '#18181b', surfaceAlt: '#222227',
      border: '#33333a', text: '#f4f4f5', textMuted: '#a1a1aa',
      accent: '#ff6b00', accentAlt: '#f97316',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    palette: {
      background: '#282a36', surface: '#343746', surfaceAlt: '#44475a',
      border: '#6272a4', text: '#f8f8f2', textMuted: '#a6a7aa',
      accent: '#ff79c6', accentAlt: '#bd93f9',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    palette: {
      background: '#1a1b26', surface: '#202233', surfaceAlt: '#292d3e',
      border: '#3b4261', text: '#c0caf5', textMuted: '#7aa2f7',
      accent: '#ff9e64', accentAlt: '#bb9af7',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    palette: {
      background: '#1e1e2e', surface: '#252536', surfaceAlt: '#313244',
      border: '#45475a', text: '#cdd6f4', textMuted: '#a6adc8',
      accent: '#f5b041', accentAlt: '#fab387',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    palette: {
      background: '#2e3440', surface: '#3b4252', surfaceAlt: '#434c5e',
      border: '#4c566a', text: '#eceff4', textMuted: '#a9b4c2',
      accent: '#d08770', accentAlt: '#ebcb8b',
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    palette: {
      background: '#282828', surface: '#32302f', surfaceAlt: '#3c3836',
      border: '#504945', text: '#ebdbb2', textMuted: '#a89984',
      accent: '#fe8019', accentAlt: '#fabd2f',
    },
  },
  {
    id: 'oled-obsidian',
    name: 'OLED Obsidian',
    palette: {
      background: '#000000', surface: '#0a0a0c', surfaceAlt: '#151518',
      border: '#26262b', text: '#fafafa', textMuted: '#8b8b93',
      accent: '#ff6b00', accentAlt: '#ff9f43',
    },
  },
];

const PALETTE_KEYS = [
  'background', 'surface', 'surfaceAlt', 'border', 'text', 'textMuted', 'accent', 'accentAlt',
];

const LABELS = {
  background: 'Fondo', surface: 'Superficie', surfaceAlt: 'Superficie alterna',
  border: 'Bordes', text: 'Texto', textMuted: 'Texto atenuado',
  accent: 'Acento', accentAlt: 'Acento secundario',
};

export class ThemeEngine {
  constructor(editor) {
    this.editor = editor;
    this.settings = editor.settings;
    this.currentId = this.settings.theme || 'seyro-dark-orange';
    this.fonts = [];
  }

  async init() {
    try {
      this.fonts = await api.listFonts();
    } catch {
      this.fonts = ['sans-serif', 'serif', 'monospace', 'system-ui'];
    }
    this.apply();
    await this.tryDetectWallpaper();
  }

  customThemes() {
    return Array.isArray(this.settings.customThemes) ? this.settings.customThemes : [];
  }

  allThemes() {
    return [...BUILTIN_THEMES, ...this.customThemes()];
  }

  find(id = this.currentId) {
    return this.allThemes().find((t) => t.id === id) || BUILTIN_THEMES[0];
  }

  resolvedPalette(id = this.currentId) {
    const theme = this.find(id);
    const overrides = this.settings.themeOverrides?.[id] || {};
    return { ...theme.palette, ...overrides };
  }

  apply() {
    const palette = this.resolvedPalette();
    const root = document.documentElement;
    for (const key of PALETTE_KEYS) {
      root.style.setProperty(`--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, palette[key]);
    }
    root.style.setProperty('--accent-soft', `${palette.accent}22`);
    root.style.setProperty('--ui-font', `"${this.settings.fontFamily || 'sans-serif'}", system-ui, sans-serif`);
    root.style.setProperty('--mono-font', '"JetBrains Mono", "DejaVu Sans Mono", "Consolas", monospace');
    root.style.fontSize = `${clamp(Number(this.settings.fontSize) || 13, 10, 22) * (Number(this.settings.fontScale) || 100) / 100}px`;
    root.dataset.theme = this.currentId;
    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = this.find().name;
    });
  }

  setTheme(id, save = true) {
    if (!this.allThemes().some((t) => t.id === id)) return false;
    this.currentId = id;
    this.settings.theme = id;
    this.apply();
    if (save) this.editor.persistSettings();
    this.editor.ui?.refreshThemeControls?.();
    return true;
  }

  setOverride(key, value) {
    this.settings.themeOverrides ||= {};
    this.settings.themeOverrides[this.currentId] ||= {};
    this.settings.themeOverrides[this.currentId][key] = value;
    this.apply();
    this.editor.persistSettings();
  }

  resetOverrides() {
    if (this.settings.themeOverrides) delete this.settings.themeOverrides[this.currentId];
    this.apply();
    this.editor.persistSettings();
  }

  saveCustom(theme) {
    const custom = this.customThemes();
    const index = custom.findIndex((t) => t.id === theme.id);
    if (index >= 0) custom[index] = theme;
    else custom.push(theme);
    this.settings.customThemes = custom;
    this.currentId = theme.id;
    this.settings.theme = theme.id;
    this.apply();
    this.editor.persistSettings();
  }

  deleteCustom(id) {
    this.settings.customThemes = this.customThemes().filter((t) => t.id !== id);
    if (this.currentId === id) this.setTheme('seyro-dark-orange');
    else this.editor.persistSettings();
  }

  cloneCurrent(name) {
    const base = this.resolvedPalette();
    const id = `custom-${Date.now().toString(36)}`;
    const theme = { id, name: name || 'Tema personalizado', palette: { ...base }, custom: true };
    this.saveCustom(theme);
    return theme;
  }

  exportCurrent() {
    const theme = { ...this.find(), palette: this.resolvedPalette(), exportedBy: 'SeyroPea 0.1.0' };
    downloadText(`${theme.id}.json`, JSON.stringify(theme, null, 2));
  }

  importTheme(text) {
    const parsed = JSON.parse(text);
    const palette = parsed.palette || parsed;
    const missing = PALETTE_KEYS.filter((k) => !palette[k]);
    if (missing.length) throw new Error(`Faltan colores: ${missing.join(', ')}`);
    const theme = {
      id: `custom-${Date.now().toString(36)}`,
      name: String(parsed.name || 'Tema importado').slice(0, 48),
      palette: Object.fromEntries(PALETTE_KEYS.map((k) => [k, palette[k]])),
      custom: true,
    };
    this.saveCustom(theme);
    return theme;
  }

  async tryDetectWallpaper() {
    if (this.settings.wallpaperAuto === false) return null;
    try {
      const path = await api.detectWallpaper();
      if (path && path !== this.settings.wallpaperPath) {
        await this.applyWallpaper(path, false);
      }
    } catch {
      // La detección es best-effort; el usuario siempre puede elegir una imagen.
    }
    return null;
  }

  async detectWallpaper() {
    const path = await api.detectWallpaper();
    if (path) await this.applyWallpaper(path);
    return path;
  }

  async chooseWallpaper() {
    const path = await api.pickImageFile();
    if (path) await this.applyWallpaper(path);
    return path;
  }

  async applyWallpaper(path, save = true) {
    const palette = await api.wallpaperPalette(path);
    const theme = {
      id: 'wallpaper-derived',
      name: 'Derivado del fondo',
      palette,
      custom: true,
      source: path,
    };
    const custom = this.customThemes().filter((t) => t.id !== 'wallpaper-derived');
    custom.push(theme);
    this.settings.customThemes = custom;
    this.settings.wallpaperPath = path;
    this.currentId = theme.id;
    this.settings.theme = theme.id;
    this.apply();
    if (save) this.editor.persistSettings();
    this.editor.ui?.refreshThemeControls?.();
    return theme;
  }

  colorInputs() {
    const palette = this.resolvedPalette();
    return PALETTE_KEYS.map((key) => `
      <label class="color-field">
        <span>${escapeHtml(LABELS[key])}</span>
        <input type="color" data-palette-key="${key}" value="${palette[key]}">
        <code data-color-code="${key}">${palette[key]}</code>
      </label>`).join('');
  }
}

export { PALETTE_KEYS, LABELS };
