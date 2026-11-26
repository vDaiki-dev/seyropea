//! Formato nativo `.seyro` v1.
//!
//! Contenedor determinista y autocontenido:
//!   magic  `SEYROv1\x00` (8 bytes)
//!   u32 LE longitud del manifiesto JSON UTF-8
//!   JSON   manifiesto (documento + metadatos de capas)
//!   por cada capa, en el orden del manifiesto:
//!     u64 LE bytes RGBA sin comprimir
//!     u64 LE bytes comprimidos (zlib/DEFLATE)
//!     datos comprimidos
//!
//! Toda la información de texto, forma, visibilidad, opacidad y fusión vive en el manifiesto.
//! Los metadatos se validan y normalizan antes de exponerse al frontend.

use crate::security;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::Path;

pub const MAGIC: [u8; 8] = *b"SEYROv1\x00";
pub const FORMAT_VERSION: u32 = 1;

const BLENDS: &[&str] = &[
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "luminosity",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextData {
    pub text: String,
    pub font_family: String,
    pub font_size: f32,
    pub weight: u32,
    pub color: String,
    pub align: String,
    pub line_height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeData {
    pub shape: String,
    pub fill: String,
    pub stroke: String,
    pub stroke_width: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerMeta {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub blend: String,
    pub visible: bool,
    pub locked: bool,
    pub data_len: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<TextData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shape: Option<ShapeData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub format: String,
    pub version: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub dpi: u32,
    pub layers: Vec<LayerMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub manifest: ProjectManifest,
    /// Buffers RGBA8 en base64, en el mismo orden que `manifest.layers`.
    pub layers: Vec<String>,
}

fn read_u32(buf: &[u8]) -> Result<u32, String> {
    let a: [u8; 4] = buf.try_into().map_err(|_| "Contenedor truncado (u32)")?;
    Ok(u32::from_le_bytes(a))
}

fn read_u64(buf: &[u8]) -> Result<u64, String> {
    let a: [u8; 8] = buf.try_into().map_err(|_| "Contenedor truncado (u64)")?;
    Ok(u64::from_le_bytes(a))
}

/// Normaliza un manifiesto no confiable. Devuelve el tamaño RGBA esperado por cada capa.
fn normalize_manifest(manifest: &mut ProjectManifest) -> Result<Vec<usize>, String> {
    if manifest.format != "seyro" {
        return Err("El manifiesto no corresponde a un proyecto SeyroPea".into());
    }
    if manifest.version != FORMAT_VERSION {
        return Err(format!(
            "Este proyecto usa la versión {}; SeyroPea v0.2.0 soporta la versión {FORMAT_VERSION}",
            manifest.version
        ));
    }
    security::validate_dimensions(manifest.width, manifest.height)?;
    if manifest.dpi > 10_000 {
        return Err("DPI no válido".into());
    }
    if manifest.layers.is_empty() || manifest.layers.len() > security::MAX_LAYERS {
        return Err("Número de capas no válido".into());
    }
    manifest.name = security::sanitize_label(&manifest.name, 120);
    let mut expected_layers = Vec::with_capacity(manifest.layers.len());

    for (index, layer) in manifest.layers.iter_mut().enumerate() {
        layer.id = security::safe_id(&layer.id).unwrap_or_else(|| format!("layer-{index}"));
        layer.name = security::sanitize_label(&layer.name, 120);
        layer.kind = security::sanitize_label(&layer.kind, 32);
        let layer_bytes = security::validate_dimensions(layer.width, layer.height)?;
        if layer.data_len != layer_bytes as u64 {
            return Err(format!("Capa {index}: longitud de datos inconsistente"));
        }
        if layer.x.checked_abs().unwrap_or(i32::MAX) > 100_000
            || layer.y.checked_abs().unwrap_or(i32::MAX) > 100_000
        {
            return Err(format!("Capa {index}: posición no válida"));
        }
        if !layer.opacity.is_finite() || !(0.0..=1.0).contains(&layer.opacity) {
            return Err(format!("Capa {index}: opacidad no válida"));
        }
        if !BLENDS.contains(&layer.blend.as_str()) {
            layer.blend = "normal".into();
        }
        if let Some(text) = &mut layer.text {
            text.text = security::sanitize_label(&text.text, 4000);
            text.font_family = security::sanitize_label(&text.font_family, 80);
            text.font_size = security::finite_f32(text.font_size, 12.0, 1.0, 500.0);
            text.weight = text.weight.clamp(1, 900);
            text.color = security::safe_hex_color(&text.color).unwrap_or_else(|| "#ffffff".into());
            text.align = security::sanitize_label(&text.align, 16);
            text.line_height = security::finite_f32(text.line_height, 1.2, 0.5, 4.0);
        }
        if let Some(shape) = &mut layer.shape {
            shape.shape = security::sanitize_label(&shape.shape, 32);
            shape.fill = security::safe_hex_color(&shape.fill).unwrap_or_else(|| "#ffffff".into());
            shape.stroke =
                security::safe_hex_color(&shape.stroke).unwrap_or_else(|| "#000000".into());
            shape.stroke_width = security::finite_f32(shape.stroke_width, 1.0, 0.0, 100.0);
            shape.radius = security::finite_f32(shape.radius, 0.0, 0.0, 1000.0);
        }
        expected_layers.push(layer_bytes);
    }
    Ok(expected_layers)
}

/// Lee únicamente la cabecera y el manifiesto; útil para recientes sin descargar capas.
pub fn manifest(path: &Path) -> Result<ProjectManifest, String> {
    use std::fs::File;

    let mut file = File::open(path).map_err(|e| format!("No se pudo leer el proyecto: {e}"))?;
    let mut header = [0u8; 12];
    file.read_exact(&mut header)
        .map_err(|_| "Contenedor truncado (cabecera)".to_string())?;
    if header[..8] != MAGIC {
        return Err("No es un archivo .seyro válido".into());
    }
    let manifest_len = read_u32(&header[8..12])? as usize;
    if manifest_len > security::MAX_MANIFEST_BYTES {
        return Err("Manifiesto demasiado grande".into());
    }
    let mut bytes = vec![0u8; manifest_len];
    file.read_exact(&mut bytes)
        .map_err(|_| "Manifiesto truncado".to_string())?;
    let mut manifest: ProjectManifest =
        serde_json::from_slice(&bytes).map_err(|e| format!("Manifiesto corrupto: {e}"))?;
    normalize_manifest(&mut manifest)?;
    Ok(manifest)
}

pub fn save(path: &Path, project: &ProjectFile) -> Result<(), String> {
    let mut manifest = project.manifest.clone();
    let expected_layers = normalize_manifest(&mut manifest)?;
    if manifest.layers.len() != project.layers.len() {
        return Err("El número de capas no coincide con el manifiesto".into());
    }
    let manifest_bytes = serde_json::to_vec(&manifest)
        .map_err(|e| format!("No se pudo serializar el manifiesto: {e}"))?;
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&(manifest_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&manifest_bytes);

    for ((meta, layer_b64), expected) in manifest
        .layers
        .iter()
        .zip(project.layers.iter())
        .zip(expected_layers.iter())
    {
        security::check_base64_len(layer_b64.len())?;
        let raw = B64
            .decode(layer_b64)
            .map_err(|e| format!("Capa {}: {e}", meta.id))?;
        if raw.len() != *expected {
            return Err(format!(
                "Capa {}: se esperaban {expected} bytes RGBA, se recibieron {}",
                meta.id,
                raw.len()
            ));
        }
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::new(6));
        encoder.write_all(&raw).map_err(|e| e.to_string())?;
        let compressed = encoder.finish().map_err(|e| e.to_string())?;
        out.extend_from_slice(&(raw.len() as u64).to_le_bytes());
        out.extend_from_slice(&(compressed.len() as u64).to_le_bytes());
        out.extend_from_slice(&compressed);
    }
    if out.len() > security::MAX_FILE_BYTES as usize * 2 {
        return Err("Proyecto demasiado grande".into());
    }
    std::fs::write(path, &out).map_err(|e| format!("No se pudo guardar el proyecto: {e}"))
}

pub fn load(path: &Path) -> Result<ProjectFile, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("No se pudo leer el proyecto: {e}"))?;
    if bytes.len() > security::MAX_FILE_BYTES as usize * 2 {
        return Err("Proyecto demasiado grande".into());
    }
    if bytes.len() < 12 || bytes[..8] != MAGIC {
        return Err("No es un archivo .seyro válido".into());
    }
    let manifest_len = read_u32(&bytes[8..12])? as usize;
    if manifest_len > security::MAX_MANIFEST_BYTES || bytes.len() < 12 + manifest_len {
        return Err("Manifiesto no válido".into());
    }
    let mut manifest: ProjectManifest = serde_json::from_slice(&bytes[12..12 + manifest_len])
        .map_err(|e| format!("Manifiesto corrupto: {e}"))?;
    let expected_layers = normalize_manifest(&mut manifest)?;

    let mut cursor = 12 + manifest_len;
    let mut layers = Vec::with_capacity(manifest.layers.len());
    for (index, (_meta, expected)) in manifest
        .layers
        .iter()
        .zip(expected_layers.iter())
        .enumerate()
    {
        if cursor + 16 > bytes.len() {
            return Err("Datos de capa truncados".into());
        }
        let raw_len = read_u64(&bytes[cursor..cursor + 8])? as usize;
        let compressed_len = read_u64(&bytes[cursor + 8..cursor + 16])? as usize;
        cursor += 16;
        if raw_len != *expected || compressed_len == 0 || compressed_len > bytes.len() - cursor {
            return Err(format!("Capa {index}: longitudes no válidas"));
        }
        let compressed = &bytes[cursor..cursor + compressed_len];
        let mut raw = Vec::new();
        let mut decoder = ZlibDecoder::new(compressed).take(raw_len as u64 + 1);
        decoder
            .read_to_end(&mut raw)
            .map_err(|e| format!("Capa {index}: datos corruptos ({e})"))?;
        if raw.len() != raw_len {
            return Err(format!("Capa {index}: tamaño de datos inconsistente"));
        }
        cursor += compressed_len;
        layers.push(B64.encode(raw));
    }
    if cursor != bytes.len() {
        return Err("Sobran datos al final del proyecto".into());
    }
    Ok(ProjectFile { manifest, layers })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn sample() -> ProjectFile {
        let meta = LayerMeta {
            id: "l1".into(),
            name: "Capa 1".into(),
            kind: "raster".into(),
            x: 0,
            y: 0,
            width: 2,
            height: 2,
            opacity: 1.0,
            blend: "normal".into(),
            visible: true,
            locked: false,
            data_len: 16,
            text: None,
            shape: None,
        };
        ProjectFile {
            manifest: ProjectManifest {
                format: "seyro".into(),
                version: FORMAT_VERSION,
                name: "prueba".into(),
                width: 2,
                height: 2,
                dpi: 72,
                layers: vec![meta],
            },
            layers: vec![B64.encode(vec![255u8; 16])],
        }
    }

    #[test]
    fn roundtrip_preserves_layers() {
        let project = sample();
        let dir = std::env::temp_dir().join(format!("seyropea-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.seyro");
        save(&path, &project).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.manifest.name, "prueba");
        assert_eq!(loaded.layers[0], project.layers[0]);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(b"basura").unwrap();
        assert!(load(&path).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_bomb_and_trailing_data() {
        let mut project = sample();
        project.manifest.layers[0].width = 20_000;
        project.manifest.layers[0].height = 20_000;
        project.manifest.layers[0].data_len = 1_600_000_000;
        assert!(save(std::path::Path::new("/tmp/never.seyro"), &project).is_err());

        let dir = std::env::temp_dir().join(format!("seyropea-bomb-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("trainling.seyro");
        save(&path, &sample()).unwrap();
        let mut bytes = std::fs::read(&path).unwrap();
        bytes.push(1);
        std::fs::write(&path, bytes).unwrap();
        assert!(load(&path).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sanitizes_manifest_ids_and_names() {
        let mut project = sample();
        project.manifest.name = "  <img src=x onerror=alert(1)>  ".into();
        project.manifest.layers[0].id = "x\" onmouseover=\"alert(1)".into();
        let dir = std::env::temp_dir().join(format!("seyropea-sanitize-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sanitize.seyro");
        save(&path, &project).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.manifest.name, "<img src=x onerror=alert(1)>");
        assert_eq!(loaded.manifest.layers[0].id, "layer-0");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
