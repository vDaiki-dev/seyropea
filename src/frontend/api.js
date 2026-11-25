// Puente IPC con el backend Rust. Sin fetch a Internet: solo Tauri IPC local.

function tauri() {
  return window.__TAURI__ || null;
}

export async function invoke(command, args = {}) {
  const t = tauri();
  if (!t?.core?.invoke) {
    throw new Error('SeyroPea debe ejecutarse dentro de la aplicación de escritorio');
  }
  return t.core.invoke(command, args);
}

export async function listen(event, handler) {
  const t = tauri();
  if (!t?.event?.listen) return () => {};
  return t.event.listen(event, (payload) => handler(payload));
}

export const api = {
  pickImageFile: () => invoke('pick_image_file'),
  pickProjectFile: () => invoke('pick_project_file'),
  saveProjectFile: (name) => invoke('save_project_file', { defaultName: name }),
  saveExportFile: (name, format) => invoke('save_export_file', { defaultName: name, format }),
  decodeImage: (path) => invoke('decode_image', { path }),
  encodeImage: (path, rgba, width, height, format) =>
    invoke('encode_image', { path, rgba, width, height, format }),
  writeFile: (path, dataB64) => invoke('write_file', { path, dataB64 }),
  saveProject: (path, project) => invoke('save_project', { path, project }),
  loadProject: (path) => invoke('load_project', { path }),
  loadSettings: () => invoke('load_settings'),
  saveSettings: (settings) => invoke('save_settings', { settings }),
  saveThemeFile: (name, theme) => invoke('save_theme_file', { name, theme }),
  listThemeFiles: () => invoke('list_theme_files'),
  listFonts: () => invoke('list_fonts'),
  wallpaperPalette: (path) => invoke('wallpaper_palette', { path }),
  detectWallpaper: () => invoke('detect_wallpaper'),
  checkUpdates: () => invoke('check_updates'),
  appInfo: () => invoke('app_info'),
  openUrl: (url) => invoke('open_url', { url }),
  setMenuLocale: (locale) => invoke('set_menu_locale', { locale }),
  recentProjects: (paths) => invoke('recent_projects', { paths }),
  backupProject: (name, project) => invoke('backup_project', { name, project }),
  closeWindow: () => invoke('close_window'),
};
