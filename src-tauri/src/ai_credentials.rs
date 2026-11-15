use std::collections::HashMap;
use std::ffi::c_void;
use windows::Win32::Foundation::{BOOL, FILETIME};

const CRED_TYPE_GENERIC: u32 = 1;
const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;
const ERROR_NOT_FOUND: i32 = 1168;
const MODEL_TARGET_PREFIX: &str = "GiliNotch/AiModel/";

#[repr(C)]
struct CREDENTIALW {
    flags: u32,
    cred_type: u32,
    target_name: *mut u16,
    comment: *mut u16,
    last_written: FILETIME,
    credential_blob_size: u32,
    credential_blob: *mut u8,
    persist: u32,
    attribute_count: u32,
    attributes: *mut c_void,
    target_alias: *mut u16,
    user_name: *mut u16,
}

#[link(name = "advapi32")]
extern "system" {
    fn CredWriteW(credential: *const CREDENTIALW, flags: u32) -> BOOL;
    fn CredReadW(
        target_name: *const u16,
        cred_type: u32,
        flags: u32,
        credential: *mut *mut CREDENTIALW,
    ) -> BOOL;
    fn CredEnumerateW(
        filter: *const u16,
        flags: u32,
        count: *mut u32,
        credentials: *mut *mut *mut CREDENTIALW,
    ) -> BOOL;
    fn CredDeleteW(target_name: *const u16, cred_type: u32, flags: u32) -> BOOL;
    fn CredFree(buffer: *mut c_void);
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn target_key(provider: &str) -> String {
    format!("GiliNotch/AiProvider/{}", provider.trim().to_lowercase())
}

fn model_target_key(model_id: &str) -> String {
    format!("{}{}", MODEL_TARGET_PREFIX, model_id.trim())
}

unsafe fn wide_ptr_to_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    let slice = std::slice::from_raw_parts(ptr, len);
    String::from_utf16_lossy(slice)
}

unsafe fn cred_blob_to_string(cred: &CREDENTIALW) -> String {
    if cred.credential_blob.is_null() || cred.credential_blob_size == 0 {
        return String::new();
    }
    let slice = std::slice::from_raw_parts(
        cred.credential_blob,
        cred.credential_blob_size as usize,
    );
    String::from_utf8_lossy(slice).to_string()
}

fn write_target_credential(target: &str, clean_key: &str) -> Result<(), String> {
    let mut target_w = to_wide(target);
    let mut user_w = to_wide("GiliUser");
    let blob_bytes = clean_key.as_bytes();

    let cred = CREDENTIALW {
        flags: 0,
        cred_type: CRED_TYPE_GENERIC,
        target_name: target_w.as_mut_ptr(),
        comment: std::ptr::null_mut(),
        last_written: FILETIME::default(),
        credential_blob_size: blob_bytes.len() as u32,
        credential_blob: blob_bytes.as_ptr() as *mut u8,
        persist: CRED_PERSIST_LOCAL_MACHINE,
        attribute_count: 0,
        attributes: std::ptr::null_mut(),
        target_alias: std::ptr::null_mut(),
        user_name: user_w.as_mut_ptr(),
    };

    let ok = unsafe { CredWriteW(&cred, 0) };
    if ok.as_bool() {
        Ok(())
    } else {
        Err(format!(
            "Failed to save credential in Windows Credential Manager (os error: {})",
            std::io::Error::last_os_error()
        ))
    }
}

fn delete_target_credential(target: &str) -> Result<(), String> {
    let target_w = to_wide(target);
    let ok = unsafe { CredDeleteW(target_w.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok.as_bool() {
        return Ok(());
    }
    let err = std::io::Error::last_os_error();
    if err.raw_os_error() == Some(ERROR_NOT_FOUND) {
        return Ok(());
    }
    Err(format!(
        "Failed to delete credential in Windows Credential Manager (os error: {})",
        err
    ))
}

#[tauri::command]
pub fn save_secure_ai_key(provider: String, key: String) -> Result<(), String> {
    let clean_key = key.trim();
    if clean_key.is_empty() {
        return delete_secure_ai_key(provider);
    }

    let target = target_key(&provider);
    write_target_credential(&target, clean_key)
}

#[tauri::command]
pub fn get_secure_ai_key(provider: String) -> Result<String, String> {
    let target = target_key(&provider);
    let target_w = to_wide(&target);

    let mut cred_ptr: *mut CREDENTIALW = std::ptr::null_mut();
    let ok = unsafe { CredReadW(target_w.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr) };

    if !ok.as_bool() || cred_ptr.is_null() {
        return Ok(String::new());
    }

    let res = unsafe { cred_blob_to_string(&*cred_ptr) };
    unsafe {
        CredFree(cred_ptr as *mut c_void);
    }

    Ok(res)
}

#[tauri::command]
pub fn delete_secure_ai_key(provider: String) -> Result<(), String> {
    let target = target_key(&provider);
    delete_target_credential(&target)
}

#[tauri::command]
pub fn save_secure_ai_model_key(model_id: String, key: String) -> Result<(), String> {
    if model_id.trim().is_empty() {
        return Ok(());
    }
    let clean_key = key.trim();
    if clean_key.is_empty() {
        return delete_secure_ai_model_key(model_id);
    }

    let target = model_target_key(&model_id);
    write_target_credential(&target, clean_key)
}

#[tauri::command]
pub fn get_all_secure_ai_model_keys() -> Result<HashMap<String, String>, String> {
    let filter_w = to_wide(&format!("{}*", MODEL_TARGET_PREFIX));
    let mut count: u32 = 0;
    let mut creds_ptr: *mut *mut CREDENTIALW = std::ptr::null_mut();
    let ok = unsafe { CredEnumerateW(filter_w.as_ptr(), 0, &mut count, &mut creds_ptr) };

    if !ok.as_bool() || creds_ptr.is_null() {
        return Ok(HashMap::new());
    }

    let mut result = HashMap::new();
    unsafe {
        let cred_ptrs = std::slice::from_raw_parts(creds_ptr, count as usize);
        for &ptr in cred_ptrs {
            if ptr.is_null() {
                continue;
            }
            let cred = &*ptr;
            let target_name = wide_ptr_to_string(cred.target_name);
            if let Some(model_id) = target_name.strip_prefix(MODEL_TARGET_PREFIX) {
                let key = cred_blob_to_string(cred);
                if !model_id.is_empty() && !key.is_empty() {
                    result.insert(model_id.to_string(), key);
                }
            }
        }
        // CredEnumerateW allocates a single contiguous block containing all structs, so free only the top pointer.
        CredFree(creds_ptr as *mut c_void);
    }

    Ok(result)
}

#[tauri::command]
pub fn delete_secure_ai_model_key(model_id: String) -> Result<(), String> {
    if model_id.trim().is_empty() {
        return Ok(());
    }
    let target = model_target_key(&model_id);
    delete_target_credential(&target)
}

