//! Detección best-effort del fondo de pantalla del sistema.
//! Nunca es obligatoria: si el compositor no expone el fondo, el usuario elige una imagen local.

use std::path::{Path, PathBuf};
use std::process::Command;

fn first_existing(paths: &[PathBuf]) -> Option<String> {
    paths
        .iter()
        .find(|p| p.exists() && p.is_file())
        .and_then(|p| p.to_str())
        .map(str::to_string)
}

fn from_gnome() -> Option<String> {
    for key in ["picture-uri", "picture-uri-dark"] {
        let out = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.background", key])
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&out.stdout)
            .trim()
            .trim_matches('\'')
            .to_string();
        if let Some(rest) = s.strip_prefix("file://") {
            let p = PathBuf::from(rest);
            if p.exists() {
                return Some(rest.to_string());
            }
        }
        if s.starts_with('/') && Path::new(&s).exists() {
            return Some(s);
        }
    }
    None
}

fn from_swww() -> Option<String> {
    let out = Command::new("swww").arg("query").output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        if let Some((_, value)) = line.split_once(':') {
            let v = value.trim();
            if v.starts_with('/') && Path::new(v).exists() {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn from_config_files(home: &Path) -> Option<String> {
    let mut paths = Vec::new();

    if let Ok(text) = std::fs::read_to_string(home.join(".config/hypr/hyprpaper.conf")) {
        for line in text.lines() {
            let line = line.trim();
            for prefix in ["preload =", "wallpaper ="] {
                if let Some(rest) = line.strip_prefix(prefix) {
                    let value = rest.trim().split(',').next_back().unwrap_or("").trim();
                    if value.starts_with('/') {
                        paths.push(PathBuf::from(value));
                    }
                }
            }
        }
    }
    if let Ok(text) =
        std::fs::read_to_string(home.join(".config/plasma-org.kde.plasma.desktop-appletsrc"))
    {
        for line in text.lines() {
            if let Some(rest) = line.trim().strip_prefix("Image=") {
                paths.push(PathBuf::from(rest));
            }
        }
    }
    if let Ok(text) = std::fs::read_to_string(home.join(".config/wallpaper")) {
        paths.push(PathBuf::from(text.trim()));
    }
    first_existing(&paths)
}

#[cfg(target_os = "macos")]
fn from_macos() -> Option<String> {
    let script = "tell application \"System Events\" to get picture of every desktop";
    let out = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let value = s.split(',').next().unwrap_or("").trim().to_string();
    if Path::new(&value).exists() {
        Some(value)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn from_windows() -> Option<String> {
    let ps = "Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallPaper | Select-Object -ExpandProperty WallPaper";
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps])
        .output()
        .ok()?;
    let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if Path::new(&value).exists() {
        Some(value)
    } else {
        None
    }
}

pub fn detect_wallpaper() -> Option<String> {
    if cfg!(target_os = "linux") {
        let home = dirs::home_dir().unwrap_or_default();
        if let Some(p) = from_config_files(&home) {
            return Some(p);
        }
        if let Some(p) = from_swww() {
            return Some(p);
        }
        if let Some(p) = from_gnome() {
            return Some(p);
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(p) = from_macos() {
        return Some(p);
    }
    #[cfg(target_os = "windows")]
    if let Some(p) = from_windows() {
        return Some(p);
    }
    None
}
