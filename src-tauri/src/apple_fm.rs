use serde::Serialize;
use std::collections::HashMap;
use std::ffi::{c_char, CStr, CString};
use std::sync::{LazyLock, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

type Callback = extern "C" fn(*const c_char, i32, *const c_char);

//implemented in the swift package
extern "C" {
    fn opera_afm_info() -> *mut c_char;
    fn opera_afm_free(ptr: *mut c_char);
    fn opera_afm_generate(
        id: *const c_char,
        system: *const c_char,
        prompt: *const c_char,
        callback: Callback,
    );
    fn opera_afm_abort(id: *const c_char);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Token {
    request_id: String,
    chunk: String,
}

//the swift callback has no context argument
static APP: OnceLock<AppHandle> = OnceLock::new();
static PENDING: LazyLock<Mutex<HashMap<String, oneshot::Sender<Result<(), String>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn text(ptr: *const c_char) -> String {
    unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned()
}

//kind is chunk done or error
extern "C" fn on_event(id: *const c_char, kind: i32, payload: *const c_char) {
    let id = text(id);
    let payload = text(payload);
    if kind == 0 {
        if let Some(app) = APP.get() {
            let _ = app.emit("afm-token", Token { request_id: id, chunk: payload });
        }
        return;
    }
    let sender = PENDING.lock().ok().and_then(|mut map| map.remove(&id));
    if let Some(sender) = sender {
        let _ = sender.send(if kind == 1 { Ok(()) } else { Err(payload) });
    }
}

#[tauri::command]
pub fn afm_info() -> serde_json::Value {
    unsafe {
        let ptr = opera_afm_info();
        let info = serde_json::from_str(&CStr::from_ptr(ptr).to_string_lossy())
            .unwrap_or_else(|_| serde_json::json!({ "status": 0 }));
        opera_afm_free(ptr);
        info
    }
}

#[tauri::command]
pub async fn afm_generate(
    app: AppHandle,
    request_id: String,
    system: String,
    prompt: String,
) -> Result<(), String> {
    let _ = APP.set(app);
    let id = CString::new(request_id.clone()).map_err(|e| e.to_string())?;
    let system = CString::new(system).map_err(|e| e.to_string())?;
    let prompt = CString::new(prompt).map_err(|e| e.to_string())?;
    let (tx, rx) = oneshot::channel();
    //register before the callback fires
    PENDING
        .lock()
        .map_err(|e| e.to_string())?
        .insert(request_id, tx);
    unsafe { opera_afm_generate(id.as_ptr(), system.as_ptr(), prompt.as_ptr(), on_event) };
    rx.await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn afm_abort(request_id: String) {
    if let Ok(id) = CString::new(request_id) {
        unsafe { opera_afm_abort(id.as_ptr()) };
    }
}
