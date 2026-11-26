//! Codecs de imagen: único punto de entrada para decodificar y codificar formatos raster.
//! El procesamiento de píxeles es algorítmico y determinista; aquí solo se gestionan formatos.

use crate::security;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use serde::Serialize;
use std::io::{BufRead, Cursor};
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedImage {
    pub name: String,
    pub width: u32,
    pub height: u32,
    /// RGBA8, filas consecutivas, codificado en base64 estándar.
    pub rgba: String,
}

/// Límites compartidos por todas las rutas de decodificación: evita bombas de
/// compresión o metadatos de dimensiones falsos antes de asignar buffers.
pub fn safe_limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(security::MAX_DIMENSION);
    limits.max_image_height = Some(security::MAX_DIMENSION);
    limits.max_alloc = Some(security::MAX_RGBA_BYTES as u64);
    limits
}

fn decode_reader(
    mut reader: ImageReader<impl BufRead + std::io::Seek>,
) -> Result<DynamicImage, String> {
    reader.limits(safe_limits());
    reader
        .decode()
        .map_err(|e| format!("No se pudo decodificar la imagen: {e}"))
}

/// Decodificación limitada reutilizable por el motor de temas.
pub fn decode_limited(path: &Path) -> Result<DynamicImage, String> {
    if let Ok(metadata) = std::fs::metadata(path) {
        if metadata.len() > security::MAX_FILE_BYTES {
            return Err("Imagen de referencia demasiado grande".into());
        }
    }
    let reader = ImageReader::open(path)
        .map_err(|e| format!("No se pudo abrir la imagen: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("Formato de imagen no reconocido: {e}"))?;
    let image = decode_reader(reader)?;
    security::validate_dimensions(image.width(), image.height())?;
    Ok(image)
}

pub fn decode_file(path: &Path) -> Result<DecodedImage, String> {
    let img = decode_limited(path)?;
    let rgba = img.to_rgba8();
    Ok(DecodedImage {
        name: path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("imagen")
            .to_string(),
        width: rgba.width(),
        height: rgba.height(),
        rgba: B64.encode(rgba.as_raw()),
    })
}

pub fn decode_bytes(bytes: &[u8], name: &str) -> Result<DecodedImage, String> {
    if bytes.len() > security::MAX_FILE_BYTES as usize {
        return Err("Imagen demasiado grande".into());
    }
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| format!("Formato no soportado: {e}"))?;
    let img = decode_reader(reader)?;
    security::validate_dimensions(img.width(), img.height())?;
    let rgba = img.to_rgba8();
    Ok(DecodedImage {
        name: security::sanitize_label(name, 120),
        width: rgba.width(),
        height: rgba.height(),
        rgba: B64.encode(rgba.as_raw()),
    })
}

/// Codifica un buffer RGBA8 al formato indicado (`png`, `jpg`, `webp`, `bmp`).
pub fn encode_file(
    path: &Path,
    rgba_b64: &str,
    width: u32,
    height: u32,
    format: &str,
) -> Result<(), String> {
    let expected = security::validate_dimensions(width, height)?;
    security::check_base64_len(rgba_b64.len())?;
    let raw = B64
        .decode(rgba_b64)
        .map_err(|e| format!("RGBA base64 inválido: {e}"))?;
    if raw.len() != expected {
        return Err(format!(
            "Tamaño de píxeles inconsistente: esperados {expected} bytes, recibidos {}",
            raw.len()
        ));
    }
    let img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(width, height, raw).ok_or("No se pudo construir la imagen")?,
    );
    let fmt = match format.to_ascii_lowercase().as_str() {
        "png" => ImageFormat::Png,
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        "bmp" => ImageFormat::Bmp,
        other => return Err(format!("Formato de exportación no soportado: {other}")),
    };
    let mut file = std::fs::File::create(path).map_err(|e| format!("No se pudo escribir: {e}"))?;
    img.write_to(&mut file, fmt)
        .map_err(|e| format!("No se pudo codificar {format}: {e}"))?;
    Ok(())
}

pub fn encode_data_url(rgba: &[u8], width: u32, height: u32) -> Result<String, String> {
    security::validate_dimensions(width, height)?;
    let img = DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(width, height, rgba.to_vec())
            .ok_or("No se pudo construir la miniatura")?,
    );
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("No se pudo generar PNG: {e}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        B64.encode(buf.into_inner())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_data_url_produces_png() {
        let rgba = vec![
            255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255,
        ];
        let url = encode_data_url(&rgba, 2, 2).unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn rejects_inconsistent_rgba_before_decoding() {
        assert!(encode_file(Path::new("/tmp/never.png"), "AAAA", 10, 10, "png").is_err());
        assert!(encode_data_url(&[0; 4], 20_001, 1).is_err());
    }
}
