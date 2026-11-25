//! Configuración local persistente: tema, tipografía, recientes y temas personalizados.
//! Todo se guarda en el directorio de configuración del usuario; ninguna llamada de red.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("seyropea")
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn default_settings() -> Value {
    json!({
        "theme": "seyro-dark-orange",
        "fontFamily": "sans-serif",
        "fontSize": 13,
        "fontScale": 100,
        "monospaceNumbers": true,
        "customThemes": [],
        "themeOverrides": {},
        "recentFiles": [],
        "checkUpdates": true,
        "historyLimit": 50,
        "showRulers": true,
        "showGrid": false,
        "smartGuides": true
    })
}

pub fn load() -> Value {
    let path = settings_path();
    let Ok(text) = std::fs::read_to_string(&path) else {
        return default_settings();
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(user) => {
            let mut merged = default_settings();
            if let (Some(target), Some(source)) = (merged.as_object_mut(), user.as_object()) {
                for (key, value) in source {
                    target.insert(key.clone(), value.clone());
                }
            }
            merged
        }
        Err(_) => default_settings(),
    }
}

pub fn save(value: &Value) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(dir.join("themes"))
        .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;
    let tmp = settings_path().with_extension("json.tmp");
    std::fs::write(
        &tmp,
        serde_json::to_string_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("No se pudo guardar settings.json: {e}"))?;
    std::fs::rename(&tmp, settings_path())
        .map_err(|e| format!("No se pudo finalizar settings.json: {e}"))
}

pub fn save_theme_file(name: &str, theme: &Value) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if safe.is_empty() {
        return Err("Nombre de tema no válido".into());
    }
    let dir = config_dir().join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{safe}.json"));
    std::fs::write(
        &path,
        serde_json::to_string_pretty(theme).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("No se pudo guardar el tema: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

pub fn list_theme_files() -> Vec<Value> {
    let dir = config_dir().join("themes");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    out.push(json!({
                        "file": path.to_string_lossy(),
                        "theme": value
                    }));
                }
            }
        }
    }
    out
}

pub fn remove_recent(path: &Path) -> Value {
    let mut settings = load();
    if let Some(recents) = settings
        .get_mut("recentFiles")
        .and_then(|v| v.as_array_mut())
    {
        recents.retain(|v| v.as_str() != Some(&path.to_string_lossy()));
    }
    let _ = save(&settings);
    settings
}
