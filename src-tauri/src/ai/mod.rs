pub mod bridge;
pub mod detector;
pub mod files;
mod model;
pub mod whisper;

use ort::{
    environment::Environment,
    session::{builder::SessionBuilder, Session},
};
use std::sync::OnceLock;

static ENV: OnceLock<Result<Environment, String>> = OnceLock::new();

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn env() -> Result<&'static Environment, String> {
    ENV.get_or_init(|| ort::init().with_name("opera").build().map_err(err))
        .as_ref()
        .map_err(Clone::clone)
}

pub fn cpu() -> Result<SessionBuilder, String> {
    Session::builder(env()?).map_err(err)
}

//delay loaded call would crash without it
#[cfg(windows)]
fn directml_usable() -> bool {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    static USABLE: OnceLock<bool> = OnceLock::new();
    *USABLE.get_or_init(|| {
        let name: Vec<u16> = "DirectML.dll\0".encode_utf16().collect();
        let module = unsafe { LoadLibraryW(name.as_ptr()) };
        let usable = !module.is_null() && unsafe { GetProcAddress(module, c"DMLCreateDevice1".as_ptr().cast()) }.is_some();
        if !usable {
            log::warn!("directml missing, onnx models run on cpu");
        }
        usable
    })
}

//falls back to cpu without a gpu
pub fn accelerated() -> Result<SessionBuilder, String> {
    #[allow(unused_mut)]
    let mut builder = cpu()?;
    #[cfg(windows)]
    if directml_usable() {
        builder = builder
            .with_execution_providers([ort::ep::DirectML::default().build()])
            .map_err(err)?
            //directml cannot run with these on
            .with_memory_pattern(false)
            .map_err(err)?
            .with_parallel_execution(false)
            .map_err(err)?;
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .with_execution_providers([ort::ep::CoreML::default()
                .with_model_format(ort::ep::coreml::ModelFormat::MLProgram)
                .build()])
            .map_err(err)?;
    }
    Ok(builder)
}

//windows data sits in company folder
pub fn models_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    #[cfg(windows)]
    let base = app.path().local_data_dir().map_err(err)?.join("MaestroAI-Company").join("Opera");
    #[cfg(not(windows))]
    let base = app.path().app_local_data_dir().map_err(err)?;
    Ok(base.join("models"))
}
