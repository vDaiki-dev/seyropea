//! Actualizaciones opcionales desde la API pública de GitHub Releases.
//! Si no hay red, simplemente devuelve `None`: la aplicación sigue funcionando offline.

use serde::Serialize;
use std::time::Duration;

const API: &str = "https://api.github.com/repos/vDaiki-dev/seyropea/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
    pub notes: String,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
}

fn parse_version(tag: &str) -> Option<(u64, u64, u64)> {
    let t = tag.trim().trim_start_matches('v');
    let core = t.split(['-', '+']).next().unwrap_or("");
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

fn preferred_asset(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    if cfg!(target_os = "windows") {
        n.ends_with(".msi") || n.ends_with(".exe")
    } else if cfg!(target_os = "macos") {
        n.ends_with(".dmg") || (n.ends_with(".zip") && n.contains("mac"))
    } else {
        n.contains("appimage") || n.ends_with(".deb")
    }
}

pub fn check_updates() -> Option<UpdateInfo> {
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(5)))
        .timeout_connect(Some(Duration::from_secs(3)))
        .build();
    let agent = config.new_agent();
    let mut response = agent.get(API).call().ok()?;
    let release: serde_json::Value = response.body_mut().read_json().ok()?;

    let tag = release.get("tag_name")?.as_str()?.to_string();
    let current = parse_version(env!("CARGO_PKG_VERSION"))?;
    let latest = parse_version(&tag)?;
    if latest <= current {
        return None;
    }

    let mut asset_name = None;
    let mut asset_url = None;
    if let Some(assets) = release.get("assets").and_then(|a| a.as_array()) {
        for asset in assets {
            let name = asset.get("name")?.as_str()?;
            if preferred_asset(name) {
                asset_name = Some(name.to_string());
                asset_url = asset
                    .get("browser_download_url")?
                    .as_str()
                    .map(str::to_string);
                break;
            }
        }
    }

    Some(UpdateInfo {
        version: tag,
        url: release
            .get("html_url")
            .and_then(|v| v.as_str())
            .unwrap_or("https://github.com/vDaiki-dev/seyropea/releases")
            .to_string(),
        notes: release
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(4000)
            .collect(),
        asset_name,
        asset_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_comparison() {
        assert!(parse_version("v0.2.0") > parse_version("0.1.0"));
        assert!(parse_version("0.1.0") == parse_version("v0.1.0-beta"));
        assert!(parse_version("v1.10.2") > parse_version("v1.9.9"));
    }

    #[test]
    fn asset_filter_matches_current_os() {
        let candidates = [
            "SeyroPea_0.2.0_amd64.AppImage",
            "SeyroPea_0.2.0_x64.msi",
            "SeyroPea_0.2.0.dmg",
        ];
        assert!(candidates.iter().any(|n| preferred_asset(n)));
    }
}
