//! Validación de frontera para comandos IPC, metadatos y buffers.
//! Todas las funciones son puras: no abren archivos ni acceden a la red.

use std::path::{Component, Path, PathBuf};

pub const MAX_PATH_LEN: usize = 4096;
pub const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_BASE64_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_RGBA_BYTES: usize = 256 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_SETTINGS_BYTES: usize = 1024 * 1024;
pub const MAX_LAYERS: usize = 128;
pub const MAX_DIMENSION: u32 = 20_000;
pub const MAX_PIXELS: u64 = 40_000_000;

/// Texto visible sin caracteres de control y con longitud acotada.
pub fn sanitize_label(value: &str, max: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(max)
        .collect()
}

/// IDs permitidos en atributos DOM y en el manifiesto `.seyro`.
pub fn safe_id(value: &str) -> Option<String> {
    let id = sanitize_label(value, 64);
    if id.is_empty()
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return None;
    }
    Some(id)
}

/// Acepta colores HEX de 6 dígitos, con o sin `#`.
pub fn safe_hex_color(value: &str) -> Option<String> {
    let raw = value.trim().trim_start_matches('#');
    if raw.len() == 6 && raw.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(format!("#{}", raw.to_ascii_lowercase()))
    } else {
        None
    }
}

/// Normaliza separadores y rechaza traversal, caracteres de control y rutas relativas.
pub fn checked_path(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > MAX_PATH_LEN {
        return Err("Ruta no válida".into());
    }
    if raw.chars().any(|c| c.is_control()) {
        return Err("La ruta contiene caracteres no permitidos".into());
    }
    let normalized = raw.replace('\\', "/");
    let path = PathBuf::from(&normalized);
    if !path.is_absolute() {
        return Err("Se requiere una ruta absoluta".into());
    }
    for component in path.components() {
        match component {
            Component::ParentDir => return Err("Ruta no permitida".into()),
            Component::CurDir => {}
            _ => {}
        }
    }
    Ok(path)
}

/// Comprueba que la ruta terminal tenga la extensión esperada.
pub fn require_extension(path: &Path, extension: &str) -> Result<(), String> {
    let actual = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if actual == extension.to_ascii_lowercase() {
        Ok(())
    } else {
        Err(format!("Se esperaba un archivo .{extension}"))
    }
}

/// Valida dimensiones antes de reservar buffers RGBA.
pub fn validate_dimensions(width: u32, height: u32) -> Result<usize, String> {
    if width == 0 || height == 0 {
        return Err("Dimensiones no válidas".into());
    }
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err("Dimensiones fuera del límite".into());
    }
    let pixels = (width as u64)
        .checked_mul(height as u64)
        .ok_or("Dimensiones demasiado grandes")?;
    if pixels > MAX_PIXELS {
        return Err("Imagen demasiado grande".into());
    }
    let bytes = (pixels as usize)
        .checked_mul(4)
        .ok_or("Buffer demasiado grande")?;
    if bytes > MAX_RGBA_BYTES {
        return Err("Buffer demasiado grande".into());
    }
    Ok(bytes)
}

/// Número finito dentro de un rango; sustituye NaN/inf por un valor seguro.
pub fn finite_f32(value: f32, fallback: f32, min: f32, max: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

/// Longitud máxima de base64 antes de decodificar.
pub fn check_base64_len(len: usize) -> Result<(), String> {
    if len > MAX_BASE64_BYTES {
        Err("Datos base64 demasiado grandes".into())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_relative_paths() {
        assert!(checked_path("/home/user/../../secret").is_err());
        assert!(checked_path("C:\\Users\\..\\secret").is_err());
        assert!(checked_path("documentos/proyecto.seyro").is_err());
        assert!(checked_path("/home/user/proyecto.seyro").is_ok());
    }

    #[test]
    fn sanitizes_ids_and_labels() {
        assert_eq!(safe_id("capa_1"), Some("capa_1".into()));
        assert_eq!(safe_id("x\" onmouseover=\"alert(1)"), None);
        assert_eq!(safe_id(""), None);
        assert_eq!(sanitize_label("  Capa\n<script>  ", 40), "Capa<script>");
    }

    #[test]
    fn validates_colors_and_dimensions() {
        assert_eq!(safe_hex_color("#FF6B00"), Some("#ff6b00".into()));
        assert_eq!(safe_hex_color("\"><img src=x>"), None);
        assert_eq!(validate_dimensions(2, 2), Ok(16));
        assert!(validate_dimensions(0, 10).is_err());
        assert!(validate_dimensions(20_001, 1).is_err());
        assert!(validate_dimensions(10_000, 10_000).is_err());
    }
}
