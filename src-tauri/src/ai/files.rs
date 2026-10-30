use super::err;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{ipc::Channel, AppHandle};

#[derive(Clone, Serialize)]
pub struct Progress {
    loaded: u64,
    total: u64,
}

//stable name per url
pub fn path_for(app: &AppHandle, url: &str) -> Result<PathBuf, String> {
    let hash = url.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
    let name = url.rsplit('/').next().unwrap_or("model");
    Ok(super::models_dir(app)?.join("files").join(format!("{hash:016x}-{name}")))
}

//skips files already on disk
pub async fn fetch(files: &[(String, PathBuf)], on_progress: &Channel<Progress>) -> Result<(), String> {
    let client = tauri_plugin_http::reqwest::Client::new();
    let mut total = 0;
    for (url, _) in files {
        total += client.head(url).send().await.map_err(err)?.content_length().unwrap_or(0);
    }
    let mut loaded = 0;
    for (url, target) in files {
        if target.is_file() {
            loaded += std::fs::metadata(target).map_err(err)?.len();
            continue;
        }
        std::fs::create_dir_all(target.parent().ok_or("bad model path")?).map_err(err)?;
        let mut response = client.get(url).send().await.map_err(err)?.error_for_status().map_err(err)?;
        //partial files never look installed
        let part = target.with_extension("part");
        let mut out = std::fs::File::create(&part).map_err(err)?;
        let mut reported = 0;
        while let Some(chunk) = response.chunk().await.map_err(err)? {
            std::io::Write::write_all(&mut out, &chunk).map_err(err)?;
            loaded += chunk.len() as u64;
            //one message per mb is enough
            if loaded - reported >= 1 << 20 {
                reported = loaded;
                let _ = on_progress.send(Progress { loaded, total: total.max(loaded) });
            }
        }
        drop(out);
        std::fs::rename(&part, target).map_err(err)?;
    }
    let _ = on_progress.send(Progress { loaded, total: loaded });
    Ok(())
}

fn targets(app: &AppHandle, sources: Vec<String>) -> Result<Vec<(String, PathBuf)>, String> {
    sources
        .into_iter()
        .map(|source| {
            let path = path_for(app, &source)?;
            Ok((source, path))
        })
        .collect()
}

#[tauri::command]
pub async fn models_download(app: AppHandle, sources: Vec<String>, on_progress: Channel<Progress>) -> Result<(), String> {
    fetch(&targets(&app, sources)?, &on_progress).await
}

#[tauri::command]
pub fn models_remove(app: AppHandle, sources: Vec<String>) -> Result<(), String> {
    for (_, path) in targets(&app, sources)? {
        if path.is_file() {
            std::fs::remove_file(path).map_err(err)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn models_read_text(app: AppHandle, source: String) -> Result<String, String> {
    std::fs::read_to_string(path_for(&app, &source)?).map_err(err)
}
