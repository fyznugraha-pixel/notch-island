use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const TASKBAR_PRO_PRODUCT_ID: &str = "gili_taskbar_pro";
const OFFLINE_GRACE_SECS: u64 = 7 * 24 * 60 * 60;
const CLOCK_SKEW_TOLERANCE_SECS: u64 = 300;
const CACHE_FILE_VERSION: u32 = 2;
const DPAPI_ENTROPY: &[u8] = b"GiliStoreProLicenseCacheV2";

static PACKAGED_MSIX: OnceLock<bool> = OnceLock::new();
static STORE_PRO_ACTIVE: AtomicBool = AtomicBool::new(false);
static CACHED_CHECKED_AT_UNIX: AtomicU64 = AtomicU64::new(0);
static STARTUP_SYNC_DONE: AtomicBool = AtomicBool::new(false);
static STARTUP_SYNC_WAIT: OnceLock<(Mutex<bool>, Condvar)> = OnceLock::new();
static CACHED_STORE_META: OnceLock<Mutex<StoreProductMeta>> = OnceLock::new();

#[derive(Debug, Clone, Default)]
struct StoreProductMeta {
    store_id: Option<String>,
    product_title: Option<String>,
    formatted_price: Option<String>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarProStatus {
    pub is_packaged_msix: bool,
    pub has_pro: bool,
    pub is_locked: bool,
    pub source: String,
    pub offer_token: String,
    pub store_id: Option<String>,
    pub product_title: Option<String>,
    pub formatted_price: Option<String>,
    pub checking: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarProPurchaseOutcome {
    pub status: String,
    pub message: String,
    pub license_status: TaskbarProStatus,
}

fn meta_store() -> &'static Mutex<StoreProductMeta> {
    CACHED_STORE_META.get_or_init(|| Mutex::new(StoreProductMeta::default()))
}

fn startup_wait_pair() -> &'static (Mutex<bool>, Condvar) {
    STARTUP_SYNC_WAIT.get_or_init(|| (Mutex::new(false), Condvar::new()))
}

fn mark_startup_sync_done() {
    STARTUP_SYNC_DONE.store(true, Ordering::SeqCst);
    let (lock, cvar) = startup_wait_pair();
    if let Ok(mut done) = lock.lock() {
        *done = true;
        cvar.notify_all();
    }
}

fn wait_for_startup_sync_briefly() {
    if STARTUP_SYNC_DONE.load(Ordering::SeqCst) {
        return;
    }
    let (lock, cvar) = startup_wait_pair();
    if let Ok(guard) = lock.lock() {
        if !*guard {
            let _ = cvar.wait_timeout(guard, Duration::from_millis(350));
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct StoreProCachePayload {
    cached_store_pro_active: bool,
    checked_at_unix: u64,
    package_family: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProtectedStoreProCacheFile {
    version: u32,
    blob: String,
}

fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn current_package_family() -> String {
    #[cfg(windows)]
    unsafe {
        use windows::core::PWSTR;
        use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
        use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFamilyName;

        let mut length: u32 = 0;
        let err = GetCurrentPackageFamilyName(&mut length, PWSTR::null());
        if err == ERROR_INSUFFICIENT_BUFFER && length > 0 {
            let mut buf = vec![0u16; length as usize];
            if GetCurrentPackageFamilyName(&mut length, PWSTR(buf.as_mut_ptr())) == ERROR_SUCCESS {
                let s = String::from_utf16_lossy(&buf)
                    .trim_end_matches('\0')
                    .to_string();
                if !s.is_empty() {
                    return s;
                }
            }
        }
    }
    "unpackaged".to_string()
}

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;
    use windows::Win32::Foundation::{LocalFree, BOOL, HLOCAL};

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[repr(C)]
    struct CryptIntegerBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            p_data_in: *const CryptIntegerBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const CryptIntegerBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut CryptIntegerBlob,
        ) -> BOOL;

        fn CryptUnprotectData(
            p_data_in: *const CryptIntegerBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const CryptIntegerBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut CryptIntegerBlob,
        ) -> BOOL;
    }

    pub fn protect(plaintext: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let data_in = CryptIntegerBlob {
            cb_data: u32::try_from(plaintext.len()).map_err(|_| "Payload too large".to_string())?,
            pb_data: plaintext.as_ptr() as *mut u8,
        };
        let entropy_blob = CryptIntegerBlob {
            cb_data: entropy.len() as u32,
            pb_data: entropy.as_ptr() as *mut u8,
        };
        let mut data_out = CryptIntegerBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };

        let ok = unsafe {
            CryptProtectData(
                &data_in,
                std::ptr::null(),
                &entropy_blob,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut data_out,
            )
        };
        if !ok.as_bool() || data_out.pb_data.is_null() {
            return Err("CryptProtectData failed".to_string());
        }
        let slice = unsafe { std::slice::from_raw_parts(data_out.pb_data, data_out.cb_data as usize) };
        let result = slice.to_vec();
        unsafe {
            let _ = LocalFree(HLOCAL(data_out.pb_data as *mut c_void));
        }
        Ok(result)
    }

    pub fn unprotect(ciphertext: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let data_in = CryptIntegerBlob {
            cb_data: u32::try_from(ciphertext.len()).map_err(|_| "Ciphertext too large".to_string())?,
            pb_data: ciphertext.as_ptr() as *mut u8,
        };
        let entropy_blob = CryptIntegerBlob {
            cb_data: entropy.len() as u32,
            pb_data: entropy.as_ptr() as *mut u8,
        };
        let mut data_out = CryptIntegerBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };

        let ok = unsafe {
            CryptUnprotectData(
                &data_in,
                std::ptr::null_mut(),
                &entropy_blob,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut data_out,
            )
        };
        if !ok.as_bool() || data_out.pb_data.is_null() {
            return Err("CryptUnprotectData failed".to_string());
        }
        let slice = unsafe { std::slice::from_raw_parts(data_out.pb_data, data_out.cb_data as usize) };
        let result = slice.to_vec();
        unsafe {
            let _ = LocalFree(HLOCAL(data_out.pb_data as *mut c_void));
        }
        Ok(result)
    }
}

fn store_pro_cache_path() -> Option<std::path::PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(|base| std::path::PathBuf::from(base).join("Gili").join("store_pro_cache.json"))
}

fn is_cache_within_grace(checked_at_unix: u64, now_unix: u64) -> bool {
    if checked_at_unix == 0 || now_unix == 0 {
        return false;
    }
    if checked_at_unix > now_unix.saturating_add(CLOCK_SKEW_TOLERANCE_SECS) {
        return false;
    }
    now_unix.saturating_sub(checked_at_unix) <= OFFLINE_GRACE_SECS
}

fn seal_cache_json(payload: &StoreProCachePayload) -> Result<String, String> {
    #[cfg(windows)]
    {
        use base64::Engine;
        let json = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
        let encrypted = dpapi::protect(&json, DPAPI_ENTROPY)?;
        let wrapper = ProtectedStoreProCacheFile {
            version: CACHE_FILE_VERSION,
            blob: base64::engine::general_purpose::STANDARD.encode(encrypted),
        };
        serde_json::to_string(&wrapper).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        Err("DPAPI cache unavailable on non-Windows".to_string())
    }
}

fn unseal_and_validate_cache_json(
    raw: &str,
    expected_family: &str,
    now_unix: u64,
) -> Option<StoreProCachePayload> {
    #[cfg(windows)]
    {
        use base64::Engine;
        let wrapper = serde_json::from_str::<ProtectedStoreProCacheFile>(raw).ok()?;
        if wrapper.version != CACHE_FILE_VERSION || wrapper.blob.is_empty() {
            return None;
        }
        let ciphertext = base64::engine::general_purpose::STANDARD
            .decode(wrapper.blob.trim())
            .ok()?;
        let plaintext = dpapi::unprotect(&ciphertext, DPAPI_ENTROPY).ok()?;
        let payload = serde_json::from_slice::<StoreProCachePayload>(&plaintext).ok()?;
        if payload.package_family != expected_family {
            return None;
        }
        if !is_cache_within_grace(payload.checked_at_unix, now_unix) {
            return None;
        }
        Some(payload)
    }
    #[cfg(not(windows))]
    {
        let _ = (raw, expected_family, now_unix);
        None
    }
}

fn write_file_clearing_readonly(path: &std::path::Path, content: &str) {
    if std::fs::write(path, content).is_ok() {
        return;
    }
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
    if std::fs::write(path, content).is_err() {
        let _ = std::fs::remove_file(path);
    }
}

fn write_cached_license_to_disk(active: bool) {
    let now_unix = if active { current_unix_secs() } else { 0 };
    CACHED_CHECKED_AT_UNIX.store(now_unix, Ordering::SeqCst);

    let Some(path) = store_pro_cache_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if !active {
        // Removing or rewriting inactive cache avoids retaining a stale read-only active token.
        let payload = StoreProCachePayload {
            cached_store_pro_active: false,
            checked_at_unix: current_unix_secs(),
            package_family: current_package_family(),
        };
        if let Ok(sealed) = seal_cache_json(&payload) {
            write_file_clearing_readonly(&path, &sealed);
        } else {
            let _ = std::fs::remove_file(&path);
        }
        return;
    }

    let payload = StoreProCachePayload {
        cached_store_pro_active: true,
        checked_at_unix: now_unix,
        package_family: current_package_family(),
    };
    if let Ok(sealed) = seal_cache_json(&payload) {
        write_file_clearing_readonly(&path, &sealed);
    }
}

pub fn init_cached_license_from_disk() {
    if !is_packaged_msix() {
        return;
    }
    let Some(path) = store_pro_cache_path() else {
        return;
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return;
    };
    let family = current_package_family();
    let now_unix = current_unix_secs();
    if let Some(payload) = unseal_and_validate_cache_json(&raw, &family, now_unix) {
        if payload.cached_store_pro_active {
            CACHED_CHECKED_AT_UNIX.store(payload.checked_at_unix, Ordering::SeqCst);
            STORE_PRO_ACTIVE.store(true, Ordering::SeqCst);
        } else {
            CACHED_CHECKED_AT_UNIX.store(0, Ordering::SeqCst);
            STORE_PRO_ACTIVE.store(false, Ordering::SeqCst);
        }
    } else {
        // Fail closed on plaintext, forged, tampered, or expired caches.
        CACHED_CHECKED_AT_UNIX.store(0, Ordering::SeqCst);
        STORE_PRO_ACTIVE.store(false, Ordering::SeqCst);
        let _ = std::fs::remove_file(&path);
    }
}

/// Checks whether the current Windows process runs with an MSIX/AppX package identity.
/// Classic NSIS `.exe` installs return `APPMODEL_ERROR_NO_PACKAGE` and remain free by policy.
pub fn is_packaged_msix() -> bool {
    *PACKAGED_MSIX.get_or_init(|| {
        #[cfg(windows)]
        unsafe {
            use windows::core::PWSTR;
            use windows::Win32::Foundation::{
                APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER,
            };
            use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

            let mut length: u32 = 0;
            let err = GetCurrentPackageFullName(&mut length, PWSTR::null());
            if err == ERROR_INSUFFICIENT_BUFFER {
                return true;
            }
            if err == APPMODEL_ERROR_NO_PACKAGE {
                return false;
            }
            false
        }
        #[cfg(not(windows))]
        {
            false
        }
    })
}

pub fn can_use_taskbar() -> bool {
    if !is_packaged_msix() {
        return true;
    }
    STORE_PRO_ACTIVE.load(Ordering::SeqCst)
}

pub fn can_use_pro_bundle() -> bool {
    can_use_taskbar()
}

pub fn current_status_snapshot() -> TaskbarProStatus {
    let packaged = is_packaged_msix();
    if !packaged {
        return TaskbarProStatus {
            is_packaged_msix: false,
            has_pro: true,
            is_locked: false,
            source: "nsis_free".to_string(),
            offer_token: TASKBAR_PRO_PRODUCT_ID.to_string(),
            store_id: None,
            product_title: None,
            formatted_price: None,
            checking: false,
            last_error: None,
        };
    }

    let has_pro = STORE_PRO_ACTIVE.load(Ordering::SeqCst);
    let checking = !STARTUP_SYNC_DONE.load(Ordering::SeqCst);
    let meta = meta_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();

    TaskbarProStatus {
        is_packaged_msix: true,
        has_pro,
        is_locked: !has_pro,
        source: if has_pro {
            "ms_store_active".to_string()
        } else {
            "ms_store_locked".to_string()
        },
        offer_token: TASKBAR_PRO_PRODUCT_ID.to_string(),
        store_id: meta.store_id,
        product_title: meta.product_title,
        formatted_price: meta.formatted_price,
        checking,
        last_error: meta.last_error,
    }
}

fn emit_status_changed(app: &AppHandle) {
    let _ = app.emit("taskbar-pro-status-changed", current_status_snapshot());
}

fn matches_taskbar_pro_token(candidate: &str) -> bool {
    candidate.trim().eq_ignore_ascii_case(TASKBAR_PRO_PRODUCT_ID)
}

#[cfg(windows)]
struct RoGuard(bool);

#[cfg(windows)]
impl Drop for RoGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { windows::Win32::System::WinRT::RoUninitialize() };
        }
    }
}

#[cfg(windows)]
fn enter_winrt_mta() -> RoGuard {
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    let ro_ok = unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() };
    RoGuard(ro_ok)
}

#[cfg(windows)]
fn query_license_active_blocking() -> Result<bool, String> {
    use windows::Services::Store::StoreContext;

    let _ro_guard = enter_winrt_mta();
    let ctx = StoreContext::GetDefault().map_err(|e| format!("StoreContext::GetDefault: {e}"))?;
    let app_license = ctx
        .GetAppLicenseAsync()
        .and_then(|op| op.get())
        .map_err(|e| format!("GetAppLicenseAsync: {e}"))?;

    if let Ok(addons) = app_license.AddOnLicenses() {
        for pair in &addons {
            let Ok(license) = pair.Value() else {
                continue;
            };
            let offer_match = license
                .InAppOfferToken()
                .map(|t| matches_taskbar_pro_token(&t.to_string()))
                .unwrap_or(false);
            let is_active = license.IsActive().unwrap_or(false);
            if offer_match && is_active {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[cfg(not(windows))]
fn query_license_active_blocking() -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
fn query_product_meta_blocking() -> StoreProductMeta {
    use windows::core::HSTRING;
    use windows::Foundation::Collections::IIterable;
    use windows::Services::Store::StoreContext;

    let _ro_guard = enter_winrt_mta();
    let mut meta = StoreProductMeta::default();
    let Ok(ctx) = StoreContext::GetDefault() else {
        return meta;
    };

    let mut matched_product = None;

    if let Ok(tokens) = IIterable::<HSTRING>::try_from(vec![HSTRING::from(TASKBAR_PRO_PRODUCT_ID)]) {
        if let Ok(op) = ctx.GetAssociatedStoreProductsByInAppOfferTokenAsync(&tokens) {
            if let Ok(query) = op.get() {
                if let Ok(products) = query.Products() {
                    for pair in &products {
                        if let Ok(product) = pair.Value() {
                            let offer = product
                                .InAppOfferToken()
                                .map(|s| s.to_string())
                                .unwrap_or_default();
                            if matches_taskbar_pro_token(&offer) {
                                matched_product = Some(product);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    if matched_product.is_none() {
        if let Ok(kinds) = IIterable::<HSTRING>::try_from(vec![HSTRING::from("Durable")]) {
            if let Ok(op) = ctx.GetAssociatedStoreProductsAsync(&kinds) {
                if let Ok(query) = op.get() {
                    if let Ok(products) = query.Products() {
                        for pair in &products {
                            if let Ok(product) = pair.Value() {
                                let offer = product
                                    .InAppOfferToken()
                                    .map(|s| s.to_string())
                                    .unwrap_or_default();
                                if matches_taskbar_pro_token(&offer) {
                                    matched_product = Some(product);
                                    break;
                                }
                            }
                        }
                    }
                    if matched_product.is_none() {
                        if let Ok(ext) = query.ExtendedError() {
                            if ext.is_err() {
                                meta.last_error =
                                    Some(format!("Catalog ExtendedError: 0x{:08X}", ext.0 as u32));
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(product) = matched_product {
        meta.store_id = product
            .StoreId()
            .ok()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        meta.product_title = product
            .Title()
            .ok()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        meta.formatted_price = product
            .Price()
            .ok()
            .and_then(|p| p.FormattedPrice().ok())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
    }

    meta
}

#[cfg(not(windows))]
fn query_product_meta_blocking() -> StoreProductMeta {
    StoreProductMeta::default()
}

fn apply_license_result(lic_res: &Result<bool, String>) {
    match lic_res {
        Ok(has_pro) => {
            STORE_PRO_ACTIVE.store(*has_pro, Ordering::SeqCst);
            write_cached_license_to_disk(*has_pro);
            if let Ok(mut guard) = meta_store().lock() {
                guard.last_error = None;
            }
        }
        Err(err) => {
            let checked_at = CACHED_CHECKED_AT_UNIX.load(Ordering::SeqCst);
            if !is_cache_within_grace(checked_at, current_unix_secs()) {
                STORE_PRO_ACTIVE.store(false, Ordering::SeqCst);
                write_cached_license_to_disk(false);
            }
            if let Ok(mut guard) = meta_store().lock() {
                guard.last_error = Some(err.clone());
            }
        }
    }
}

fn apply_product_meta(meta: StoreProductMeta) -> bool {
    let Ok(mut guard) = meta_store().lock() else {
        return false;
    };
    let last_error = if guard.last_error.is_some() {
        guard.last_error.clone()
    } else {
        meta.last_error
    };
    let updated = StoreProductMeta {
        store_id: meta.store_id,
        product_title: meta.product_title,
        formatted_price: meta.formatted_price,
        last_error,
    };
    let changed = guard.store_id != updated.store_id
        || guard.product_title != updated.product_title
        || guard.formatted_price != updated.formatted_price
        || guard.last_error != updated.last_error;
    *guard = updated;
    changed
}

fn parse_disk_navbar_flags_json(raw: &str) -> (bool, bool) {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(raw) else {
        return (false, false);
    };
    let default_off_migrated = parsed
        .get("opt_navbar_default_off_v5")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !default_off_migrated {
        return (false, false);
    }
    let Some(navbar_cfg) = parsed.get("opt_navbar_config") else {
        return (false, false);
    };
    let enabled = navbar_cfg
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let hide_taskbar = navbar_cfg
        .get("hideWindowsTaskbar")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    (enabled, hide_taskbar)
}

pub fn read_disk_navbar_flags() -> (bool, bool) {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return (false, false);
    };
    let settings_path = std::path::PathBuf::from(appdata)
        .join("com.faiz.notch")
        .join("settings.json");
    let Ok(raw) = std::fs::read_to_string(&settings_path) else {
        return (false, false);
    };
    parse_disk_navbar_flags_json(&raw)
}

fn reconcile_taskbar_after_license_check(app: &AppHandle) {
    if can_use_taskbar() {
        crate::taskbar_safety::init_taskbar_switches_from_disk();
        let (enabled, hide_taskbar) = read_disk_navbar_flags();
        if enabled {
            crate::navbar_window::show_or_create_navbar_window(app);
            if hide_taskbar {
                crate::taskbar_manager::set_taskbar_visible(false);
            }
        }
    } else {
        crate::taskbar_manager::set_taskbar_visible(true);
        crate::navbar_window::hide_navbar_window(app);
        crate::taskbar_safety::init_taskbar_switches_from_disk();
    }
}

fn reconcile_pro_bundle_after_license_check(app: &AppHandle) {
    reconcile_taskbar_after_license_check(app);
    crate::standby_window::reconcile_pro_entitlement(app);
    crate::desktop_widgets_bridge::reconcile_pro_entitlement();
}

/// Starts non-blocking license resolution on MSIX builds and reconciles persisted dock state once resolved.
pub fn start_startup_license_sync(app: AppHandle) {
    if !is_packaged_msix() {
        mark_startup_sync_done();
        return;
    }

    std::thread::spawn(move || {
        let was_entitled = can_use_taskbar();
        let lic_res = query_license_active_blocking();
        apply_license_result(&lic_res);
        mark_startup_sync_done();

        let is_entitled = can_use_taskbar();
        if !is_entitled || !was_entitled {
            reconcile_pro_bundle_after_license_check(&app);
        }
        emit_status_changed(&app);

        let meta = query_product_meta_blocking();
        if apply_product_meta(meta) {
            emit_status_changed(&app);
        }
    });
}

fn refresh_blocking(app: &AppHandle) -> TaskbarProStatus {
    if !is_packaged_msix() {
        mark_startup_sync_done();
        return current_status_snapshot();
    }

    let lic_res = query_license_active_blocking();
    apply_license_result(&lic_res);
    let meta = query_product_meta_blocking();
    let _ = apply_product_meta(meta);
    mark_startup_sync_done();

    reconcile_pro_bundle_after_license_check(app);

    emit_status_changed(app);
    current_status_snapshot()
}

#[cfg(windows)]
fn resolve_owner_hwnd_raw(app: &AppHandle) -> Option<isize> {
    for label in ["settings", "main"] {
        if let Some(win) = app.get_webview_window(label) {
            if let Ok(raw) = win.hwnd() {
                if !raw.0.is_null() {
                    return Some(raw.0 as isize);
                }
            }
        }
    }
    None
}

#[cfg(windows)]
async fn trigger_store_purchase(
    app: &AppHandle,
    store_id: Option<String>,
) -> Result<(windows::Services::Store::StorePurchaseStatus, Option<i32>), String> {
    use std::sync::{mpsc, Arc, Mutex as StdMutex};
    use windows::core::{Interface, HSTRING};
    use windows::Foundation::{AsyncOperationCompletedHandler, AsyncStatus, IAsyncOperation};
    use windows::Services::Store::{StoreContext, StorePurchaseResult, StorePurchaseStatus};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::IInitializeWithWindow;

    let Some(hwnd_raw) = resolve_owner_hwnd_raw(app) else {
        return Err("No active window handle found for purchase dialog.".to_string());
    };

    let (tx, rx) = mpsc::sync_channel::<Result<(StorePurchaseStatus, Option<i32>), String>>(1);
    let tx_slot: Arc<StdMutex<Option<mpsc::SyncSender<_>>>> = Arc::new(StdMutex::new(Some(tx)));
    let tx_dispatch = Arc::clone(&tx_slot);

    let extract_result = |op: &IAsyncOperation<StorePurchaseResult>| -> Result<(StorePurchaseStatus, Option<i32>), String> {
        let res = op
            .GetResults()
            .map_err(|e| format!("StorePurchaseResult error: {e}"))?;
        let status = res
            .Status()
            .map_err(|e| format!("StorePurchaseStatus error: {e}"))?;
        let ext = res
            .ExtendedError()
            .ok()
            .filter(|hr| hr.is_err())
            .map(|hr| hr.0);
        Ok((status, ext))
    };

    let send_once = |slot: &Arc<StdMutex<Option<mpsc::SyncSender<_>>>>,
                     payload: Result<(StorePurchaseStatus, Option<i32>), String>| {
        if let Ok(mut guard) = slot.lock() {
            if let Some(sender) = guard.take() {
                let _ = sender.send(payload);
            }
        }
    };

    app.run_on_main_thread(move || {
        let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
        let init_and_start = || -> Result<IAsyncOperation<StorePurchaseResult>, String> {
            let ctx =
                StoreContext::GetDefault().map_err(|e| format!("StoreContext::GetDefault: {e}"))?;
            let init_win: IInitializeWithWindow = ctx
                .cast()
                .map_err(|e| format!("IInitializeWithWindow cast failed: {e}"))?;
            unsafe {
                init_win
                    .Initialize(hwnd)
                    .map_err(|e| format!("IInitializeWithWindow::Initialize: {e}"))?;
            }

            if let Some(id) = store_id.as_deref().filter(|s| !s.is_empty()) {
                ctx.RequestPurchaseAsync(&HSTRING::from(id))
                    .map_err(|e| format!("RequestPurchaseAsync: {e}"))
            } else {
                ctx.RequestPurchaseByInAppOfferTokenAsync(&HSTRING::from(TASKBAR_PRO_PRODUCT_ID))
                    .map_err(|e| format!("RequestPurchaseByInAppOfferTokenAsync: {e}"))
            }
        };

        match init_and_start() {
            Ok(op) => {
                let already_finished = op
                    .Status()
                    .map(|s| s != AsyncStatus::Started)
                    .unwrap_or(false);
                if already_finished {
                    send_once(&tx_dispatch, extract_result(&op));
                    return;
                }

                let tx_cb = Arc::clone(&tx_dispatch);
                let handler = AsyncOperationCompletedHandler::new(move |sender, _status| {
                    let payload = match sender {
                        Some(async_op) => extract_result(async_op),
                        None => Err("Store purchase operation returned empty sender.".to_string()),
                    };
                    send_once(&tx_cb, payload);
                    Ok(())
                });

                if let Err(e) = op.SetCompleted(&handler) {
                    send_once(&tx_dispatch, Err(format!("SetCompleted failed: {e}")));
                }
            }
            Err(err) => send_once(&tx_dispatch, Err(err)),
        }
    })
    .map_err(|e| format!("Failed to dispatch purchase onto main thread: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        rx.recv()
            .map_err(|_| "Purchase dialog channel closed unexpectedly.".to_string())
    })
    .await
    .map_err(|e| format!("Purchase task join failed: {e}"))??
}

#[tauri::command]
pub async fn get_taskbar_pro_status() -> TaskbarProStatus {
    if is_packaged_msix() && !STARTUP_SYNC_DONE.load(Ordering::SeqCst) {
        let _ = tauri::async_runtime::spawn_blocking(wait_for_startup_sync_briefly).await;
    }
    current_status_snapshot()
}

#[tauri::command]
pub async fn refresh_taskbar_pro_license(app: AppHandle) -> TaskbarProStatus {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || refresh_blocking(&app_clone))
        .await
        .unwrap_or_else(|_| current_status_snapshot())
}

#[tauri::command]
pub async fn purchase_taskbar_pro(app: AppHandle) -> TaskbarProPurchaseOutcome {
    if !is_packaged_msix() {
        return TaskbarProPurchaseOutcome {
            status: "not_required".to_string(),
            message: "Versi non-Store sudah terbuka gratis.".to_string(),
            license_status: current_status_snapshot(),
        };
    }

    let app_for_refresh = app.clone();
    let refreshed = tauri::async_runtime::spawn_blocking(move || refresh_blocking(&app_for_refresh))
        .await
        .unwrap_or_else(|_| current_status_snapshot());

    if refreshed.has_pro {
        return TaskbarProPurchaseOutcome {
            status: "already_purchased".to_string(),
            message: "Lisensi Gili Pro sudah aktif pada akun Microsoft Store ini.".to_string(),
            license_status: refreshed,
        };
    }

    #[cfg(windows)]
    {
        use windows::Services::Store::StorePurchaseStatus;

        match trigger_store_purchase(&app, refreshed.store_id.clone()).await {
            Ok((StorePurchaseStatus::Succeeded, _)) => {
                let app_post = app.clone();
                let mut final_status =
                    tauri::async_runtime::spawn_blocking(move || refresh_blocking(&app_post))
                        .await
                        .unwrap_or_else(|_| current_status_snapshot());
                if !final_status.has_pro {
                    STORE_PRO_ACTIVE.store(true, Ordering::SeqCst);
                    write_cached_license_to_disk(true);
                    reconcile_pro_bundle_after_license_check(&app);
                    emit_status_changed(&app);
                    final_status = current_status_snapshot();
                }
                TaskbarProPurchaseOutcome {
                    status: "succeeded".to_string(),
                    message: "Gili Pro berhasil diaktifkan.".to_string(),
                    license_status: final_status,
                }
            }
            Ok((StorePurchaseStatus::AlreadyPurchased, _)) => {
                let app_post = app.clone();
                let mut final_status =
                    tauri::async_runtime::spawn_blocking(move || refresh_blocking(&app_post))
                        .await
                        .unwrap_or_else(|_| current_status_snapshot());
                if !final_status.has_pro {
                    STORE_PRO_ACTIVE.store(true, Ordering::SeqCst);
                    write_cached_license_to_disk(true);
                    reconcile_pro_bundle_after_license_check(&app);
                    emit_status_changed(&app);
                    final_status = current_status_snapshot();
                }
                TaskbarProPurchaseOutcome {
                    status: "already_purchased".to_string(),
                    message: "Add-on Gili Pro sudah dimiliki akun Microsoft Anda.".to_string(),
                    license_status: final_status,
                }
            }
            Ok((StorePurchaseStatus::NotPurchased, ext)) => TaskbarProPurchaseOutcome {
                status: "cancelled".to_string(),
                message: match ext {
                    Some(code) => {
                        format!("Pembelian dibatalkan (0x{:08X}).", code as u32)
                    }
                    None => "Pembelian dibatalkan.".to_string(),
                },
                license_status: current_status_snapshot(),
            },
            Ok((StorePurchaseStatus::NetworkError, ext)) => TaskbarProPurchaseOutcome {
                status: "error".to_string(),
                message: match ext {
                    Some(code) => format!(
                        "Gagal terhubung ke Microsoft Store (0x{:08X}). Periksa koneksi internet Anda.",
                        code as u32
                    ),
                    None => "Gagal terhubung ke Microsoft Store. Periksa koneksi internet Anda."
                        .to_string(),
                },
                license_status: current_status_snapshot(),
            },
            Ok((StorePurchaseStatus::ServerError, ext)) | Ok((_, ext)) => {
                TaskbarProPurchaseOutcome {
                    status: "error".to_string(),
                    message: match ext {
                        Some(code) => format!(
                            "Microsoft Store mengalami gangguan atau add-on belum terpublikasi (0x{:08X}).",
                            code as u32
                        ),
                        None => "Microsoft Store mengalami gangguan atau add-on belum tersedia."
                            .to_string(),
                    },
                    license_status: current_status_snapshot(),
                }
            }
            Err(err) => TaskbarProPurchaseOutcome {
                status: "error".to_string(),
                message: err,
                license_status: current_status_snapshot(),
            },
        }
    }

    #[cfg(not(windows))]
    {
        TaskbarProPurchaseOutcome {
            status: "error".to_string(),
            message: "Microsoft Store IAP hanya didukung di Windows.".to_string(),
            license_status: current_status_snapshot(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_taskbar_pro_token() {
        assert!(matches_taskbar_pro_token("gili_taskbar_pro"));
        assert!(matches_taskbar_pro_token("  GILI_TASKBAR_PRO\n"));
        assert!(!matches_taskbar_pro_token("gili_pro"));
        assert!(!matches_taskbar_pro_token("gili_taskbar_pro_2"));
        assert!(!matches_taskbar_pro_token(""));
    }

    #[test]
    fn test_parse_disk_navbar_flags_json() {
        assert_eq!(parse_disk_navbar_flags_json("not json"), (false, false));
        assert_eq!(
            parse_disk_navbar_flags_json(
                r#"{"opt_navbar_config":{"enabled":true,"hideWindowsTaskbar":true}}"#
            ),
            (false, false)
        );
        assert_eq!(
            parse_disk_navbar_flags_json(
                r#"{"opt_navbar_default_off_v5":false,"opt_navbar_config":{"enabled":true,"hideWindowsTaskbar":true}}"#
            ),
            (false, false)
        );
        assert_eq!(
            parse_disk_navbar_flags_json(r#"{"opt_navbar_default_off_v5":true}"#),
            (false, false)
        );
        assert_eq!(
            parse_disk_navbar_flags_json(
                r#"{"opt_navbar_default_off_v5":true,"opt_navbar_config":{"enabled":true,"hideWindowsTaskbar":false}}"#
            ),
            (true, false)
        );
        assert_eq!(
            parse_disk_navbar_flags_json(
                r#"{"opt_navbar_default_off_v5":true,"opt_navbar_config":{"enabled":true,"hideWindowsTaskbar":true}}"#
            ),
            (true, true)
        );
    }

    #[test]
    fn test_store_license_serialization_and_unpackaged_snapshot() {
        let now = 1_763_450_000u64;
        let payload = StoreProCachePayload {
            cached_store_pro_active: true,
            checked_at_unix: now,
            package_family: "TestPkgFamily".to_string(),
        };

        let sealed = seal_cache_json(&payload).unwrap();
        assert!(!sealed.contains("cached_store_pro_active"));
        assert!(unseal_and_validate_cache_json(&sealed, "TestPkgFamily", now + 60).is_some());

        // Plaintext legacy forgery must fail closed.
        assert!(unseal_and_validate_cache_json(
            r#"{"cached_store_pro_active":true}"#,
            "TestPkgFamily",
            now
        )
        .is_none());

        // Wrong package family, expired grace (>7d), and far-future timestamp must fail closed.
        assert!(unseal_and_validate_cache_json(&sealed, "OtherPkg", now + 60).is_none());
        assert!(
            unseal_and_validate_cache_json(&sealed, "TestPkgFamily", now + OFFLINE_GRACE_SECS + 1)
                .is_none()
        );
        assert!(
            unseal_and_validate_cache_json(
                &sealed,
                "TestPkgFamily",
                now.saturating_sub(CLOCK_SKEW_TOLERANCE_SECS + 10)
            )
            .is_none()
        );

        // Test binary runs unpackaged (non-MSIX), so pro bundle entitlement is open.
        if !is_packaged_msix() {
            assert!(can_use_taskbar());
            assert_eq!(can_use_pro_bundle(), can_use_taskbar());
            let snap = current_status_snapshot();
            assert!(!snap.is_packaged_msix);
            assert!(snap.has_pro);
            assert!(!snap.is_locked);
            assert_eq!(snap.source, "nsis_free");
            assert_eq!(snap.offer_token, TASKBAR_PRO_PRODUCT_ID);

            let serialized = serde_json::to_value(&snap).unwrap();
            assert_eq!(serialized.get("isPackagedMsix"), Some(&serde_json::json!(false)));
            assert_eq!(serialized.get("hasPro"), Some(&serde_json::json!(true)));
            assert_eq!(serialized.get("isLocked"), Some(&serde_json::json!(false)));
            assert_eq!(serialized.get("offerToken"), Some(&serde_json::json!("gili_taskbar_pro")));
        }

        let outcome = TaskbarProPurchaseOutcome {
            status: "cancelled".to_string(),
            message: "cancelled".to_string(),
            license_status: TaskbarProStatus {
                is_packaged_msix: true,
                has_pro: false,
                is_locked: true,
                source: "ms_store_locked".to_string(),
                offer_token: TASKBAR_PRO_PRODUCT_ID.to_string(),
                store_id: Some("9NBLGGH".to_string()),
                product_title: Some("Taskbar Pro".to_string()),
                formatted_price: Some("$1.99".to_string()),
                checking: false,
                last_error: None,
            },
        };
        let outcome_json = serde_json::to_value(&outcome).unwrap();
        assert!(outcome_json.get("licenseStatus").is_some());
        assert_eq!(
            outcome_json["licenseStatus"]["formattedPrice"],
            serde_json::json!("$1.99")
        );
    }
}
