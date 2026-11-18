use std::path::Path;

const MAX_STYLE_FILE_BYTES: usize = 64 * 1024;

#[cfg(windows)]
struct ScopedCom(bool);

#[cfg(windows)]
impl Drop for ScopedCom {
    fn drop(&mut self) {
        if self.0 {
            unsafe {
                windows::Win32::System::Com::CoUninitialize();
            }
        }
    }
}

pub(crate) fn sanitize_style_filename(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'..='\x1f' => '-',
            _ => ch,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    let base = if trimmed.is_empty() {
        "gili-taskbar-style"
    } else {
        trimmed
    };
    if base.to_ascii_lowercase().ends_with(".gilistyle") {
        base.to_string()
    } else if base.to_ascii_lowercase().ends_with(".json") {
        format!("{}.gilistyle", &base[..base.len() - 5])
    } else {
        format!("{base}.gilistyle")
    }
}

pub(crate) fn validate_style_export_content(content: &str) -> Result<(), String> {
    if content.trim().is_empty() {
        return Err("Style content is empty".to_string());
    }
    if content.len() > MAX_STYLE_FILE_BYTES {
        return Err("Style file exceeds 64 KB limit".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn save_navbar_style_file(
    default_name: String,
    content: String,
) -> Result<bool, String> {
    validate_style_export_content(&content)?;
    let safe_name = sanitize_style_filename(&default_name);

    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use windows::core::{w, HSTRING};
            use windows::Win32::System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
                COINIT_APARTMENTTHREADED,
            };
            use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
            use windows::Win32::UI::Shell::{
                FileSaveDialog, IFileSaveDialog, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST,
                SIGDN_FILESYSPATH,
            };

            let com_ok = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
            let _com_guard = ScopedCom(com_ok);

            let picked_path: Result<Option<String>, String> = (|| unsafe {
                let dialog: IFileSaveDialog =
                    CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
                        .map_err(|e| e.to_string())?;
                let mut options = dialog.GetOptions().map_err(|e| e.to_string())?;
                options |= FOS_OVERWRITEPROMPT | FOS_PATHMUSTEXIST;
                let _ = dialog.SetOptions(options);

                let filters = [
                    COMDLG_FILTERSPEC {
                        pszName: w!("Gili Taskbar Style (*.gilistyle)"),
                        pszSpec: w!("*.gilistyle"),
                    },
                    COMDLG_FILTERSPEC {
                        pszName: w!("JSON (*.json)"),
                        pszSpec: w!("*.json"),
                    },
                ];
                let _ = dialog.SetFileTypes(&filters);
                let _ = dialog.SetFileTypeIndex(1);
                let _ = dialog.SetDefaultExtension(w!("gilistyle"));
                let _ = dialog.SetFileName(&HSTRING::from(safe_name));

                if let Err(err) = dialog.Show(None) {
                    if err.code().0 == -2147023673 || err.code().0 == 0x800704C7u32 as i32 {
                        return Ok(None);
                    }
                    return Err(err.to_string());
                }

                let item = dialog.GetResult().map_err(|e| e.to_string())?;
                let raw_path = item
                    .GetDisplayName(SIGDN_FILESYSPATH)
                    .map_err(|e| e.to_string())?;
                let path_str = raw_path.to_string().map_err(|e| e.to_string())?;
                CoTaskMemFree(Some(raw_path.as_ptr() as *const _));
                Ok(Some(path_str))
            })();

            match picked_path? {
                Some(path) => {
                    std::fs::write(Path::new(&path), content.as_bytes())
                        .map_err(|e| format!("Failed to write style file: {e}"))?;
                    Ok(true)
                }
                None => Ok(false),
            }
        }

        #[cfg(not(windows))]
        {
            Err("Native save dialog is only supported on Windows".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_style_filename_prevents_invalid_chars_and_sets_ext() {
        assert_eq!(sanitize_style_filename("Neon Dark"), "Neon Dark.gilistyle");
        assert_eq!(
            sanitize_style_filename("  ../evil:name?.json  "),
            "-evil-name-.gilistyle"
        );
        assert_eq!(
            sanitize_style_filename("bad/path:name*.gilistyle"),
            "bad-path-name-.gilistyle"
        );
        assert_eq!(sanitize_style_filename("..."), "gili-taskbar-style.gilistyle");
    }

    #[test]
    fn test_validate_style_export_content_enforces_bounds() {
        assert!(validate_style_export_content("").is_err());
        assert!(validate_style_export_content("  \n ").is_err());
        let oversized = "a".repeat(MAX_STYLE_FILE_BYTES + 1);
        assert!(validate_style_export_content(&oversized).is_err());
        assert!(validate_style_export_content(r#"{"v":1}"#).is_ok());
    }
}
