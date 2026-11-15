use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const TASKBAR_PRO_PRODUCT_ID: &str = "gili_taskbar_pro";

static PACKAGED_MSIX: OnceLock<bool> = OnceLock::new();
static STORE_PRO_ACTIVE: AtomicBool = AtomicBool::new(false);
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
            let _ = cvar.wait_timeout(guard, Duration::from_millis(2500));
        }
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
fn query_store_snapshot_blocking() -> Result<(bool, StoreProductMeta), String> {
    use windows::core::HSTRING;
    use windows::Foundation::Collections::IIterable;
    use windows::Services::Store::StoreContext;
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

    struct RoGuard(bool);
    impl Drop for RoGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { RoUninitialize() };
            }
        }
    }

    let ro_ok = unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() };
    let _ro_guard = RoGuard(ro_ok);

    let ctx = StoreContext::GetDefault().map_err(|e| format!("StoreContext::GetDefault: {e}"))?;
    let mut meta = StoreProductMeta::default();
    let mut active_license = false;

    match ctx.GetAppLicenseAsync().and_then(|op| op.get()) {
        Ok(app_license) => {
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
                        active_license = true;
                        break;
                    }
                }
            }
        }
        Err(e) => {
            meta.last_error = Some(format!("GetAppLicenseAsync: {e}"));
        }
    }

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
                    if matched_product.is_none() && meta.last_error.is_none() {
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

    Ok((active_license, meta))
}

#[cfg(not(windows))]
fn query_store_snapshot_blocking() -> Result<(bool, StoreProductMeta), String> {
    Ok((false, StoreProductMeta::default()))
}

fn apply_store_snapshot(res: Result<(bool, StoreProductMeta), String>) {
    match res {
        Ok((has_pro, meta)) => {
            STORE_PRO_ACTIVE.store(has_pro, Ordering::SeqCst);
            if let Ok(mut guard) = meta_store().lock() {
                *guard = meta;
            }
        }
        Err(err) => {
            if let Ok(mut guard) = meta_store().lock() {
                guard.last_error = Some(err);
            }
        }
    }
}

fn read_disk_navbar_flags() -> (bool, bool) {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return (false, false);
    };
    let settings_path = std::path::PathBuf::from(appdata)
        .join("com.faiz.notch")
        .join("settings.json");
    let Ok(raw) = std::fs::read_to_string(&settings_path) else {
        return (false, false);
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
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

/// Starts non-blocking license resolution on MSIX builds and reconciles persisted dock state once resolved.
pub fn start_startup_license_sync(app: AppHandle) {
    if !is_packaged_msix() {
        mark_startup_sync_done();
        return;
    }

    std::thread::spawn(move || {
        let res = query_store_snapshot_blocking();
        apply_store_snapshot(res);
        mark_startup_sync_done();

        if can_use_taskbar() {
            crate::taskbar_safety::init_taskbar_switches_from_disk();
            let (enabled, hide_taskbar) = read_disk_navbar_flags();
            if enabled {
                crate::navbar_window::show_or_create_navbar_window(&app);
                if hide_taskbar {
                    crate::taskbar_manager::set_taskbar_visible(false);
                }
            }
        } else {
            crate::taskbar_manager::set_taskbar_visible(true);
            crate::navbar_window::hide_navbar_window(&app);
            crate::taskbar_safety::init_taskbar_switches_from_disk();
        }

        emit_status_changed(&app);
    });
}

fn refresh_blocking(app: &AppHandle) -> TaskbarProStatus {
    if !is_packaged_msix() {
        mark_startup_sync_done();
        return current_status_snapshot();
    }

    let res = query_store_snapshot_blocking();
    apply_store_snapshot(res);
    mark_startup_sync_done();

    if !can_use_taskbar() {
        crate::taskbar_manager::set_taskbar_visible(true);
        crate::navbar_window::hide_navbar_window(app);
        crate::taskbar_safety::init_taskbar_switches_from_disk();
    }

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
            message: "Lisensi Taskbar Pro sudah aktif pada akun Microsoft Store ini.".to_string(),
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
                    emit_status_changed(&app);
                    final_status = current_status_snapshot();
                }
                TaskbarProPurchaseOutcome {
                    status: "succeeded".to_string(),
                    message: "Taskbar Pro berhasil diaktifkan.".to_string(),
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
                    emit_status_changed(&app);
                    final_status = current_status_snapshot();
                }
                TaskbarProPurchaseOutcome {
                    status: "already_purchased".to_string(),
                    message: "Add-on Taskbar Pro sudah dimiliki akun Microsoft Anda.".to_string(),
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
