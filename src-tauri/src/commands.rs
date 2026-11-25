//! Comandos IPC expuestos al frontend. El frontend nunca necesita permisos de sistema de archivos
//! directos: el backend valida y realiza todas las operaciones locales.

use crate::codec::{self, DecodedImage};
use crate::fonts;
use crate::seyro::{self, ProjectFile};
use crate::themes::{self, Palette};
use crate::updater::{self, UpdateInfo};
use crate::wallpaper;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};

fn path_of(file: Option<FilePath>) -> Option<std::path::PathBuf> {
    file?.into_path().ok()
}

#[tauri::command]
pub async fn pick_image_file(app: AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .set_title("Abrir imagen")
        .add_filter(
            "Imágenes soportadas",
            &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
        )
        .blocking_pick_file();
    Ok(path_of(file).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn pick_project_file(app: AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .set_title("Abrir proyecto SeyroPea")
        .add_filter("Proyectos SeyroPea", &["seyro"])
        .blocking_pick_file();
    Ok(path_of(file).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn save_project_file(
    app: AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .set_title("Guardar proyecto")
        .set_file_name(default_name)
        .add_filter("Proyecto SeyroPea", &["seyro"])
        .blocking_save_file();
    Ok(path_of(file).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn save_export_file(
    app: AppHandle,
    default_name: String,
    format: String,
) -> Result<Option<String>, String> {
    let extensions: &[&str] = match format.as_str() {
        "png" => &["png"],
        "jpg" => &["jpg", "jpeg"],
        "webp" => &["webp"],
        "bmp" => &["bmp"],
        _ => &["png", "jpg", "webp", "bmp"],
    };
    let file = app
        .dialog()
        .file()
        .set_title("Exportar imagen")
        .set_file_name(default_name)
        .add_filter(format!("Imagen {}", format.to_uppercase()), extensions)
        .blocking_save_file();
    Ok(path_of(file).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn decode_image(path: String) -> Result<DecodedImage, String> {
    codec::decode_file(std::path::Path::new(&path))
}

#[tauri::command]
pub fn encode_image(
    path: String,
    rgba: String,
    width: u32,
    height: u32,
    format: String,
) -> Result<(), String> {
    codec::encode_file(std::path::Path::new(&path), &rgba, width, height, &format)
}

/// Escritura genérica de bytes (base64) para exportaciones generadas en el lienzo o por UPNG.js.
#[tauri::command]
pub fn write_file(path: String, data_b64: String) -> Result<(), String> {
    let bytes = B64
        .decode(&data_b64)
        .map_err(|e| format!("Datos inválidos: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("No se pudo escribir el archivo: {e}"))
}

#[tauri::command]
pub fn save_project(path: String, project: ProjectFile) -> Result<(), String> {
    seyro::save(std::path::Path::new(&path), &project)
}

#[tauri::command]
pub fn load_project(path: String) -> Result<ProjectFile, String> {
    seyro::load(std::path::Path::new(&path))
}

#[tauri::command]
pub fn load_settings() -> Value {
    crate::settings::load()
}

#[tauri::command]
pub fn save_settings(settings: Value) -> Result<(), String> {
    crate::settings::save(&settings)
}

#[tauri::command]
pub fn save_theme_file(name: String, theme: Value) -> Result<String, String> {
    crate::settings::save_theme_file(&name, &theme)
}

#[tauri::command]
pub fn list_theme_files() -> Value {
    Value::Array(crate::settings::list_theme_files())
}

#[tauri::command]
pub fn list_fonts() -> Vec<String> {
    fonts::list_fonts()
}

#[tauri::command]
pub fn wallpaper_palette(path: String) -> Result<Palette, String> {
    themes::palette_from_image(std::path::Path::new(&path))
}

#[tauri::command]
pub fn detect_wallpaper() -> Option<String> {
    wallpaper::detect_wallpaper()
}

#[tauri::command]
pub fn check_updates() -> Option<UpdateInfo> {
    updater::check_updates()
}

#[tauri::command]
pub fn app_info() -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "SeyroPea",
        "offline": true,
        "ai": false,
        "license": "GPL-3.0-only",
        "repository": "https://github.com/vDaiki-dev/seyropea"
    })
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://github.com/") || url.starts_with("http://localhost")) {
        return Err("URL no permitida".into());
    }
    #[cfg(target_os = "windows")]
    let cmd = "cmd";
    #[cfg(target_os = "windows")]
    let args = ["/c", "start", "", &url];
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(target_os = "macos")]
    let args = [&url];
    #[cfg(target_os = "linux")]
    let cmd = "xdg-open";
    #[cfg(target_os = "linux")]
    let args = [&url];
    let _ = std::process::Command::new(cmd).args(args).spawn();
    Ok(())
}

/// Metadatos ligeros de proyectos recientes: nombre, dimensiones y fecha de modificación.
#[tauri::command]
pub fn recent_projects(paths: Vec<String>) -> Value {
    let items: Vec<Value> = paths
        .into_iter()
        .filter_map(|path_string| {
            let path = std::path::PathBuf::from(&path_string);
            let manifest = seyro::manifest(&path).ok()?;
            let modified = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() * 1000);
            Some(json!({
                "path": path_string,
                "name": manifest.name,
                "width": manifest.width,
                "height": manifest.height,
                "layers": manifest.layers.len(),
                "updatedAt": modified,
            }))
        })
        .collect();
    json!(items)
}

/// Copia local de seguridad; nunca sale del directorio de configuración de SeyroPea.
#[tauri::command]
pub fn backup_project(name: String, project: ProjectFile) -> Result<String, String> {
    let dir = crate::settings::config_dir().join("backups");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear la carpeta de respaldos: {e}"))?;
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(60)
        .collect();
    let file_name = if safe.is_empty() {
        "sin-titulo.autosave.seyro".to_string()
    } else {
        format!("{safe}.autosave.seyro")
    };
    let path = dir.join(file_name);
    seyro::save(&path, &project)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_menu_locale(app: AppHandle, locale: String) -> Result<(), String> {
    crate::build_menu(&app, &locale).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "No se encontró la ventana principal".to_string())?;
    window.close().map_err(|e| e.to_string())
}
