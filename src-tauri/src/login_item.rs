use objc2_service_management::{SMAppService, SMAppServiceStatus};

//pending approval counts as off
#[tauri::command]
pub fn login_item_is_enabled() -> bool {
    unsafe { SMAppService::mainAppService().status() == SMAppServiceStatus::Enabled }
}

#[tauri::command]
pub fn login_item_set(enabled: bool) -> Result<(), String> {
    unsafe {
        let service = SMAppService::mainAppService();
        let status = service.status();
        let result = if enabled {
            if status == SMAppServiceStatus::Enabled {
                return Ok(());
            }
            service.registerAndReturnError()
        } else {
            //unregister fails when nothing is registered
            if status == SMAppServiceStatus::NotRegistered || status == SMAppServiceStatus::NotFound {
                return Ok(());
            }
            service.unregisterAndReturnError()
        };
        result.map_err(|e| e.to_string())
    }
}
