use std::net::{IpAddr, Ipv4Addr};
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

//blocks local and private network targets
fn is_public_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host == "localhost" || host.ends_with(".localhost") {
        return false;
    }
    //url keeps ipv6 literals in brackets
    let literal = host.trim_start_matches('[').trim_end_matches(']');
    match literal.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => is_public_v4(ip),
        Ok(IpAddr::V6(ip)) => match ip.to_ipv4_mapped() {
            Some(mapped) => is_public_v4(mapped),
            None => {
                let first = ip.segments()[0];
                !(ip.is_loopback() || ip.is_unspecified() || first & 0xfe00 == 0xfc00 || first & 0xffc0 == 0xfe80)
            }
        },
        Err(_) => true,
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    !(ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified())
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
    let target: tauri::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("only http and https urls are allowed".into());
    }
    if !is_public_host(target.host_str().unwrap_or("")) {
        return Err("local and private hosts are not allowed".into());
    }
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
