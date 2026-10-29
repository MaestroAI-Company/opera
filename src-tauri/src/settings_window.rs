use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LABEL: &str = "settings";

fn build_settings_window(
    app: &AppHandle,
    page: Option<String>,
    pair: Option<String>,
    visible: bool,
) -> Result<tauri::WebviewWindow, String> {
    //first paint already knows the target page
    let mut query = tauri::Url::parse("tauri://localhost/").map_err(|e| e.to_string())?;
    {
        let mut pairs = query.query_pairs_mut();
        pairs.append_pair("window", "settings");
        if let Some(page) = &page {
            pairs.append_pair("page", page);
        }
        if let Some(pair) = &pair {
            pairs.append_pair("pair", pair);
        }
    }
    let url = format!("?{}", query.query().unwrap_or_default());

    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title("Opera")
        .inner_size(1000.0, 700.0)
        .min_inner_size(780.0, 520.0)
        .max_inner_size(1100.0, 800.0)
        //macos folds fullscreen into the zoom button
        .maximizable(false)
        .center()
        .visible(visible)
        .background_color(tauri::window::Color(253, 248, 241, 255));

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    //same data folder as the main window or storage would be empty
    #[cfg(windows)]
    if let Some(dir) = crate::webview_data_dir(app) {
        builder = builder.data_directory(dir);
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    window.set_decorations(false).map_err(|e| e.to_string())?;

    let handle = app.clone();
    let guard = window.clone();
    window.on_window_event(move |event| match event {
        //keep reopen instant on close
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = guard.hide();
            let _ = handle.emit("settings-window-closed", ());
        }
        //main window refreshes what settings changed
        WindowEvent::Destroyed => {
            let _ = handle.emit("settings-window-closed", ());
        }
        //shortcuts and window managers can still force a bigger window
        WindowEvent::Resized(_) => {
            if guard.is_fullscreen().unwrap_or(false) {
                let _ = guard.set_fullscreen(false);
            }
            //macos reports the max size as zoomed, undoing it flickers
            #[cfg(not(target_os = "macos"))]
            if guard.is_maximized().unwrap_or(false) {
                let _ = guard.unmaximize();
            }
        }
        _ => {}
    });

    Ok(window)
}

//warm webview before first open
pub fn warmup_settings_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    build_settings_window(app, None, None, false)?;
    Ok(())
}

//opens the settings window or brings the open one forward
#[tauri::command]
//prevent main thread deadlock on windows
pub async fn open_settings_window(
    app: AppHandle,
    page: Option<String>,
    pair: Option<String>,
) -> Result<(), String> {
    let window = match app.get_webview_window(LABEL) {
        Some(window) => window,
        None => build_settings_window(&app, page.clone(), pair.clone(), true)?,
    };

    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    //bypass windows focus stealing guard
    let _ = window.set_always_on_top(true);
    let _ = window.set_always_on_top(false);
    window.set_focus().map_err(|e| e.to_string())?;
    //navigate open webview via event
    app.emit_to(LABEL, "settings-navigate", (page, pair))
        .map_err(|e| e.to_string())?;
    Ok(())
}
