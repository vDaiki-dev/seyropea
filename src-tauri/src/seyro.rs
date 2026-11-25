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

pub fn save(path: &Path, project: &ProjectFile) -> Result<(), String> {
    if project.manifest.format != "seyro" {
        return Err("El manifiesto no corresponde a un proyecto SeyroPea".into());
    }
    if project.manifest.version != FORMAT_VERSION {
        return Err(format!(
            "Versión de proyecto no soportada: {}",
            project.manifest.version
        ));
    }
    if project.manifest.layers.len() != project.layers.len() {
        return Err("El número de capas no coincide con el manifiesto".into());
    }
    let manifest_bytes = serde_json::to_vec(&project.manifest)
        .map_err(|e| format!("No se pudo serializar el manifiesto: {e}"))?;
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&(manifest_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&manifest_bytes);

    for (meta, layer_b64) in project.manifest.layers.iter().zip(project.layers.iter()) {
        let raw = B64
            .decode(layer_b64)
            .map_err(|e| format!("Capa '{}': {e}", meta.name))?;
        if raw.len() as u64 != meta.data_len {
            return Err(format!(
                "Capa '{}': longitud declarada {} pero se recibieron {} bytes",
                meta.name,
                meta.data_len,
                raw.len()
            ));
        }
        let expected = (meta.width as usize)
            .checked_mul(meta.height as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or("Dimensiones de capa inválidas")?;
        if raw.len() != expected {
            return Err(format!(
                "Capa '{}': se esperaban {expected} bytes RGBA, se recibieron {}",
                meta.name,
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

    std::fs::write(path, &out).map_err(|e| format!("No se pudo guardar el proyecto: {e}"))
}

pub fn load(path: &Path) -> Result<ProjectFile, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("No se pudo leer el proyecto: {e}"))?;
    if bytes.len() < 12 || bytes[..8] != MAGIC {
        return Err("No es un archivo .seyro válido".into());
    }
    let manifest_len = read_u32(&bytes[8..12])? as usize;
    if bytes.len() < 12 + manifest_len {
        return Err("Manifiesto truncado".into());
    }
    let manifest: ProjectManifest = serde_json::from_slice(&bytes[12..12 + manifest_len])
        .map_err(|e| format!("Manifiesto corrupto: {e}"))?;
    if manifest.version != FORMAT_VERSION {
        return Err(format!(
            "Este proyecto usa la versión {}; SeyroPea v0.1.0 soporta la versión {FORMAT_VERSION}",
            manifest.version
        ));
    }
    let mut cursor = 12 + manifest_len;
    let mut layers = Vec::with_capacity(manifest.layers.len());
    for meta in &manifest.layers {
        if cursor + 16 > bytes.len() {
            return Err("Datos de capa truncados".into());
        }
        let raw_len = read_u64(&bytes[cursor..cursor + 8])? as usize;
        let compressed_len = read_u64(&bytes[cursor + 8..cursor + 16])? as usize;
        cursor += 16;
        if cursor + compressed_len > bytes.len() {
            return Err("Datos de capa truncados".into());
        }
        let mut decoder = ZlibDecoder::new(&bytes[cursor..cursor + compressed_len]);
        let mut raw = Vec::with_capacity(raw_len);
        decoder
            .read_to_end(&mut raw)
            .map_err(|e| format!("Capa '{}': {e}", meta.name))?;
        if raw.len() != raw_len {
            return Err(format!(
                "Capa '{}': tamaño de datos inconsistente",
                meta.name
            ));
        }
        cursor += compressed_len;
        layers.push(B64.encode(raw));
    }
    Ok(ProjectFile { manifest, layers })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn roundtrip_preserves_layers() {
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
        let project = ProjectFile {
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
        };
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
}
