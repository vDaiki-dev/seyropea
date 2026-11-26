//! Configuración local persistente: tema, tipografía, recientes y temas personalizados.
//! Todo se guarda en el directorio de configuración del usuario; ninguna llamada de red.

use crate::security;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const LOCALES: &[&str] = &["es", "en", "pt", "hi", "ru", "zh", "fr", "de", "ja", "ar"];
const PALETTE_KEYS: &[&str] = &[
    "background",
    "surface",
    "surfaceAlt",
    "border",
    "text",
    "textMuted",
    "accent",
    "accentAlt",
];

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
        "language": "es",
        "autoBackup": true,
        "showRulers": true,
        "showGrid": false,
        "smartGuides": true,
        "pngColors": 0,
        "pngOptimized": true,
        "wallpaperAuto": true,
        "wallpaperPath": null
    })
}

fn as_bool(value: Option<&Value>, fallback: bool) -> bool {
    value.and_then(Value::as_bool).unwrap_or(fallback)
}

fn as_u32(value: Option<&Value>, fallback: u32, min: u32, max: u32) -> u32 {
    value
        .and_then(Value::as_u64)
        .map(|n| n.clamp(min as u64, max as u64) as u32)
        .unwrap_or(fallback)
}

fn sanitize_palette(value: Option<&Value>) -> Value {
    let mut out = Map::new();
    for key in PALETTE_KEYS {
        if let Some(color) = value
            .and_then(Value::as_object)
            .and_then(|o| o.get(*key))
            .and_then(Value::as_str)
            .and_then(security::safe_hex_color)
        {
            out.insert((*key).to_string(), json!(color));
        }
    }
    Value::Object(out)
}

fn sanitize_custom_themes(value: Option<&Value>) -> Value {
    let items = value
        .and_then(Value::as_array)
        .map(|a| a.as_slice())
        .unwrap_or(&[]);
    let mut out = Vec::new();
    for item in items.iter().take(20) {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(id) = object
            .get("id")
            .and_then(Value::as_str)
            .and_then(security::safe_id)
        else {
            continue;
        };
        let palette = sanitize_palette(object.get("palette"));
        if !PALETTE_KEYS.iter().all(|key| palette.get(*key).is_some()) {
            continue;
        }
        let source = object
            .get("source")
            .and_then(Value::as_str)
            .and_then(|p| security::checked_path(p).ok())
            .map(|p| json!(p.to_string_lossy()));
        out.push(json!({
            "id": id,
            "name": security::sanitize_label(object.get("name").and_then(Value::as_str).unwrap_or("Tema"), 48),
            "palette": palette,
            "custom": true,
            "source": source,
        }));
    }
    Value::Array(out)
}

fn sanitize_recent_files(value: Option<&Value>) -> Value {
    let items = value
        .and_then(Value::as_array)
        .map(|a| a.as_slice())
        .unwrap_or(&[]);
    let mut out = Vec::new();
    for item in items.iter().take(12) {
        let Some(path) = item.as_str() else { continue };
        let Ok(checked) = security::checked_path(path) else {
            continue;
        };
        if security::require_extension(&checked, "seyro").is_err() {
            continue;
        }
        out.push(json!(checked.to_string_lossy()));
    }
    Value::Array(out)
}

/// Normaliza y acota un `Value` arbitrario antes de persistirlo.
pub fn sanitize_settings(value: &Value) -> Result<Value, String> {
    let serialized = serde_json::to_string(value).map_err(|e| e.to_string())?;
    if serialized.len() > security::MAX_SETTINGS_BYTES {
        return Err("Configuración demasiado grande".into());
    }
    let object = value.as_object().ok_or("Configuración no válida")?;
    let default = default_settings();
    let mut out = default.clone();
    let target = out.as_object_mut().expect("default_settings es un objeto");

    let theme = object
        .get("theme")
        .and_then(Value::as_str)
        .and_then(security::safe_id)
        .unwrap_or_else(|| "seyro-dark-orange".into());
    target.insert("theme".into(), json!(theme));

    let language = object
        .get("language")
        .and_then(Value::as_str)
        .filter(|l| LOCALES.contains(l))
        .unwrap_or("es")
        .to_string();
    target.insert("language".into(), json!(language));

    let font = object
        .get("fontFamily")
        .and_then(Value::as_str)
        .map(|f| security::sanitize_label(f, 60))
        .filter(|f| {
            !f.is_empty()
                && f.chars()
                    .all(|c| c.is_ascii_alphanumeric() || " -_".contains(c))
        })
        .unwrap_or_else(|| "sans-serif".into());
    target.insert("fontFamily".into(), json!(font));

    for (key, fallback, min, max) in [
        ("fontSize", 13, 10, 22),
        ("fontScale", 100, 80, 140),
        ("historyLimit", 50, 10, 200),
        ("pngColors", 0, 0, 256),
    ] {
        let n = as_u32(object.get(key), fallback, min, max);
        target.insert(key.into(), json!(n));
    }
    for key in [
        "monospaceNumbers",
        "checkUpdates",
        "autoBackup",
        "showRulers",
        "showGrid",
        "smartGuides",
        "wallpaperAuto",
        "pngOptimized",
    ] {
        let fallback = as_bool(default.get(key), false);
        target.insert(key.into(), json!(as_bool(object.get(key), fallback)));
    }

    target.insert(
        "customThemes".into(),
        sanitize_custom_themes(object.get("customThemes")),
    );
    target.insert(
        "recentFiles".into(),
        sanitize_recent_files(object.get("recentFiles")),
    );

    let mut overrides = Map::new();
    if let Some(map) = object.get("themeOverrides").and_then(Value::as_object) {
        for (id, palette) in map.iter().take(20) {
            if let Some(id) = security::safe_id(id) {
                overrides.insert(id, sanitize_palette(Some(palette)));
            }
        }
    }
    target.insert("themeOverrides".into(), Value::Object(overrides));

    let wallpaper = object
        .get("wallpaperPath")
        .and_then(Value::as_str)
        .and_then(|p| security::checked_path(p).ok())
        .map(|p| json!(p.to_string_lossy()))
        .unwrap_or(Value::Null);
    target.insert("wallpaperPath".into(), wallpaper);
    Ok(out)
}

pub fn load() -> Value {
    let path = settings_path();
    let Ok(text) = std::fs::read_to_string(&path) else {
        return default_settings();
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(user) => sanitize_settings(&user).unwrap_or_else(|_| default_settings()),
        Err(_) => default_settings(),
    }
}

pub fn save(value: &Value) -> Result<(), String> {
    let sanitized = sanitize_settings(value)?;
    let dir = config_dir();
    std::fs::create_dir_all(dir.join("themes"))
        .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;
    let tmp = settings_path().with_extension("json.tmp");
    std::fs::write(
        &tmp,
        serde_json::to_string_pretty(&sanitized).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("No se pudo guardar settings.json: {e}"))?;
    std::fs::rename(&tmp, settings_path())
        .map_err(|e| format!("No se pudo finalizar settings.json: {e}"))
}

pub fn save_theme_file(name: &str, theme: &Value) -> Result<String, String> {
    let serialized = serde_json::to_string(theme).map_err(|e| e.to_string())?;
    if serialized.len() > security::MAX_SETTINGS_BYTES {
        return Err("Tema demasiado grande".into());
    }
    let safe = security::safe_id(name).ok_or("Nombre de tema no válido")?;
    let palette = sanitize_palette(theme.get("palette"));
    if !PALETTE_KEYS.iter().all(|key| palette.get(*key).is_some()) {
        return Err("Paleta de tema no válida".into());
    }
    let theme = json!({
        "id": safe,
        "name": security::sanitize_label(theme.get("name").and_then(Value::as_str).unwrap_or("Tema"), 48),
        "palette": palette,
        "custom": true,
    });
    let dir = config_dir().join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{safe}.json"));
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&theme).map_err(|e| e.to_string())?,
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
                    if let Ok(clean) = sanitize_settings(&json!({ "customThemes": [value] })) {
                        if let Some(theme) = clean
                            .get("customThemes")
                            .and_then(Value::as_array)
                            .and_then(|a| a.first())
                        {
                            out.push(json!({ "file": path.to_string_lossy(), "theme": theme }));
                        }
                    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_untrusted_settings() {
        let input = json!({
            "language": "<script>",
            "recentFiles": ["../../secret", "/home/user/proyecto.seyro", 42],
            "fontSize": 9999,
            "customThemes": [{"id": "x\" onmouseover", "name": "Tema", "palette": {}}]
        });
        let clean = sanitize_settings(&input).unwrap();
        assert_eq!(clean["language"], "es");
        assert_eq!(clean["recentFiles"].as_array().unwrap().len(), 1);
        assert_eq!(clean["fontSize"], 22);
        assert_eq!(clean["customThemes"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn accepts_known_locale_and_color() {
        let input = json!({
            "language": "en",
            "themeOverrides": {"dracula": {"accent": "#FF79C6"}}
        });
        let clean = sanitize_settings(&input).unwrap();
        assert_eq!(clean["language"], "en");
        assert_eq!(clean["themeOverrides"]["dracula"]["accent"], "#ff79c6");
    }
}
