//! Codecs de imagen: único punto de entrada para decodificar y codificar formatos raster.
//! El procesamiento de píxeles es algorítmico y determinista; aquí solo se gestionan formatos.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use image::{DynamicImage, ImageFormat};
use serde::Serialize;
use std::io::Cursor;
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

pub fn decode_file(path: &Path) -> Result<DecodedImage, String> {
    let img = image::open(path).map_err(|e| format!("No se pudo abrir la imagen: {e}"))?;
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
    let img = image::load_from_memory(bytes).map_err(|e| format!("Formato no soportado: {e}"))?;
    let rgba = img.to_rgba8();
    Ok(DecodedImage {
        name: name.to_string(),
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
    let raw = B64
        .decode(rgba_b64)
        .map_err(|e| format!("RGBA base64 inválido: {e}"))?;
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or("Dimensiones demasiado grandes")?;
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
}
