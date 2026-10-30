use super::err;
use ort::{
    session::{Session, SessionInputValue},
    value::{DynValue, Tensor, TensorElementType},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle,
};

//sessions the web layer drives
static SESSIONS: Mutex<Option<HashMap<u32, Arc<Mutex<Session>>>>> = Mutex::new(None);
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Loaded {
    id: u32,
    input_names: Vec<String>,
    output_names: Vec<String>,
}

//one tensor inside the binary payload
#[derive(Serialize, Deserialize)]
struct Slot {
    name: String,
    #[serde(rename = "type")]
    kind: String,
    dims: Vec<i64>,
    offset: usize,
    length: usize,
}

#[derive(Deserialize)]
struct RunHeader {
    id: u32,
    inputs: Vec<Slot>,
}

fn raw(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err("expected a binary body".into()),
    }
}

fn session(id: u32) -> Result<Arc<Mutex<Session>>, String> {
    SESSIONS
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|sessions| sessions.get(&id).cloned())
        .ok_or(format!("no onnx session {id}"))
}

fn tensor(slot: &Slot, bytes: &[u8]) -> Result<DynValue, String> {
    let shape: Vec<usize> = slot.dims.iter().map(|&d| d as usize).collect();
    let data = bytes.get(slot.offset..slot.offset + slot.length).ok_or("tensor outside the payload")?;
    fn cast<T: bytemuck::Pod>(data: &[u8]) -> Vec<T> {
        bytemuck::pod_collect_to_vec(data)
    }
    Ok(match slot.kind.as_str() {
        "float32" => Tensor::from_array((shape, cast::<f32>(data))).map_err(err)?.into_dyn(),
        "int64" => Tensor::from_array((shape, cast::<i64>(data))).map_err(err)?.into_dyn(),
        "int32" => Tensor::from_array((shape, cast::<i32>(data))).map_err(err)?.into_dyn(),
        "uint8" => Tensor::from_array((shape, data.to_vec())).map_err(err)?.into_dyn(),
        "bool" => Tensor::from_array((shape, data.iter().map(|&b| b != 0).collect::<Vec<_>>())).map_err(err)?.into_dyn(),
        other => return Err(format!("unsupported tensor type {other}")),
    })
}

//type name and little endian bytes
fn output(value: &DynValue) -> Result<(&'static str, Vec<i64>, Vec<u8>), String> {
    macro_rules! read {
        ($t:ty, $name:literal) => {{
            let (shape, data) = value.try_extract_tensor::<$t>().map_err(err)?;
            ($name, shape.to_vec(), bytemuck::cast_slice(data).to_vec())
        }};
    }
    Ok(match value.dtype().tensor_type() {
        Some(TensorElementType::Float32) => read!(f32, "float32"),
        Some(TensorElementType::Int64) => read!(i64, "int64"),
        Some(TensorElementType::Int32) => read!(i32, "int32"),
        Some(TensorElementType::Uint8) => read!(u8, "uint8"),
        Some(TensorElementType::Bool) => {
            let (shape, data) = value.try_extract_tensor::<bool>().map_err(err)?;
            ("bool", shape.to_vec(), data.iter().map(|&b| b as u8).collect())
        }
        other => return Err(format!("unsupported output type {other:?}")),
    })
}

//rust reads the file so no copy
#[tauri::command]
pub async fn ort_load(app: AppHandle, source: String) -> Result<Loaded, String> {
    let path = super::files::path_for(&app, &source)?;
    tauri::async_runtime::spawn_blocking(move || {
        let session = super::accelerated()?.commit_from_file(path).map_err(err)?;
        let loaded = Loaded {
            id: NEXT_ID.fetch_add(1, Ordering::SeqCst),
            input_names: session.inputs().iter().map(|i| i.name().to_string()).collect(),
            output_names: session.outputs().iter().map(|o| o.name().to_string()).collect(),
        };
        SESSIONS
            .lock()
            .unwrap()
            .get_or_insert_with(HashMap::new)
            .insert(loaded.id, Arc::new(Mutex::new(session)));
        Ok(loaded)
    })
    .await
    .map_err(err)?
}

//length then json header then bytes
#[tauri::command]
pub async fn ort_run(request: Request<'_>) -> Result<Response, String> {
    let body = raw(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let size = u32::from_le_bytes(body.get(..4).ok_or("empty payload")?.try_into().map_err(err)?) as usize;
        let header: RunHeader = serde_json::from_slice(body.get(4..4 + size).ok_or("short payload")?).map_err(err)?;
        let data = &body[4 + size..];
        let inputs = header
            .inputs
            .iter()
            .map(|slot| Ok((slot.name.clone(), SessionInputValue::from(tensor(slot, data)?))))
            .collect::<Result<Vec<_>, String>>()?;

        let session = session(header.id)?;
        let mut session = session.lock().unwrap();
        let outputs = session.run(inputs).map_err(err)?;
        let mut slots = Vec::new();
        let mut bytes = Vec::new();
        for (name, value) in outputs.iter() {
            let (kind, dims, data) = output(&value)?;
            slots.push(Slot { name: name.to_string(), kind: kind.into(), dims, offset: bytes.len(), length: data.len() });
            bytes.extend_from_slice(&data);
        }
        let header = serde_json::to_vec(&slots).map_err(err)?;
        let mut reply = (header.len() as u32).to_le_bytes().to_vec();
        reply.extend_from_slice(&header);
        reply.extend_from_slice(&bytes);
        Ok(Response::new(reply))
    })
    .await
    .map_err(err)?
}

#[tauri::command]
pub fn ort_release(id: u32) {
    if let Some(sessions) = SESSIONS.lock().unwrap().as_mut() {
        sessions.remove(&id);
    }
}
