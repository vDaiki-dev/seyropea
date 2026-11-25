//! Listado de fuentes instaladas en el sistema, sin descargas ni servicios externos.

use std::collections::BTreeSet;
use std::path::PathBuf;

fn candidate_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut dirs = vec![
        home.join(".local/share/fonts"),
        home.join(".fonts"),
        PathBuf::from("/usr/share/fonts"),
        PathBuf::from("/usr/local/share/fonts"),
    ];
    if cfg!(target_os = "macos") {
        dirs.extend([
            PathBuf::from("/System/Library/Fonts"),
            PathBuf::from("/Library/Fonts"),
            home.join("Library/Fonts"),
        ]);
    }
    if cfg!(target_os = "windows") {
        if let Some(root) = std::env::var_os("WINDIR") {
            dirs.push(PathBuf::from(root).join("Fonts"));
        }
    }
    dirs
}

fn clean_family(name: &str) -> Option<String> {
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
    let mut family = String::new();
    for part in stem.split(|c: char| c == '_' || c == '-' || c == ' ' || c.is_ascii_digit()) {
        let p = part.trim();
        if p.is_empty() {
            continue;
        }
        let lower = p.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "ttf"
                | "otf"
                | "ttc"
                | "woff"
                | "woff2"
                | "regular"
                | "bold"
                | "italic"
                | "bolditalic"
                | "medium"
                | "light"
                | "semibold"
                | "thin"
                | "black"
        ) {
            continue;
        }
        if !family.is_empty() {
            family.push(' ');
        }
        family.push_str(p);
    }
    if family.is_empty() || family.len() > 64 {
        None
    } else {
        Some(family)
    }
}

pub fn list_fonts() -> Vec<String> {
    let mut fonts: BTreeSet<String> = [
        "sans-serif".to_string(),
        "serif".to_string(),
        "monospace".to_string(),
        "system-ui".to_string(),
        "cursive".to_string(),
        "fantasy".to_string(),
    ]
    .into_iter()
    .collect();

    fn walk(dir: &std::path::Path, fonts: &mut BTreeSet<String>, depth: u8) {
        if depth > 4 || fonts.len() > 400 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, fonts, depth + 1);
            } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let lower = name.to_ascii_lowercase();
                if lower.ends_with(".ttf") || lower.ends_with(".otf") || lower.ends_with(".ttc") {
                    if let Some(family) = clean_family(name) {
                        fonts.insert(family);
                    }
                }
            }
        }
    }

    for dir in candidate_dirs() {
        if dir.exists() {
            walk(&dir, &mut fonts, 0);
        }
    }
    fonts.into_iter().take(400).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_fonts_always_present() {
        let fonts = list_fonts();
        assert!(fonts.iter().any(|f| f == "monospace"));
        assert!(fonts.len() >= 6);
    }
}
