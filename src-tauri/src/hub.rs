use std::collections::HashMap;
use std::sync::Arc;

use sampler_hub::{config, hub, service};
use sampler_hub_client::{
    CatalogModel, HubClient, HubDevice, HubError, HubInvite, HubProfile, HubProvider, HubSettings,
    HubStatus, LinkJoining, LinkProgress, LlamaStatus, McpServerSummary, ModelFile, ModelRepo,
    NearbyHub, PairedHub, ProfileLock, ProxyInfo, PullPage, SyncRecord, UnlockedProfile,
};
use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

//how long a fresh hub gets to take its lock
const START_POLLS: u32 = 50;
const START_POLL: std::time::Duration = std::time::Duration::from_millis(200);

//one client per device key like android
#[derive(Default)]
pub struct HubState {
    clients: Mutex<HashMap<String, Arc<HubClient>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    //a hub runs on this computer
    running: bool,
    //it starts with the session
    installed: bool,
    //none until a hub ever ran here
    id: Option<String>,
}

impl HubState {
    async fn client(&self, device_key: &str) -> Result<Arc<HubClient>, HubError> {
        let mut clients = self.clients.lock().await;
        if let Some(client) = clients.get(device_key) {
            return Ok(client.clone());
        }
        let client = HubClient::new(decode_hex(device_key)?)?;
        clients.insert(device_key.to_string(), client.clone());
        Ok(client)
    }
}

fn decode_hex(text: &str) -> Result<Vec<u8>, HubError> {
    let invalid = || HubError::Internal("invalid device key".into());
    if text.len() % 2 != 0 {
        return Err(invalid());
    }
    (0..text.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(text.get(i..i + 2).ok_or_else(invalid)?, 16).map_err(|_| invalid())
        })
        .collect()
}

fn host_error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn hub_device_id(
    state: State<'_, HubState>,
    device_key: String,
) -> Result<String, HubError> {
    Ok(state.client(&device_key).await?.device_id())
}

#[tauri::command]
pub async fn hub_pair(
    state: State<'_, HubState>,
    device_key: String,
    link: String,
    device_name: String,
    kind: String,
) -> Result<PairedHub, HubError> {
    let client = state.client(&device_key).await?;
    client.pair(link, device_name, kind, machine_id()).await
}

//stable for this os install, hashed by the client
fn machine_id() -> Option<String> {
    machine_uid::get().ok()
}

#[tauri::command]
pub async fn hub_pair_with_code(
    state: State<'_, HubState>,
    device_key: String,
    code: String,
    device_name: String,
    kind: String,
) -> Result<PairedHub, HubError> {
    let client = state.client(&device_key).await?;
    client
        .pair_with_code(code, device_name, kind, machine_id())
        .await
}

#[tauri::command]
pub async fn hub_invite(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<HubInvite, HubError> {
    state.client(&device_key).await?.invite(hub).await
}

#[tauri::command]
pub async fn hub_settings(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<HubSettings, HubError> {
    state.client(&device_key).await?.hub_settings(hub).await
}

#[tauri::command]
pub async fn hub_set_settings(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    settings: HubSettings,
) -> Result<HubSettings, HubError> {
    let client = state.client(&device_key).await?;
    client.set_hub_settings(hub, settings).await
}

#[tauri::command]
pub async fn hub_nearby(
    state: State<'_, HubState>,
    device_key: String,
    wait_ms: u64,
) -> Result<Vec<NearbyHub>, HubError> {
    state.client(&device_key).await?.nearby_hubs(wait_ms).await
}

#[tauri::command]
pub async fn hub_update(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<String, HubError> {
    state.client(&device_key).await?.update_hub(hub).await
}

//false where the hub swaps its own binaries
#[tauri::command]
pub async fn hub_install_update(version: String) -> Result<bool, String> {
    if !cfg!(windows) {
        return Ok(false);
    }
    let http = sampler_hub::secrets::http_client().map_err(host_error)?;
    let installer = sampler_hub::update::download_installer(&http, &version)
        .await
        .map_err(host_error)?;
    std::process::Command::new(installer)
        .spawn()
        .map_err(host_error)?;
    Ok(true)
}

#[tauri::command]
pub async fn hub_models_catalog(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<Vec<CatalogModel>, HubError> {
    let client = state.client(&device_key).await?;
    client.models_catalog(hub).await
}

#[tauri::command]
pub async fn hub_models_search(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    query: String,
) -> Result<Vec<ModelRepo>, HubError> {
    let client = state.client(&device_key).await?;
    client.models_search(hub, query).await
}

#[tauri::command]
pub async fn hub_models_files(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    repo: String,
) -> Result<Vec<ModelFile>, HubError> {
    let client = state.client(&device_key).await?;
    client.models_files(hub, repo).await
}

#[tauri::command]
pub async fn hub_models_download(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    repo: String,
    file: String,
) -> Result<LlamaStatus, HubError> {
    let client = state.client(&device_key).await?;
    client.models_download(hub, repo, file).await
}

#[tauri::command]
pub async fn hub_models_cancel(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    file: String,
) -> Result<LlamaStatus, HubError> {
    let client = state.client(&device_key).await?;
    client.models_cancel(hub, file).await
}

#[tauri::command]
pub async fn hub_models_delete(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    file: String,
) -> Result<LlamaStatus, HubError> {
    let client = state.client(&device_key).await?;
    client.models_delete(hub, file).await
}

//opera/mcp/1 json both ways
#[tauri::command]
pub async fn hub_mcp_json(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    request: String,
) -> Result<String, HubError> {
    let client = state.client(&device_key).await?;
    client.mcp_json(hub, request).await
}

#[tauri::command]
pub async fn hub_models_status(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<LlamaStatus, HubError> {
    let client = state.client(&device_key).await?;
    client.models_status(hub).await
}

#[tauri::command]
pub fn hub_qr_svg(text: String, dark: String, light: String) -> Result<String, HubError> {
    sampler_hub_client::qr_svg(text, dark, light)
}

#[tauri::command]
pub async fn hub_status(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<HubStatus, HubError> {
    state.client(&device_key).await?.status(hub).await
}

#[tauri::command]
pub async fn hub_unpair(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<(), HubError> {
    state.client(&device_key).await?.unpair(hub).await
}

#[tauri::command]
pub async fn hub_rename_device(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    id: String,
    name: String,
) -> Result<(), HubError> {
    let client = state.client(&device_key).await?;
    client.rename_device(hub, id, name).await
}

#[tauri::command]
pub async fn hub_remove_device(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    id: String,
) -> Result<(), HubError> {
    state
        .client(&device_key)
        .await?
        .remove_device(hub, id)
        .await
}

#[tauri::command]
pub async fn hub_devices(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<Vec<HubDevice>, HubError> {
    state.client(&device_key).await?.devices(hub).await
}

#[tauri::command]
pub async fn hub_push(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    collection: String,
    records: Vec<SyncRecord>,
) -> Result<(), HubError> {
    state
        .client(&device_key)
        .await?
        .push(hub, collection, records)
        .await
}

#[tauri::command]
pub async fn hub_pull(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    collection: String,
    since: u64,
) -> Result<PullPage, HubError> {
    state
        .client(&device_key)
        .await?
        .pull(hub, collection, since)
        .await
}

#[tauri::command]
pub async fn hub_watch(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    since: u64,
) -> Result<u64, HubError> {
    state.client(&device_key).await?.watch(hub, since).await
}

#[tauri::command]
pub async fn hub_set_profile(
    state: State<'_, HubState>,
    device_key: String,
    profile_id: String,
    key: String,
) -> Result<(), HubError> {
    state.client(&device_key).await?.set_profile(profile_id, key)
}

#[tauri::command]
pub async fn hub_clear_profile(
    state: State<'_, HubState>,
    device_key: String,
) -> Result<(), HubError> {
    state.client(&device_key).await?.clear_profile();
    Ok(())
}

#[tauri::command]
pub async fn hub_profiles(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<Vec<HubProfile>, HubError> {
    state.client(&device_key).await?.profiles(hub).await
}

#[tauri::command]
pub async fn hub_remove_profile(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    id: String,
) -> Result<(), HubError> {
    state
        .client(&device_key)
        .await?
        .remove_profile(hub, id)
        .await
}

#[tauri::command]
pub async fn hub_set_profile_role(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    id: String,
    role: String,
) -> Result<(), HubError> {
    state
        .client(&device_key)
        .await?
        .set_profile_role(hub, id, role)
        .await
}

#[tauri::command]
pub async fn hub_mcp_overview(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<Vec<McpServerSummary>, HubError> {
    state.client(&device_key).await?.mcp_overview(hub).await
}

#[tauri::command]
pub async fn hub_mcp_manage(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    id: String,
    action: String,
) -> Result<Vec<McpServerSummary>, HubError> {
    state
        .client(&device_key)
        .await?
        .mcp_manage(hub, id, action)
        .await
}

#[tauri::command]
pub async fn hub_create_profile(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    name: String,
    password: String,
) -> Result<UnlockedProfile, HubError> {
    state
        .client(&device_key)
        .await?
        .create_profile(hub, name, password)
        .await
}

#[tauri::command]
pub async fn hub_unlock_profile(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    profile_id: String,
    password: String,
) -> Result<UnlockedProfile, HubError> {
    state
        .client(&device_key)
        .await?
        .unlock_profile(hub, profile_id, password)
        .await
}

#[tauri::command]
pub async fn hub_change_password(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    current: String,
    next: String,
) -> Result<(), HubError> {
    state
        .client(&device_key)
        .await?
        .change_password(hub, current, next)
        .await
}

#[tauri::command]
pub async fn hub_rename_profile(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    name: String,
) -> Result<HubProfile, HubError> {
    state.client(&device_key).await?.rename_profile(hub, name).await
}

#[tauri::command]
pub async fn hub_locked_key(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<ProfileLock, HubError> {
    state.client(&device_key).await?.locked_key(hub).await
}

//argon2 stays off the async runtime
#[tauri::command]
pub async fn hub_open_locked_key(lock: ProfileLock, password: String) -> Result<String, HubError> {
    tokio::task::spawn_blocking(move || sampler_hub_client::open_locked_key(lock, password))
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
}

#[tauri::command]
pub fn hub_profile_backup_key(key: String) -> Result<String, HubError> {
    sampler_hub_client::profile_backup_key(key)
}

#[tauri::command]
pub async fn hub_link_start(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<HubInvite, HubError> {
    state.client(&device_key).await?.link_start(hub).await
}

#[tauri::command]
pub async fn hub_link_watch(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<Option<LinkJoining>, HubError> {
    state.client(&device_key).await?.link_watch(hub).await
}

#[tauri::command]
pub async fn hub_link_approve(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<(), HubError> {
    state.client(&device_key).await?.link_approve(hub).await
}

#[tauri::command]
pub async fn hub_link_deny(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<(), HubError> {
    state.client(&device_key).await?.link_deny(hub).await
}

#[tauri::command]
pub async fn hub_link_join(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<(), HubError> {
    state.client(&device_key).await?.link_join(hub).await
}

#[tauri::command]
pub async fn hub_link_fetch(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<LinkProgress, HubError> {
    state.client(&device_key).await?.link_fetch(hub).await
}

#[tauri::command]
pub async fn hub_lease(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    name: String,
) -> Result<bool, HubError> {
    state.client(&device_key).await?.lease(hub, name).await
}

#[tauri::command]
pub async fn hub_release(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
    name: String,
) -> Result<(), HubError> {
    state.client(&device_key).await?.release(hub, name).await
}

#[tauri::command]
pub async fn hub_providers(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<Vec<HubProvider>, HubError> {
    state.client(&device_key).await?.providers(hub).await
}

#[tauri::command]
pub async fn hub_start_proxy(
    state: State<'_, HubState>,
    device_key: String,
    hub: PairedHub,
) -> Result<ProxyInfo, HubError> {
    state.client(&device_key).await?.start_proxy(hub).await
}

#[tauri::command]
pub async fn hub_host_status() -> Result<HostStatus, String> {
    let data_dir = config::default_data_dir().map_err(host_error)?;
    //reading must not create a key
    let id = if data_dir.join(config::SECRET_KEY_FILE).exists() {
        let key = config::load_or_create_key(&data_dir).map_err(host_error)?;
        Some(key.public().to_string())
    } else {
        None
    };
    let installed = tauri::async_runtime::spawn_blocking(service::status)
        .await
        .map_err(host_error)?
        .map_err(host_error)?;
    Ok(HostStatus {
        running: hub::is_running(&data_dir),
        installed: installed != service::Status::NotInstalled,
        id,
    })
}

//the sidecar runs with the session, with or without the app
#[tauri::command]
pub async fn hub_host_start() -> Result<(), String> {
    let data_dir = config::default_data_dir().map_err(host_error)?;
    if hub::is_running(&data_dir) {
        return Ok(());
    }
    let exe = std::env::current_exe().map_err(host_error)?;
    let launch = service::Launch::next_to(&exe, &data_dir).map_err(host_error)?;
    tauri::async_runtime::spawn_blocking(move || service::install(&launch))
        .await
        .map_err(host_error)?
        .map_err(host_error)?;
    //pairing right after needs it listening
    for _ in 0..START_POLLS {
        if hub::is_running(&data_dir) {
            return Ok(());
        }
        tokio::time::sleep(START_POLL).await;
    }
    Err("the hub did not start".into())
}

//stops it and its login start
#[tauri::command]
pub async fn hub_host_stop() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(service::uninstall)
        .await
        .map_err(host_error)?
        .map_err(host_error)
}

//one time link for this app to pair itself
#[tauri::command]
pub async fn hub_host_pairing_link() -> Result<String, String> {
    let data_dir = config::default_data_dir().map_err(host_error)?;
    Ok(hub::pairing_link(&data_dir)
        .map_err(host_error)?
        .to_string())
}

//the name other devices see
#[tauri::command]
pub fn hub_computer_name() -> String {
    config::Config::default().hub_name()
}
