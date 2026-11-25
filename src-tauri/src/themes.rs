//! Motor de temas determinista: extracción algorítmica de paletas a partir de una imagen.
//! Sin redes neuronales, sin servicios remotos: cuantización por histograma + k-means.

use image::imageops::FilterType;
use image::GenericImageView;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    pub accent: String,
    pub accent_alt: String,
    pub background: String,
    pub surface: String,
    pub surface_alt: String,
    pub border: String,
    pub text: String,
    pub text_muted: String,
}

fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let r = r / 255.0;
    let g = g / 255.0;
    let b = b / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    let d = max - min;
    if d < 1e-6 {
        return (0.0, 0.0, l);
    }
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if max == r {
        ((g - b) / d) % 6.0
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    let h = (h * 60.0 + 360.0) % 360.0;
    (h, s, l)
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let h = ((h % 360.0) + 360.0) % 360.0 / 360.0;
    // Fórmula canónica HSL -> RGB.
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h * 6.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = if h < 1.0 / 6.0 {
        (c, x, 0.0)
    } else if h < 2.0 / 6.0 {
        (x, c, 0.0)
    } else if h < 3.0 / 6.0 {
        (0.0, c, x)
    } else if h < 4.0 / 6.0 {
        (0.0, x, c)
    } else if h < 5.0 / 6.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    (
        ((r + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((g + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((b + m) * 255.0).round().clamp(0.0, 255.0) as u8,
    )
}

fn hex(rgb: (u8, u8, u8)) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb.0, rgb.1, rgb.2)
}

#[derive(Clone, Copy)]
struct Cluster {
    r: f64,
    g: f64,
    b: f64,
    weight: usize,
}

pub fn palette_from_image(path: &Path) -> Result<Palette, String> {
    let img =
        image::open(path).map_err(|e| format!("No se pudo leer la imagen de referencia: {e}"))?;
    let (w, h) = img.dimensions();
    let scale = (96.0 / w.max(h) as f64).min(1.0);
    let tw = ((w as f64 * scale).round() as u32).max(1);
    let th = ((h as f64 * scale).round() as u32).max(1);
    let small = img.resize_exact(tw, th, FilterType::Triangle).to_rgba8();
    let mut pixels: Vec<[f64; 3]> = Vec::with_capacity((tw * th) as usize);
    for p in small.pixels() {
        if p[3] >= 128 {
            pixels.push([p[0] as f64, p[1] as f64, p[2] as f64]);
        }
    }
    if pixels.is_empty() {
        return Err("La imagen de referencia no tiene píxeles visibles".into());
    }

    // Semillas deterministas: bins de color 8x8x8 ordenados por población.
    let mut bins: HashMap<(u8, u8, u8), (usize, [f64; 3])> = HashMap::new();
    for p in &pixels {
        let key = (
            (p[0] / 32.0) as u8,
            (p[1] / 32.0) as u8,
            (p[2] / 32.0) as u8,
        );
        let e = bins.entry(key).or_insert((0, [0.0, 0.0, 0.0]));
        e.0 += 1;
        e.1[0] += p[0];
        e.1[1] += p[1];
        e.1[2] += p[2];
    }
    let mut seeds: Vec<_> = bins
        .into_values()
        .map(|(n, sum)| (n, [sum[0] / n as f64, sum[1] / n as f64, sum[2] / n as f64]))
        .collect();
    seeds.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1[0].total_cmp(&b.1[0])));
    seeds.truncate(6);
    let mut clusters: Vec<Cluster> = seeds
        .iter()
        .map(|(_, c)| Cluster {
            r: c[0],
            g: c[1],
            b: c[2],
            weight: 0,
        })
        .collect();
    while clusters.len() < 6 {
        clusters.push(Cluster {
            r: 255.0,
            g: 255.0,
            b: 255.0,
            weight: 0,
        });
    }

    // k-means con un número fijo de iteraciones: mismo resultado para la misma imagen.
    for _ in 0..12 {
        for c in &mut clusters {
            c.r = 0.0;
            c.g = 0.0;
            c.b = 0.0;
            c.weight = 0;
        }
        for p in &pixels {
            let mut best = 0usize;
            let mut best_d = f64::INFINITY;
            for (i, c) in clusters.iter().enumerate() {
                let d = (p[0] - c.r).powi(2) + (p[1] - c.g).powi(2) + (p[2] - c.b).powi(2);
                if d < best_d {
                    best_d = d;
                    best = i;
                }
            }
            let c = &mut clusters[best];
            c.r += p[0];
            c.g += p[1];
            c.b += p[2];
            c.weight += 1;
        }
        for c in &mut clusters {
            if c.weight > 0 {
                let n = c.weight as f64;
                c.r /= n;
                c.g /= n;
                c.b /= n;
            }
        }
    }

    clusters.retain(|c| c.weight > 0);
    clusters.sort_by_key(|a| std::cmp::Reverse(a.weight));
    let total = pixels.len() as f64;
    let dominant = clusters.first().copied().unwrap_or(Cluster {
        r: 30.0,
        g: 30.0,
        b: 34.0,
        weight: 1,
    });
    let (dh, ds, _) = rgb_to_hsl(dominant.r, dominant.g, dominant.b);

    let mut candidates: Vec<(f64, Cluster)> = clusters
        .iter()
        .filter(|c| c.weight as f64 / total >= 0.015)
        .map(|c| {
            let (_, s, l) = rgb_to_hsl(c.r, c.g, c.b);
            let score = s * (0.35 + c.weight as f64 / total) * (1.0 - (l - 0.55).abs() * 0.5);
            (score, *c)
        })
        .collect();
    candidates.sort_by(|a, b| b.0.total_cmp(&a.0));
    let pick = candidates.first().map(|(_, c)| *c).unwrap_or(dominant);
    let (ph, ps, _) = rgb_to_hsl(pick.r, pick.g, pick.b);
    let accent = hsl_to_rgb(ph, ps.clamp(0.62, 0.95).max(0.62), 0.56);
    let accent_alt = hsl_to_rgb(ph + 32.0, 0.70, 0.62);

    Ok(Palette {
        accent: hex(accent),
        accent_alt: hex(accent_alt),
        background: hex(hsl_to_rgb(dh, (ds * 0.35).min(0.24), 0.075)),
        surface: hex(hsl_to_rgb(dh, (ds * 0.30).min(0.20), 0.11)),
        surface_alt: hex(hsl_to_rgb(dh, (ds * 0.28).min(0.18), 0.16)),
        border: hex(hsl_to_rgb(dh, (ds * 0.22).min(0.14), 0.24)),
        text: "#f4f4f5".into(),
        text_muted: "#a1a1aa".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hsl_roundtrip_is_stable() {
        for (r, g, b) in [(255u8, 0u8, 0u8), (18, 18, 20), (73, 111, 247)] {
            let (h, s, l) = rgb_to_hsl(r as f64, g as f64, b as f64);
            let back = hsl_to_rgb(h, s, l);
            assert!(back.0.abs_diff(r) <= 1 && back.1.abs_diff(g) <= 1 && back.2.abs_diff(b) <= 1);
        }
    }
}
