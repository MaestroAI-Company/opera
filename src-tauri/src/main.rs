// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if app_lib::install_appimage().is_some() {
        return;
    }
    //webkit cannot render on nvidia x11
    #[cfg(target_os = "linux")]
    if std::path::Path::new("/proc/driver/nvidia").exists() && std::env::var_os("WAYLAND_DISPLAY").is_some() {
        std::env::set_var("GDK_BACKEND", "wayland");
    }
    #[cfg(target_os = "linux")]
    if let Some(appdir) = std::env::var_os("APPDIR").map(std::path::PathBuf::from) {
        //rescanning every plugin stalls the webview
        std::env::remove_var("GST_REGISTRY_REUSE_PLUGIN_SCANNER");
        //fedora bundles a 32 bit tls module
        let modules = appdir.join("usr/lib64/gio/modules");
        if modules.join("libgiognutls.so").exists() {
            std::env::set_var("GIO_EXTRA_MODULES", modules);
        }
    }
    app_lib::run();
}
