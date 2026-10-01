mod webview_task;

//mobile sized ui scaled down to desktop proportions
#[cfg(desktop)]
const UI_ZOOM: f64 = 0.9;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![webview_task::webview_task])
        .setup(|app| {
            //page zoom keeps layout and pointer coordinates consistent, unlike css zoom
            #[cfg(desktop)]
            {
                use tauri::Manager;
                app.get_webview_window("main").unwrap().set_zoom(UI_ZOOM)?;
            }

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();
                window.set_decorations(false).unwrap();
            }

            //webkitgtk denies permissions by default
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();
                window.with_webview(|webview| {
                    use webkit2gtk::glib::object::ObjectExt;
                    use webkit2gtk::{
                        GeolocationPermissionRequest, NotificationPermissionRequest,
                        PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, WebViewExt,
                    };

                    let webview = webview.inner();
                    //expose getusermedia on old webkitgtk
                    if let Some(settings) = WebViewExt::settings(&webview) {
                        settings.set_enable_media_stream(true);
                    }

                    webview.connect_permission_request(|_, request| {
                        let known = request.is::<UserMediaPermissionRequest>()
                            || request.is::<GeolocationPermissionRequest>()
                            || request.is::<NotificationPermissionRequest>();
                        if known {
                            //os prompt is the real gate
                            request.allow();
                        }
                        known
                    });
                })?;
            }

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
