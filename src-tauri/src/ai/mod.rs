pub mod bridge;
pub mod detector;
pub mod files;
mod model;
pub mod whisper;

use ort::{
    environment::Environment,
    session::{builder::SessionBuilder, Session},
};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Once, OnceLock,
    },
    time::{Duration, Instant},
};

static ENV: OnceLock<Result<Environment, String>> = OnceLock::new();
//models unload after this long unused
const IDLE_SECS: u64 = 300;
static START: OnceLock<Instant> = OnceLock::new();

fn now_secs() -> u64 {
    START.get_or_init(Instant::now).elapsed().as_secs()
}

pub fn touch(last_use: &AtomicU64) {
    last_use.store(now_secs(), Ordering::Relaxed);
}

pub fn idle(last_use: &AtomicU64) -> bool {
    now_secs().saturating_sub(last_use.load(Ordering::Relaxed)) >= IDLE_SECS
}

//one thread checks every loaded model
pub fn watch_idle() {
    static WATCH: Once = Once::new();
    WATCH.call_once(|| {
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_secs(30));
            whisper::unload_if_idle();
            detector::unload_if_idle();
        });
    });
}

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

//dawn would pick lavapipe without one
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn vulkan_gpu() -> bool {
    use ash::vk::PhysicalDeviceType;
    static GPU: OnceLock<bool> = OnceLock::new();
    *GPU.get_or_init(|| unsafe {
        let Ok(entry) = ash::Entry::load() else { return false };
        let Ok(instance) = entry.create_instance(&ash::vk::InstanceCreateInfo::default(), None) else {
            return false;
        };
        let gpu = instance.enumerate_physical_devices().unwrap_or_default().into_iter().any(|device| {
            let kind = instance.get_physical_device_properties(device).device_type;
            kind == PhysicalDeviceType::DISCRETE_GPU || kind == PhysicalDeviceType::INTEGRATED_GPU
        });
        instance.destroy_instance(None);
        if !gpu {
            log::warn!("no vulkan gpu, onnx models run on cpu");
        }
        gpu
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
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    if vulkan_gpu() {
        builder = builder
            .with_execution_providers([ort::ep::WebGPU::default().build()])
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
