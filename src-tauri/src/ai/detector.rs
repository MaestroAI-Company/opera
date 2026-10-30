use super::err;
use crate::overlay_stage::{INPUT, INPUT_SIZE};
use ort::{session::Session, value::TensorRef};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const SCORE_MIN: f32 = 0.3;
const MIN_SIDE: f64 = 0.005;

static MODEL: Mutex<Option<Session>> = Mutex::new(None);

//normalized box over the capture
#[derive(Serialize)]
pub struct Region {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

fn load(app: &AppHandle) -> Result<(), String> {
    let mut model = MODEL.lock().unwrap();
    if model.is_none() {
        let path = app
            .path()
            .resolve("models/deki-yolo-fp16.onnx", tauri::path::BaseDirectory::Resource)
            .map_err(err)?;
        *model = Some(super::accelerated()?.commit_from_file(path).map_err(err)?);
    }
    Ok(())
}

//gpu compile takes seconds so load early
#[tauri::command]
pub async fn stage_prepare_detector(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || load(&app)).await.map_err(err)?
}

//null until the capture lands
#[tauri::command]
pub async fn stage_detect(app: AppHandle) -> Result<Option<Vec<Region>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        load(&app)?;
        let input = INPUT.lock().unwrap();
        let Some(input) = input.as_ref() else { return Ok(None) };
        let mut model = MODEL.lock().unwrap();
        let model = model.as_mut().ok_or("detector not loaded")?;
        let started = std::time::Instant::now();
        let size = INPUT_SIZE as usize;
        let name = model.inputs()[0].name().to_string();
        let outputs = model
            .run(ort::inputs![name.as_str() => TensorRef::from_array_view(([1usize, 3, size, size], &*input.tensor)).map_err(err)?])
            .map_err(err)?;
        //rows of box score and label
        let (_, rows) = outputs[0].try_extract_tensor::<f32>().map_err(err)?;
        let clamp = |v: f64| v.clamp(0.0, 1.0);
        let boxes: Vec<Region> = rows
            .chunks_exact(6)
            .filter(|r| r[4] >= SCORE_MIN)
            .filter_map(|r| {
                let x1 = clamp((r[0] as f64 - input.offset_x) / input.content_width);
                let y1 = clamp((r[1] as f64 - input.offset_y) / input.content_height);
                let x2 = clamp((r[2] as f64 - input.offset_x) / input.content_width);
                let y2 = clamp((r[3] as f64 - input.offset_y) / input.content_height);
                (x2 - x1 >= MIN_SIDE && y2 - y1 >= MIN_SIDE).then_some(Region { x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
            })
            .collect();
        log::info!("{} elements detected in {} ms", boxes.len(), started.elapsed().as_millis());
        Ok(Some(boxes))
    })
    .await
    .map_err(err)?
}
