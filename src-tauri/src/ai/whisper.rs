use super::{err, files::Progress, model::Whisper};
use std::{
    path::{Path, PathBuf},
    sync::{atomic::AtomicU64, Mutex},
};
use tauri::{
    ipc::{Channel, InvokeBody, Request},
    AppHandle,
};

const REPO: &str = "https://huggingface.co/onnx-community/whisper-";
//only directml is verified with fp16
#[cfg(windows)]
const ENCODER: &str = "encoder_model_fp16.onnx";
#[cfg(not(windows))]
const ENCODER: &str = "encoder_model.onnx";
//q8 keeps the old download size
const DECODER: &str = "decoder_model_merged_quantized.onnx";
const FILES: [&str; 5] = ["config.json", "generation_config.json", "tokenizer.json", ENCODER, DECODER];

static LOADED: Mutex<Option<(String, Whisper)>> = Mutex::new(None);
//reloaded on use after an idle unload
static WANTED: Mutex<Option<(String, PathBuf)>> = Mutex::new(None);
static LAST_USE: AtomicU64 = AtomicU64::new(0);

fn ensure(loaded: &mut Option<(String, Whisper)>, size: &str, dir: &Path) -> Result<(), String> {
    if loaded.as_ref().is_some_and(|(s, _)| s == size) {
        return Ok(());
    }
    *loaded = None;
    let encoder = super::accelerated()?.commit_from_file(dir.join(ENCODER)).map_err(err)?;
    //per token gpu copies cost more
    let decoder = super::cpu()?.commit_from_file(dir.join(DECODER)).map_err(err)?;
    *loaded = Some((size.to_string(), Whisper::load(dir, encoder, decoder)?));
    super::watch_idle();
    Ok(())
}

pub fn unload_if_idle() {
    //a run in progress keeps it
    let mut model = LOADED.lock().unwrap();
    if super::idle(&LAST_USE) {
        *model = None;
    }
}

fn size_dir(app: &AppHandle, size: &str) -> Result<PathBuf, String> {
    if !["tiny", "base", "small"].contains(&size) {
        return Err(format!("unknown whisper model {size}"));
    }
    Ok(super::models_dir(app)?.join(format!("whisper-{size}")))
}

fn url(size: &str, file: &str) -> String {
    let folder = if file.ends_with(".onnx") { "onnx/" } else { "" };
    format!("{REPO}{size}/resolve/main/{folder}{file}")
}

#[tauri::command]
pub fn whisper_installed(app: AppHandle, size: String) -> Result<bool, String> {
    let dir = size_dir(&app, &size)?;
    Ok(FILES.iter().all(|f| dir.join(f).is_file()))
}

#[tauri::command]
pub async fn whisper_download(app: AppHandle, size: String, on_progress: Channel<Progress>) -> Result<(), String> {
    let dir = size_dir(&app, &size)?;
    let files: Vec<_> = FILES.iter().map(|f| (url(&size, f), dir.join(f))).collect();
    super::files::fetch(&files, &on_progress).await
}

#[tauri::command]
pub fn whisper_delete(app: AppHandle, size: String) -> Result<(), String> {
    let dir = size_dir(&app, &size)?;
    let mut wanted = WANTED.lock().unwrap();
    if wanted.as_ref().is_some_and(|(s, _)| *s == size) {
        *wanted = None;
        *LOADED.lock().unwrap() = None;
    }
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn whisper_load(app: AppHandle, size: String) -> Result<(), String> {
    let dir = size_dir(&app, &size)?;
    tauri::async_runtime::spawn_blocking(move || {
        *WANTED.lock().unwrap() = Some((size.clone(), dir.clone()));
        super::touch(&LAST_USE);
        ensure(&mut LOADED.lock().unwrap(), &size, &dir)
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub fn whisper_release() {
    *WANTED.lock().unwrap() = None;
    *LOADED.lock().unwrap() = None;
}

//16 khz float samples in the body
#[tauri::command]
pub async fn whisper_transcribe(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw audio".into());
    };
    let pcm: Vec<f32> = bytemuck::pod_collect_to_vec(bytes);
    let language = request
        .headers()
        .get("x-language")
        .and_then(|v| v.to_str().ok())
        .filter(|l| !l.is_empty() && *l != "auto")
        .map(str::to_string);
    tauri::async_runtime::spawn_blocking(move || {
        let (size, dir) = WANTED.lock().unwrap().clone().ok_or("whisper not initialized")?;
        super::touch(&LAST_USE);
        let mut loaded = LOADED.lock().unwrap();
        ensure(&mut loaded, &size, &dir)?;
        let text = loaded.as_mut().map(|(_, whisper)| whisper.transcribe(&pcm, language.as_deref()));
        super::touch(&LAST_USE);
        text.ok_or("whisper not loaded")?
    })
    .await
    .map_err(err)?
}
