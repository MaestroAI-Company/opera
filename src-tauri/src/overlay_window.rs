use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub(crate) const LABEL: &str = "overlay";
//file dialogs steal focus
pub(crate) static HELD: AtomicBool = AtomicBool::new(false);
//user pin keeps it on top
static PINNED: AtomicBool = AtomicBool::new(false);
//dragged away so resizes keep position
static MOVED: AtomicBool = AtomicBool::new(false);
pub const SHORTCUT: &str = "CommandOrControl+Shift+Space";
//shell plus glow room
const WIDTH: f64 = 554.0;
const START_HEIGHT: f64 = 96.0;
//gap above the taskbar or dock
const BOTTOM_GAP: f64 = 0.0;

fn build_overlay_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("?window=overlay".into()))
        .title("Maestro")
        .inner_size(WIDTH, START_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false);

    //same data folder as the main window or storage would be empty
    #[cfg(windows)]
    if let Some(dir) = crate::webview_data_dir(app) {
        builder = builder.data_directory(dir);
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    let handle = app.clone();
    let guard = window.clone();
    window.on_window_event(move |event| match event {
        //keep reopen instant on close
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide(&handle, &guard);
        }
        //click outside dismisses like android
        WindowEvent::Focused(focused) if cfg!(debug_assertions) => {
            //temporary focus trace
            eprintln!("[overlay] focused={focused} held={} pinned={}", HELD.load(Ordering::SeqCst), PINNED.load(Ordering::SeqCst));
            if !*focused && !HELD.load(Ordering::SeqCst) && !PINNED.load(Ordering::SeqCst) {
                hide(&handle, &guard)
            }
        }
        WindowEvent::Focused(false)
            if !HELD.load(Ordering::SeqCst) && !PINNED.load(Ordering::SeqCst) =>
        {
            hide(&handle, &guard)
        }
        _ => {}
    });

    Ok(window)
}

fn hide(app: &AppHandle, window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        PINNED.store(false, Ordering::SeqCst);
        crate::overlay_stage::hide(app);
        let _ = window.hide();
        let _ = app.emit_to(LABEL, "overlay-hidden", ());
        //main list misses overlay writes
        let _ = app.emit_to("main", "overlay-closed", ());
    }
}

//bottom center of the cursor screen
fn place(app: &AppHandle, window: &tauri::WebviewWindow, height: f64, follow_cursor: bool) {
    let under_cursor = || {
        app.cursor_position()
            .ok()
            .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
    };
    let current = || window.current_monitor().ok().flatten();
    let monitor = if follow_cursor {
        under_cursor().or_else(current)
    } else {
        current().or_else(under_cursor)
    };
    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let x = area.position.x as f64 / scale + (area.size.width as f64 / scale - WIDTH) / 2.0;
    let y = (area.position.y + area.size.height as i32) as f64 / scale - height - BOTTOM_GAP;
    let _ = window.set_position(LogicalPosition::new(x, y));
}

fn show(app: &AppHandle, window: &tauri::WebviewWindow) {
    let height = window
        .inner_size()
        .ok()
        .and_then(|s| window.scale_factor().ok().map(|f| s.height as f64 / f))
        .unwrap_or(START_HEIGHT);
    //reopen returns to default spot
    MOVED.store(false, Ordering::SeqCst);
    place(app, &window, height, true);
    crate::overlay_stage::show(app);
    let _ = window.show();
    //bypass windows focus stealing guard, macos drops focus on it
    #[cfg(windows)]
    {
        let _ = window.set_always_on_top(false);
        let _ = window.set_always_on_top(true);
    }
    //show is queued on macos, focus needs the window visible
    #[cfg(target_os = "macos")]
    {
        let focus = window.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = focus.set_focus();
            eprintln!("[overlay] after set_focus is_focused={:?}", focus.is_focused());
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = window.set_focus();
    let _ = app.emit_to(LABEL, "overlay-shown", ());
}

//hold time before push to talk
const HOLD_MS: u64 = 350;
static DOWN: AtomicBool = AtomicBool::new(false);
static TALKING: AtomicBool = AtomicBool::new(false);
static WAS_VISIBLE: AtomicBool = AtomicBool::new(false);
static PRESS_ID: AtomicU64 = AtomicU64::new(0);

fn on_press(app: &AppHandle) {
    //hotkey repeats while held
    if DOWN.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(window) = app.get_webview_window(LABEL) else { return };
    let visible = window.is_visible().unwrap_or(false);
    WAS_VISIBLE.store(visible, Ordering::SeqCst);
    if !visible {
        show(app, &window);
    }
    let id = PRESS_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(HOLD_MS)).await;
        if DOWN.load(Ordering::SeqCst) && PRESS_ID.load(Ordering::SeqCst) == id {
            TALKING.store(true, Ordering::SeqCst);
            let _ = app.emit_to(LABEL, "overlay-talk-start", ());
        }
    });
}

fn on_release(app: &AppHandle) {
    DOWN.store(false, Ordering::SeqCst);
    if TALKING.swap(false, Ordering::SeqCst) {
        let _ = app.emit_to(LABEL, "overlay-talk-end", ());
    } else if WAS_VISIBLE.load(Ordering::SeqCst) {
        //short press closes an open overlay
        if let Some(window) = app.get_webview_window(LABEL) {
            hide(app, &window);
        }
    }
}

//close hides the main window
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

fn register(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            match event.state {
                ShortcutState::Pressed => on_press(app),
                ShortcutState::Released => on_release(app),
            }
        })
        .map_err(|e| e.to_string())
}

pub fn setup(app: &AppHandle) -> Result<(), String> {
    build_overlay_window(app)?;
    crate::overlay_stage::build(app)?;
    register(app, SHORTCUT)
}

//webview pushes its saved settings
#[tauri::command]
pub fn overlay_configure(
    app: AppHandle,
    enabled: bool,
    shortcut: String,
    close_to_tray: bool,
    screen_selection: bool,
) -> Result<(), String> {
    CLOSE_TO_TRAY.store(close_to_tray, Ordering::SeqCst);
    crate::overlay_stage::ENABLED.store(screen_selection, Ordering::SeqCst);
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    if !enabled {
        overlay_hide(app);
        return Ok(());
    }
    register(&app, &shortcut)
}

//grows upward with the content
#[tauri::command]
pub fn overlay_resize(app: AppHandle, height: f64) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("no overlay")?;
    if MOVED.load(Ordering::SeqCst) {
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let pos = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.inner_size().map_err(|e| e.to_string())?;
        let bottom = (pos.y as f64 + size.height as f64) / scale;
        window
            .set_size(LogicalSize::new(WIDTH, height))
            .map_err(|e| e.to_string())?;
        let _ = window.set_position(LogicalPosition::new(pos.x as f64 / scale, bottom - height));
        return Ok(());
    }
    window
        .set_size(LogicalSize::new(WIDTH, height))
        .map_err(|e| e.to_string())?;
    place(&app, &window, height, false);
    Ok(())
}

#[tauri::command]
pub fn overlay_set_pinned(pinned: bool) {
    PINNED.store(pinned, Ordering::SeqCst);
}

//only a pinned overlay moves
#[tauri::command]
pub fn overlay_drag(app: AppHandle) -> Result<(), String> {
    if !PINNED.load(Ordering::SeqCst) {
        return Ok(());
    }
    let window = app.get_webview_window(LABEL).ok_or("no overlay")?;
    MOVED.store(true, Ordering::SeqCst);
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn overlay_hold(app: AppHandle, held: bool) {
    HELD.store(held, Ordering::SeqCst);
    if !held {
        if let Some(window) = app.get_webview_window(LABEL) {
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
pub fn overlay_hide(app: AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        hide(&app, &window);
    }
}

//main window shows overlay dialogs
#[tauri::command]
pub fn overlay_forward_notice(app: AppHandle, title: String, message: String) -> Result<(), String> {
    overlay_hide(app.clone());
    crate::tray::show_main(&app);
    app.emit_to("main", "overlay-notice", (title, message))
        .map_err(|e| e.to_string())
}

//onboarding unfinished so open the app
#[tauri::command]
pub fn overlay_show_main(app: AppHandle) {
    overlay_hide(app.clone());
    crate::tray::show_main(&app);
}

//hands the conversation to the main window
#[tauri::command]
pub fn overlay_open_conversation(app: AppHandle, conv_id: String) -> Result<(), String> {
    overlay_hide(app.clone());
    let main = app.get_webview_window("main").ok_or("no main window")?;
    main.show().map_err(|e| e.to_string())?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())?;
    app.emit_to("main", "overlay-open-url", format!("opera://?convId={conv_id}"))
        .map_err(|e| e.to_string())
}
