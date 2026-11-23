fn main() {
    //old windows lacks directml so load it late
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/DELAYLOAD:DirectML.dll");
        println!("cargo:rustc-link-lib=delayimp");
    }
    //dawn ships beside the binary or in lib
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
        && std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("x86_64")
    {
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN:$ORIGIN/../lib/Opera");
    }
    //app store build lacks autostart
    let capabilities = if std::env::var_os("CARGO_FEATURE_DIRECT").is_some() {
        "./capabilities/**/*"
    } else {
        "./capabilities/default.json"
    };
    //custom pattern skips tauri rerun
    println!("cargo:rerun-if-changed=capabilities");
    tauri_build::try_build(tauri_build::Attributes::new().capabilities_path_pattern(capabilities))
        .expect("tauri build failed");
}
