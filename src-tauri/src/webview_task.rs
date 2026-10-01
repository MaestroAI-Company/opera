use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

//fake host carrying the page payload
const BRIDGE_HOST: &str = "maestro-bridge.invalid";

static COUNTER: AtomicU32 = AtomicU32::new(0);

//mirrors the react-native-webview bridge
fn bridge_script(script: &str) -> String {
    format!(
        r#"(function() {{
  if (window.top !== window) return;
  var sent = false;
  window.ReactNativeWebView = {{
    postMessage: function(data) {{
      if (sent) return;
      sent = true;
      window.location.href = 'https://{BRIDGE_HOST}/?d=' + encodeURIComponent(data);
    }}
  }};
  function run() {{ {script}
  }}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}})();"#
    )
}

//run script in a hidden window
#[tauri::command]
pub async fn webview_task(
    app: AppHandle,
    url: String,
    script: String,
    user_agent: Option<String>,
    timeout_ms: u64,
) -> Result<String, String> {
    let target = url.parse().map_err(|e| format!("invalid url: {e}"))?;
    let label = format!("webview-task-{}", COUNTER.fetch_add(1, Ordering::Relaxed));
    let (tx, rx) = mpsc::channel::<String>();

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target))
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .initialization_script(bridge_script(&script))
        .on_navigation(move |nav| {
            if nav.host_str() != Some(BRIDGE_HOST) {
                return true;
            }
            if let Some((_, data)) = nav.query_pairs().find(|(k, _)| k == "d") {
                let _ = tx.send(data.into_owned());
            }
            false
        });
    if let Some(ua) = user_agent.as_deref() {
        builder = builder.user_agent(ua);
    }
    let window = builder.build().map_err(|e| e.to_string())?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_millis(timeout_ms))
    })
    .await;
    let _ = window.destroy();

    match result {
        Ok(Ok(data)) => Ok(data),
        Ok(Err(_)) => Err("WebView task timed out".into()),
        Err(e) => Err(e.to_string()),
    }
}
