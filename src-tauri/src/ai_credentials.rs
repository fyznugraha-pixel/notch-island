use std::ffi::c_void;
use windows::Win32::Foundation::{BOOL, FILETIME};

const CRED_TYPE_GENERIC: u32 = 1;
const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;

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
    fn CredDeleteW(target_name: *const u16, cred_type: u32, flags: u32) -> BOOL;
    fn CredFree(buffer: *mut c_void);
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn target_key(provider: &str) -> String {
    format!("GiliNotch/AiProvider/{}", provider.trim().to_lowercase())
}

#[tauri::command]
pub fn save_secure_ai_key(provider: String, key: String) -> Result<(), String> {
    let clean_key = key.trim();
    if clean_key.is_empty() {
        return delete_secure_ai_key(provider);
    }

    let target = target_key(&provider);
    let mut target_w = to_wide(&target);
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

#[tauri::command]
pub fn get_secure_ai_key(provider: String) -> Result<String, String> {
    let target = target_key(&provider);
    let target_w = to_wide(&target);

    let mut cred_ptr: *mut CREDENTIALW = std::ptr::null_mut();
    let ok = unsafe { CredReadW(target_w.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr) };

    if !ok.as_bool() || cred_ptr.is_null() {
        return Ok(String::new());
    }

    let res = unsafe {
        let cred = &*cred_ptr;
        if cred.credential_blob.is_null() || cred.credential_blob_size == 0 {
            String::new()
        } else {
            let slice = std::slice::from_raw_parts(
                cred.credential_blob,
                cred.credential_blob_size as usize,
            );
            String::from_utf8_lossy(slice).to_string()
        }
    };

    unsafe {
        CredFree(cred_ptr as *mut c_void);
    }

    Ok(res)
}

#[tauri::command]
pub fn delete_secure_ai_key(provider: String) -> Result<(), String> {
    let target = target_key(&provider);
    let target_w = to_wide(&target);
    unsafe {
        let _ = CredDeleteW(target_w.as_ptr(), CRED_TYPE_GENERIC, 0);
    }
    Ok(())
}

