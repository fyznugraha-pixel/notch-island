use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetKeyState, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_BACK, VK_CONTROL, VK_LWIN,
    VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::taskbar_logger::log_taskbar_event;
use crate::taskbar_safety::{
    trigger_emergency_kill_switch, USE_GILI_NOTIF_CAL, USE_GILI_QUICK_SETTINGS,
    USE_GILI_SEARCH, USE_GILI_START, USE_GILI_VOLUME_OUTPUT,
};

static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);
static WIN_KEY_DOWN: AtomicBool = AtomicBool::new(false);
static WIN_KEY_INTERRUPTED: AtomicBool = AtomicBool::new(false);
static HOTKEY_THREAD_STARTED: AtomicBool = AtomicBool::new(false);

const VK_S_CODE: u32 = 0x53;
const VK_A_CODE: u32 = 0x41;
const VK_N_CODE: u32 = 0x4E;
const VK_V_CODE: u32 = 0x56;
const VK_NEUTRAL_UNASSIGNED: u8 = 0xE8;

fn inject_neutral_key() {
    unsafe {
        keybd_event(VK_NEUTRAL_UNASSIGNED, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_NEUTRAL_UNASSIGNED, 0, KEYEVENTF_KEYUP, 0);
    }
}

unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if n_code < 0 {
        return CallNextHookEx(None, n_code, wparam, lparam);
    }

    let kbd = *(lparam.0 as *const KBDLLHOOKSTRUCT);
    let vk = kbd.vkCode;
    let msg = wparam.0 as u32;
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    // 1. Emergency Kill-Switch: Ctrl + Alt + Shift + Backspace
    if is_down && vk == VK_BACK.0 as u32 {
        let ctrl_down = (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
        let alt_down = (GetKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
        let shift_down = (GetKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;

        if ctrl_down && alt_down && shift_down {
            trigger_emergency_kill_switch(None);
            return LRESULT(1); // Suppress event
        }
    }

    let is_win_key = vk == VK_LWIN.0 as u32 || vk == VK_RWIN.0 as u32;

    if is_win_key {
        if is_down {
            WIN_KEY_DOWN.store(true, Ordering::SeqCst);
            WIN_KEY_INTERRUPTED.store(false, Ordering::SeqCst);
        } else if is_up {
            let was_down = WIN_KEY_DOWN.swap(false, Ordering::SeqCst);
            let interrupted = WIN_KEY_INTERRUPTED.swap(false, Ordering::SeqCst);

            // Solo Win key released without any other key pressed in between
            if was_down && !interrupted {
                if USE_GILI_START.load(Ordering::SeqCst) {
                    inject_neutral_key();
                    crate::taskbar_flyout::open_taskbar_flyout_by_target("start");
                    log_taskbar_event("mulai", "hotkey_trigger", "ok", None);
                    return LRESULT(1); // Suppress native Start menu
                }
            }
        }
    } else if WIN_KEY_DOWN.load(Ordering::SeqCst) {
        // A key is pressed while Win key is held down
        WIN_KEY_INTERRUPTED.store(true, Ordering::SeqCst);

        if is_down {
            let ctrl_down = (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;

            // Win + S (Cari)
            if vk == VK_S_CODE && !ctrl_down {
                if USE_GILI_SEARCH.load(Ordering::SeqCst) {
                    inject_neutral_key();
                    crate::taskbar_flyout::open_taskbar_flyout_by_target("search");
                    log_taskbar_event("cari", "hotkey_trigger", "ok", None);
                    return LRESULT(1);
                }
            }
            // Win + A (Pengaturan Cepat)
            else if vk == VK_A_CODE && !ctrl_down {
                if USE_GILI_QUICK_SETTINGS.load(Ordering::SeqCst) {
                    inject_neutral_key();
                    crate::taskbar_flyout::open_taskbar_flyout_by_target("quickSettings");
                    log_taskbar_event("pengaturan_cepat", "hotkey_trigger", "ok", None);
                    return LRESULT(1);
                }
            }
            // Win + N (Notifikasi + Kalender)
            else if vk == VK_N_CODE && !ctrl_down {
                if USE_GILI_NOTIF_CAL.load(Ordering::SeqCst) {
                    inject_neutral_key();
                    crate::taskbar_flyout::open_taskbar_flyout_by_target("notificationsCalendar");
                    log_taskbar_event("notifikasi_kalender", "hotkey_trigger", "ok", None);
                    return LRESULT(1);
                }
            }
            // Win + Ctrl + V (Output Suara / Volume Mixer)
            else if vk == VK_V_CODE && ctrl_down {
                if USE_GILI_VOLUME_OUTPUT.load(Ordering::SeqCst) {
                    inject_neutral_key();
                    crate::taskbar_flyout::open_taskbar_flyout_by_target("volume");
                    log_taskbar_event("output_suara", "hotkey_trigger", "ok", None);
                    return LRESULT(1);
                }
            }
        }
    }

    CallNextHookEx(None, n_code, wparam, lparam)
}

/// Starts the dedicated background OS thread running the WH_KEYBOARD_LL message loop.
pub fn init_taskbar_hotkey_layer() {
    if HOTKEY_THREAD_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::Builder::new()
        .name("gili_taskbar_hotkey_hook".into())
        .spawn(|| {
            unsafe {
                let hook = match SetWindowsHookExW(
                    WH_KEYBOARD_LL,
                    Some(low_level_keyboard_proc),
                    HINSTANCE(std::ptr::null_mut()),
                    0,
                ) {
                    Ok(h) => h,
                    Err(e) => {
                        eprintln!("[Gili Taskbar Hotkey] Failed to set hook: {:?}", e);
                        return;
                    }
                };

                HOOK_HANDLE.store(hook.0 as isize, Ordering::SeqCst);

                let mut msg = MSG::default();
                while GetMessageW(&mut msg, HWND(std::ptr::null_mut()), 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                let _ = UnhookWindowsHookEx(hook);
                HOOK_HANDLE.store(0, Ordering::SeqCst);
            }
        })
        .expect("Failed to spawn taskbar hotkey thread");
}

pub fn cleanup_taskbar_hotkey_layer() {
    let handle = HOOK_HANDLE.swap(0, Ordering::SeqCst);
    if handle != 0 {
        unsafe {
            let _ = UnhookWindowsHookEx(HHOOK(handle as *mut _));
        }
    }
}
