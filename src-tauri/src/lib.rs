#[cfg(desktop)]
mod hub;
mod webview_task;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
            .manage(hub::HubState::default());
    }

    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            webview_task::webview_task,
            #[cfg(desktop)]
            hub::hub_device_id,
            #[cfg(desktop)]
            hub::hub_pair,
            #[cfg(desktop)]
            hub::hub_status,
            #[cfg(desktop)]
            hub::hub_unpair,
            #[cfg(desktop)]
            hub::hub_devices,
            #[cfg(desktop)]
            hub::hub_push,
            #[cfg(desktop)]
            hub::hub_pull,
            #[cfg(desktop)]
            hub::hub_watch,
            #[cfg(desktop)]
            hub::hub_put_grant,
            #[cfg(desktop)]
            hub::hub_access_token,
            #[cfg(desktop)]
            hub::hub_drop_grant,
            #[cfg(desktop)]
            hub::hub_providers,
            #[cfg(desktop)]
            hub::hub_start_proxy,
            #[cfg(desktop)]
            hub::hub_host_status,
            #[cfg(desktop)]
            hub::hub_host_start,
            #[cfg(desktop)]
            hub::hub_host_stop,
            #[cfg(desktop)]
            hub::hub_host_pairing_link,
            #[cfg(desktop)]
            hub::hub_pair_with_code,
            #[cfg(desktop)]
            hub::hub_invite,
            #[cfg(desktop)]
            hub::hub_qr_svg,
            #[cfg(desktop)]
            hub::hub_settings,
            #[cfg(desktop)]
            hub::hub_set_settings,
            #[cfg(desktop)]
            hub::hub_nearby,
            #[cfg(desktop)]
            hub::hub_computer_name,
        ])
        .setup(|app| {
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
                        //the hub network logs every packet
                        .filter(|meta| {
                            const NOISY: [&str; 6] = [
                                "iroh",
                                "noq",
                                "netwatch",
                                "portmapper",
                                "tracing::span",
                                "hickory",
                            ];
                            meta.level() <= log::Level::Warn
                                || !NOISY.iter().any(|t| meta.target().starts_with(t))
                        })
                        .build(),
                )?;
            }
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
