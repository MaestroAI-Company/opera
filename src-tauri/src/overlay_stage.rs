use base64::Engine;
use image::{imageops, RgbImage};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "stage";

//letterboxed capture like the android module
pub struct DetectionInput {
    pub tensor: Vec<f32>,
    pub offset_x: f64,
    pub offset_y: f64,
    pub content_width: f64,
    pub content_height: f64,
}

pub static INPUT: Mutex<Option<DetectionInput>> = Mutex::new(None);
//full capture for selection crops
static SHOT: Mutex<Option<image::RgbaImage>> = Mutex::new(None);
pub const INPUT_SIZE: u32 = 640;
//ctrl alone held enters selection
const CTRL_HOLD_MS: u64 = 250;
//off until settings enable it
pub static ENABLED: AtomicBool = AtomicBool::new(false);
static SELECTING: AtomicBool = AtomicBool::new(false);
//bumped so an old watcher stops
static WATCH_ID: AtomicU64 = AtomicU64::new(0);

pub fn build(app: &AppHandle) -> Result<(), String> {
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("?window=stage".into()))
        .title("Maestro")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false);
    #[cfg(windows)]
    if let Some(dir) = crate::webview_data_dir(app) {
        builder = builder.data_directory(dir);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    //clicks fall through to the desktop
    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    Ok(())
}

fn letterbox(shot: &image::RgbaImage) -> DetectionInput {
    let (w, h) = shot.dimensions();
    let scale = INPUT_SIZE as f64 / w.max(h) as f64;
    let cw = ((w as f64 * scale).round() as u32).max(1);
    let ch = ((h as f64 * scale).round() as u32).max(1);
    let small = imageops::resize(shot, cw, ch, imageops::FilterType::Triangle);
    //yolo letterbox gray
    let mut square = RgbImage::from_pixel(INPUT_SIZE, INPUT_SIZE, image::Rgb([114, 114, 114]));
    let ox = (INPUT_SIZE - cw) / 2;
    let oy = (INPUT_SIZE - ch) / 2;
    for (x, y, p) in small.enumerate_pixels() {
        square.put_pixel(x + ox, y + oy, image::Rgb([p[0], p[1], p[2]]));
    }
    //planar chw floats for the tensor
    let plane = (INPUT_SIZE * INPUT_SIZE) as usize;
    let mut chw = vec![0f32; plane * 3];
    for (i, p) in square.pixels().enumerate() {
        chw[i] = p[0] as f32 / 255.0;
        chw[plane + i] = p[1] as f32 / 255.0;
        chw[plane * 2 + i] = p[2] as f32 / 255.0;
    }
    DetectionInput {
        tensor: chw,
        offset_x: ox as f64,
        offset_y: oy as f64,
        content_width: cw as f64,
        content_height: ch as f64,
    }
}

//capture before any window covers it
pub fn show(app: &AppHandle) {
    if !ENABLED.load(Ordering::SeqCst) {
        return;
    }
    if !screen_access(false) {
        log::warn!("screen selection skipped, no screen recording access");
        return;
    }
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten());
    let Some(monitor) = monitor else { return };
    let pos = *monitor.position();
    let size = *monitor.size();

    let shot = xcap::Monitor::from_point(pos.x + 1, pos.y + 1)
        .and_then(|m| m.capture_image())
        .map_err(|e| log::warn!("screen capture failed: {e}"))
        .ok();
    *INPUT.lock().unwrap() = None;
    *SHOT.lock().unwrap() = None;

    let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
    let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    let _ = window.show();
    let _ = app.emit_to(LABEL, "stage-shown", ());
    watch_ctrl(app);

    if let Some(shot) = shot {
        let app = app.clone();
        std::thread::spawn(move || {
            *INPUT.lock().unwrap() = Some(letterbox(&shot));
            *SHOT.lock().unwrap() = Some(shot);
            let _ = app.emit_to(LABEL, "stage-capture", ());
        });
    }
}

pub fn hide(app: &AppHandle) {
    WATCH_ID.fetch_add(1, Ordering::SeqCst);
    SELECTING.store(false, Ordering::SeqCst);
    *INPUT.lock().unwrap() = None;
    *SHOT.lock().unwrap() = None;
    let _ = app.emit_to(LABEL, "stage-hidden", ());
    if let Some(window) = app.get_webview_window(LABEL) {
        crate::overlay_window::HELD.store(false, Ordering::SeqCst);
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
    }
}

fn set_selecting(app: &AppHandle, active: bool) {
    let Some(window) = app.get_webview_window(LABEL) else {
        log::warn!("stage window missing");
        return;
    };
    log::info!("stage selecting {active}");
    SELECTING.store(active, Ordering::SeqCst);
    //bar must survive losing focus
    crate::overlay_window::HELD.store(active, Ordering::SeqCst);
    let _ = window.set_ignore_cursor_events(!active);
    let _ = app.emit_to(LABEL, "stage-select", active);
    if active {
        //ctrl release lands here
        let _ = window.set_focus();
    } else if let Some(bar) = app.get_webview_window(crate::overlay_window::LABEL) {
        if bar.is_visible().unwrap_or(false) {
            let _ = bar.set_focus();
        }
    }
}

#[tauri::command]
pub fn stage_select(app: AppHandle, active: bool) {
    set_selecting(&app, active);
}

//crops a region for the bar
#[tauri::command]
pub fn stage_crop(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let png = {
        let shot = SHOT.lock().unwrap();
        let shot = shot.as_ref().ok_or("no capture")?;
        let (sw, sh) = (shot.width() as f64, shot.height() as f64);
        let cx = ((x.clamp(0.0, 1.0) * sw) as u32).min(shot.width() - 1);
        let cy = ((y.clamp(0.0, 1.0) * sh) as u32).min(shot.height() - 1);
        let cw = ((w * sw) as u32).clamp(1, shot.width() - cx);
        let ch = ((h * sh) as u32).clamp(1, shot.height() - cy);
        let crop = imageops::crop_imm(shot, cx, cy, cw, ch).to_image();
        let mut bytes = std::io::Cursor::new(Vec::new());
        crop.write_to(&mut bytes, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        bytes.into_inner()
    };
    let url = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png));
    set_selecting(&app, false);
    app.emit_to(crate::overlay_window::LABEL, "stage-selection", url)
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn key_down(vk: i32) -> bool {
    unsafe { windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(vk) < 0 }
}

#[cfg(windows)]
const VK_CONTROL: i32 = 0x11;

#[cfg(windows)]
fn ctrl_down() -> bool {
    key_down(VK_CONTROL)
}

#[cfg(windows)]
fn other_key_down() -> bool {
    //generic and side specific ctrl codes
    (0x08..=0xFE).filter(|vk| ![VK_CONTROL, 0xA2, 0xA3].contains(vk)).any(key_down)
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceKeyState(state: i32, key: u16) -> bool;
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
}

//left and right control keycodes
#[cfg(target_os = "macos")]
const MAC_CTRL: [u16; 2] = [59, 62];

#[cfg(target_os = "macos")]
fn mac_key_down(key: u16) -> bool {
    unsafe { CGEventSourceKeyState(0, key) }
}

#[cfg(target_os = "macos")]
fn ctrl_down() -> bool {
    MAC_CTRL.into_iter().any(mac_key_down)
}

#[cfg(target_os = "macos")]
fn other_key_down() -> bool {
    (0..128u16).filter(|k| !MAC_CTRL.contains(k)).any(mac_key_down)
}

//webview keys unreliable across windows
#[cfg(any(windows, target_os = "macos"))]
fn watch_ctrl(app: &AppHandle) {
    let id = WATCH_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        //opening shortcut may still hold ctrl
        let mut armed = false;
        let mut held_ms = 0u64;
        let mut combo = false;
        let mut was_ctrl = true;
        while WATCH_ID.load(Ordering::SeqCst) == id {
            std::thread::sleep(std::time::Duration::from_millis(20));
            let ctrl = ctrl_down();
            let released = was_ctrl && !ctrl;
            was_ctrl = ctrl;
            if !ctrl {
                //once per release
                if released && SELECTING.load(Ordering::SeqCst) {
                    let _ = app.emit_to(LABEL, "stage-ctrl-up", ());
                }
                armed = true;
                held_ms = 0;
                combo = false;
                continue;
            }
            if !armed || SELECTING.load(Ordering::SeqCst) {
                continue;
            }
            //ctrl c and friends stay shortcuts
            combo |= other_key_down();
            held_ms += 20;
            if !combo && held_ms >= CTRL_HOLD_MS {
                set_selecting(&app, true);
            }
        }
    });
}

#[cfg(not(any(windows, target_os = "macos")))]
fn watch_ctrl(_app: &AppHandle) {}

//macos blanks captures and keys otherwise
pub fn screen_access(request: bool) -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        let mut screen = CGPreflightScreenCaptureAccess();
        let mut keys = CGPreflightListenEventAccess();
        //only the first request shows a prompt
        if request && !screen {
            screen = CGRequestScreenCaptureAccess();
        }
        if request && !keys {
            keys = CGRequestListenEventAccess();
        }
        return screen && keys;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        true
    }
}

#[tauri::command]
pub fn stage_screen_access(request: bool) -> bool {
    screen_access(request)
}

#[tauri::command]
pub fn stage_open_screen_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
