use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

const RELEASES: &str = "https://github.com/MaestroAI-Company/opera/releases/download";

//each release has its own manifest
fn manifest_url(tag: &str) -> Result<String, String> {
    let valid = tag.starts_with('v')
        && tag.len() < 40
        && tag[1..].chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    if !valid {
        return Err("invalid release tag".into());
    }
    Ok(format!("{RELEASES}/{tag}/latest.json"))
}

//false when nothing is newer
#[tauri::command]
pub async fn app_update_install(app: AppHandle, tag: String) -> Result<bool, String> {
    let url = manifest_url(&tag)?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url.parse().map_err(|e| format!("{e}"))?])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(false);
    };

    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    //hub may lock installed files
    crate::hub::stop_hosted(&app.state::<crate::hub::HubState>()).await;
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}

//updater replaces this stable copy
#[cfg(target_os = "linux")]
pub fn install_appimage() -> Option<()> {
    let current = std::path::PathBuf::from(std::env::var_os("APPIMAGE")?);
    let home = std::path::PathBuf::from(std::env::var_os("HOME")?);
    let target = home.join(".local/share/MaestroAI-Company/Opera/Opera.AppImage");
    if current == target {
        return None;
    }
    std::fs::create_dir_all(target.parent()?).ok()?;
    let part = target.with_extension("part");
    std::fs::copy(&current, &part).ok()?;
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&part, std::fs::Permissions::from_mode(0o755)).ok()?;
    std::fs::rename(&part, &target).ok()?;
    //old mount vanishes once we exit
    std::process::Command::new(&target)
        .args(std::env::args_os().skip(1))
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("APPDIR")
        .env_remove("APPIMAGE")
        .spawn()
        .ok()?;
    Some(())
}
