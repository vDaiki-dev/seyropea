//! Comandos IPC expuestos al frontend. El frontend nunca necesita permisos de sistema de archivos
//! directos: el backend valida y realiza todas las operaciones locales.

use crate::codec::{self, DecodedImage};
use crate::fonts;
use crate::seyro::{self, ProjectFile};
use crate::themes::{self, Palette};
use crate::updater::{self, UpdateInfo};
use crate::wallpaper;
use crate::{security, settings};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use url::Url;

fn path_of(file: Option<FilePath>) -> Option<String> {
    let path = file?.into_path().ok()?;
    security::checked_path(&path.to_string_lossy())
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

fn safe_default_name(name: &str, fallback: &str) -> String {
    let clean = security::sanitize_label(name, 80);
    if clean.is_empty() {
        fallback.to_string()
    } else {
        clean
    }
}

#[tauri::command]
pub fn pick_image_file(app: AppHandle) -> Option<String> {
    let file = app
        .dialog()
        .file()
        .set_title("Abrir imagen")
        .add_filter(
            "Imágenes soportadas",
            &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
        )
        .blocking_pick_file();
    path_of(file)
}

#[tauri::command]
pub fn pick_project_file(app: AppHandle) -> Option<String> {
    let file = app
        .dialog()
        .file()
        .set_title("Abrir proyecto SeyroPea")
        .add_filter("Proyectos SeyroPea", &["seyro"])
        .blocking_pick_file();
    path_of(file)
}

#[tauri::command]
pub fn save_project_file(app: AppHandle, default_name: String) -> Option<String> {
    let file = app
        .dialog()
        .file()
        .set_title("Guardar proyecto")
        .set_file_name(safe_default_name(&default_name, "proyecto.seyro"))
        .add_filter("Proyecto SeyroPea", &["seyro"])
        .blocking_save_file();
    path_of(file)
}

#[tauri::command]
pub fn save_export_file(app: AppHandle, default_name: String, format: String) -> Option<String> {
    let extensions: &[&str] = match format.as_str() {
        "png" => &["png"],
        "jpg" => &["jpg", "jpeg"],
        "webp" => &["webp"],
        "bmp" => &["bmp"],
        _ => &["png", "jpg", "webp", "bmp"],
    };
    let name = safe_default_name(&default_name, "imagen.png");
    let file = app
        .dialog()
        .file()
        .set_title("Exportar imagen")
        .set_file_name(name)
        .add_filter(
            format!(
                "Imagen {}",
                security::sanitize_label(&format, 8).to_uppercase()
            ),
            extensions,
        )
        .blocking_save_file();
    path_of(file)
}

#[tauri::command]
pub fn decode_image(path: String) -> Result<DecodedImage, String> {
    let path = security::checked_path(&path)?;
    codec::decode_file(&path)
}

#[tauri::command]
pub fn encode_image(
    path: String,
    rgba: String,
    width: u32,
    height: u32,
    format: String,
) -> Result<(), String> {
    let path = security::checked_path(&path)?;
    let expected = security::validate_dimensions(width, height)?;
    security::check_base64_len(rgba.len())?;
    let decoded = B64
        .decode(&rgba)
        .map_err(|e| format!("RGBA base64 inválido: {e}"))?;
    if decoded.len() != expected {
        return Err("Tamaño de píxeles inconsistente".into());
    }
    codec::encode_file(&path, &rgba, width, height, &format)
}

/// Escritura de bytes para exportaciones generadas en el lienzo o por UPNG.js.
#[tauri::command]
pub fn write_file(path: String, data_b64: String) -> Result<(), String> {
    let path = security::checked_path(&path)?;
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp") {
        return Err("Formato de exportación no permitido".into());
    }
    security::check_base64_len(data_b64.len())?;
    let bytes = B64
        .decode(&data_b64)
        .map_err(|e| format!("Datos inválidos: {e}"))?;
    if bytes.len() > security::MAX_FILE_BYTES as usize {
        return Err("Archivo generado demasiado grande".into());
    }
    std::fs::write(&path, bytes).map_err(|e| format!("No se pudo escribir el archivo: {e}"))
}

#[tauri::command]
pub fn save_project(path: String, project: ProjectFile) -> Result<(), String> {
    let path = security::checked_path(&path)?;
    security::require_extension(&path, "seyro")?;
    seyro::save(&path, &project)
}

#[tauri::command]
pub fn load_project(path: String) -> Result<ProjectFile, String> {
    let path = security::checked_path(&path)?;
    security::require_extension(&path, "seyro")?;
    seyro::load(&path)
}

#[tauri::command]
pub fn load_settings() -> Value {
    settings::load()
}

#[tauri::command]
pub fn save_settings(settings_value: Value) -> Result<(), String> {
    settings::save(&settings::sanitize_settings(&settings_value)?)
}

#[tauri::command]
pub fn save_theme_file(name: String, theme: Value) -> Result<String, String> {
    settings::save_theme_file(&security::sanitize_label(&name, 48), &theme)
}

#[tauri::command]
pub fn list_theme_files() -> Value {
    Value::Array(settings::list_theme_files())
}

#[tauri::command]
pub fn list_fonts() -> Vec<String> {
    fonts::list_fonts()
}

#[tauri::command]
pub fn wallpaper_palette(path: String) -> Result<Palette, String> {
    let path = security::checked_path(&path)?;
    themes::palette_from_image(&path)
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

/// Solo se abre el repositorio del proyecto o localhost; nunca se pasa por shell.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let raw = security::sanitize_label(&url, 2048);
    let parsed = Url::parse(&raw).map_err(|_| "URL no válida".to_string())?;
    if !parsed.username().is_empty() || parsed.password().is_some_and(|p| !p.is_empty()) {
        return Err("URL no permitida".into());
    }
    let allowed = match parsed.scheme() {
        "https" => {
            parsed.host_str() == Some("github.com")
                && parsed
                    .path()
                    .trim_start_matches('/')
                    .starts_with("vDaiki-dev/seyropea")
        }
        "http" => parsed.host_str() == Some("localhost"),
        _ => false,
    };
    if !allowed {
        return Err("URL no permitida".into());
    }
    #[cfg(target_os = "windows")]
    let (cmd, args) = ("explorer", vec![parsed.to_string()]);
    #[cfg(target_os = "macos")]
    let (cmd, args) = ("open", vec![parsed.to_string()]);
    #[cfg(target_os = "linux")]
    let (cmd, args) = ("xdg-open", vec![parsed.to_string()]);
    let _ = std::process::Command::new(cmd).args(args).spawn();
    Ok(())
}

/// Metadatos ligeros de proyectos recientes: nombre, dimensiones y fecha de modificación.
#[tauri::command]
pub fn recent_projects(paths: Vec<String>) -> Value {
    let items: Vec<Value> = paths
        .into_iter()
        .take(12)
        .filter_map(|path_string| {
            let path = security::checked_path(&path_string).ok()?;
            security::require_extension(&path, "seyro").ok()?;
            let manifest = seyro::manifest(&path).ok()?;
            let modified = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() * 1000);
            Some(json!({
                "path": path.to_string_lossy(),
                "name": security::sanitize_label(&manifest.name, 120),
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
    let dir = settings::config_dir().join("backups");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear la carpeta de respaldos: {e}"))?;
    let safe = security::sanitize_label(&name, 60)
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
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
    let locale = security::safe_id(&locale).ok_or("Idioma no válido")?;
    app.emit("menu-locale-changed", &locale).ok();
    crate::build_menu(&app, &locale).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "No se encontró la ventana principal".to_string())?;
    window.close().map_err(|e| e.to_string())
}
