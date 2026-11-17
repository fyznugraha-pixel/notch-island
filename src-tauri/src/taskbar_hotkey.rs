use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU8, Ordering};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetAsyncKeyState, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_BACK, VK_CONTROL,
    VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::taskbar_logger::log_taskbar_event;
use crate::taskbar_safety::{
    trigger_emergency_kill_switch, USE_GILI_NOTIF_CAL, USE_GILI_QUICK_SETTINGS,
    USE_GILI_SEARCH, USE_GILI_START, USE_GILI_TRAY, USE_GILI_VOLUME_OUTPUT,
};

static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);
static WIN_KEY_MASK: AtomicU8 = AtomicU8::new(0);
static WIN_KEY_INTERRUPTED: AtomicBool = AtomicBool::new(false);
static HOTKEY_THREAD_STARTED: AtomicBool = AtomicBool::new(false);

const BIT_LWIN: u8 = 1;
const BIT_RWIN: u8 = 2;

const VK_S_CODE: u32 = 0x53;
const VK_A_CODE: u32 = 0x41;
const VK_B_CODE: u32 = 0x42;
const VK_N_CODE: u32 = 0x4E;
const VK_V_CODE: u32 = 0x56;
const VK_NEUTRAL_UNASSIGNED: u8 = 0xE8;

fn inject_neutral_key() {
    unsafe {
        keybd_event(VK_NEUTRAL_UNASSIGNED, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_NEUTRAL_UNASSIGNED, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[inline]
unsafe fn is_vk_physically_down(vk: u16) -> bool {
    (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0
}

#[inline]
unsafe fn is_win_physically_down() -> bool {
    is_vk_physically_down(VK_LWIN.0) || is_vk_physically_down(VK_RWIN.0)
}

fn dispatch_win_start_hotkey() {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(8));
        crate::taskbar_flyout::open_taskbar_flyout_by_target("start");
        log_taskbar_event("mulai", "hotkey_trigger", "ok", None);
    });
}

fn dispatch_hotkey_flyout(target: &'static str, log_window: &'static str) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(10));
        crate::taskbar_flyout::open_taskbar_flyout_by_target(target);
        log_taskbar_event(log_window, "hotkey_trigger", "ok", None);
    });
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct HotkeyState {
    win_key_mask: u8,
    win_key_interrupted: bool,
}

impl HotkeyState {
    fn is_win_down(&self) -> bool {
        self.win_key_mask != 0
    }

    #[cfg(test)]
    fn lwin_down(interrupted: bool) -> Self {
        Self {
            win_key_mask: BIT_LWIN,
            win_key_interrupted: interrupted,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct ModifierState {
    ctrl: bool,
    alt: bool,
    shift: bool,
    win_physically_down: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct HotkeyFlags {
    use_gili_start: bool,
    use_gili_search: bool,
    use_gili_quick_settings: bool,
    use_gili_tray: bool,
    use_gili_notif_cal: bool,
    use_gili_volume_output: bool,
    taskbar_hidden: bool,
}

impl HotkeyFlags {
    fn from_atomics() -> Self {
        Self {
            use_gili_start: USE_GILI_START.load(Ordering::SeqCst),
            use_gili_search: USE_GILI_SEARCH.load(Ordering::SeqCst),
            use_gili_quick_settings: USE_GILI_QUICK_SETTINGS.load(Ordering::SeqCst),
            use_gili_tray: USE_GILI_TRAY.load(Ordering::SeqCst),
            use_gili_notif_cal: USE_GILI_NOTIF_CAL.load(Ordering::SeqCst),
            use_gili_volume_output: USE_GILI_VOLUME_OUTPUT.load(Ordering::SeqCst),
            taskbar_hidden: crate::taskbar_manager::get_windows_taskbar_hidden(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HotkeyAction {
    PassThrough,
    TriggerEmergencyKillSwitch,
    WinKeyDownInjectNeutralDelayed,
    WinSoloStart,
    OpenFlyout {
        target: &'static str,
        log_window: &'static str,
    },
    ToggleGiliTray,
    ToggleNativeTrayOverflow,
}

impl HotkeyAction {
    #[cfg(test)]
    fn suppresses_event(self) -> bool {
        matches!(
            self,
            Self::TriggerEmergencyKillSwitch
                | Self::OpenFlyout { .. }
                | Self::ToggleGiliTray
                | Self::ToggleNativeTrayOverflow
        )
    }
}

fn evaluate_hotkey_event(
    state: &mut HotkeyState,
    vk: u32,
    msg: u32,
    mods: ModifierState,
    flags: HotkeyFlags,
) -> HotkeyAction {
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    // 1. Emergency Kill-Switch: Ctrl + Alt + Shift + Backspace
    if is_down && vk == VK_BACK.0 as u32 && mods.ctrl && mods.alt && mods.shift {
        return HotkeyAction::TriggerEmergencyKillSwitch;
    }

    let is_win_key = vk == VK_LWIN.0 as u32 || vk == VK_RWIN.0 as u32;

    if is_win_key {
        let win_bit = if vk == VK_LWIN.0 as u32 {
            BIT_LWIN
        } else {
            BIT_RWIN
        };
        if is_down {
            let was_down = state.is_win_down();
            state.win_key_mask |= win_bit;
            if !was_down {
                state.win_key_interrupted = false;
                if flags.use_gili_start {
                    return HotkeyAction::WinKeyDownInjectNeutralDelayed;
                }
            }
        } else if is_up {
            let was_down = state.is_win_down();
            state.win_key_mask &= !win_bit;
            if !state.is_win_down() {
                let interrupted = state.win_key_interrupted;
                state.win_key_interrupted = false;

                // Solo Win key released without any other key pressed in between
                if was_down && !interrupted && flags.use_gili_start {
                    return HotkeyAction::WinSoloStart;
                }
            }
        }
    } else if state.is_win_down() {
        if !mods.win_physically_down {
            state.win_key_mask = 0;
            state.win_key_interrupted = false;
            return HotkeyAction::PassThrough;
        }

        if is_down {
            state.win_key_interrupted = true;
            let no_extra_mods = !mods.ctrl && !mods.alt && !mods.shift;

            // Win + S (Cari)
            if vk == VK_S_CODE && no_extra_mods {
                if flags.use_gili_search {
                    return HotkeyAction::OpenFlyout {
                        target: "search",
                        log_window: "cari",
                    };
                }
            }
            // Win + A (Pengaturan Cepat)
            else if vk == VK_A_CODE && no_extra_mods {
                if flags.use_gili_quick_settings {
                    return HotkeyAction::OpenFlyout {
                        target: "quickSettings",
                        log_window: "pengaturan_cepat",
                    };
                }
            }
            // Win + B (Hidden System Tray)
            else if vk == VK_B_CODE && no_extra_mods {
                if flags.use_gili_tray {
                    return HotkeyAction::ToggleGiliTray;
                }
                if flags.taskbar_hidden {
                    return HotkeyAction::ToggleNativeTrayOverflow;
                }
            }
            // Win + N (Notifikasi + Kalender)
            else if vk == VK_N_CODE && no_extra_mods {
                if flags.use_gili_notif_cal {
                    return HotkeyAction::OpenFlyout {
                        target: "notificationsCalendar",
                        log_window: "notifikasi_kalender",
                    };
                }
            }
            // Win + Ctrl + V (Output Suara / Volume Mixer)
            else if vk == VK_V_CODE && mods.ctrl && !mods.alt && !mods.shift {
                if flags.use_gili_volume_output {
                    return HotkeyAction::OpenFlyout {
                        target: "volume",
                        log_window: "output_suara",
                    };
                }
            }
        }
    }

    HotkeyAction::PassThrough
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
    const LLKHF_INJECTED_FLAG: u32 = 0x10;
    if (kbd.flags.0 & LLKHF_INJECTED_FLAG) != 0 {
        return CallNextHookEx(None, n_code, wparam, lparam);
    }

    let vk = kbd.vkCode;
    let msg = wparam.0 as u32;
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_win_key = vk == VK_LWIN.0 as u32 || vk == VK_RWIN.0 as u32;
    let win_mask_now = WIN_KEY_MASK.load(Ordering::SeqCst);
    let win_down_now = win_mask_now != 0;

    if !is_win_key && !win_down_now && !(is_down && vk == VK_BACK.0 as u32) {
        return CallNextHookEx(None, n_code, wparam, lparam);
    }

    let mods = if is_win_key {
        ModifierState::default()
    } else {
        ModifierState {
            ctrl: is_vk_physically_down(VK_CONTROL.0),
            alt: is_vk_physically_down(VK_MENU.0),
            shift: is_vk_physically_down(VK_SHIFT.0),
            win_physically_down: if win_down_now {
                is_win_physically_down()
            } else {
                false
            },
        }
    };

    let flags = HotkeyFlags::from_atomics();
    let mut state = HotkeyState {
        win_key_mask: win_mask_now,
        win_key_interrupted: WIN_KEY_INTERRUPTED.load(Ordering::SeqCst),
    };
    let action = evaluate_hotkey_event(&mut state, vk, msg, mods, flags);
    WIN_KEY_MASK.store(state.win_key_mask, Ordering::SeqCst);
    WIN_KEY_INTERRUPTED.store(state.win_key_interrupted, Ordering::SeqCst);

    match action {
        HotkeyAction::TriggerEmergencyKillSwitch => {
            trigger_emergency_kill_switch(None);
            return LRESULT(1); // Suppress event
        }
        HotkeyAction::WinKeyDownInjectNeutralDelayed => {
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(2));
                inject_neutral_key();
            });
        }
        HotkeyAction::WinSoloStart => {
            // Inject neutral key before forwarding physical Win key-up so Windows suppresses native Start
            // without ever losing the hardware Win release event.
            inject_neutral_key();
            dispatch_win_start_hotkey();
        }
        HotkeyAction::OpenFlyout { target, log_window } => {
            inject_neutral_key();
            dispatch_hotkey_flyout(target, log_window);
            return LRESULT(1);
        }
        HotkeyAction::ToggleGiliTray => {
            inject_neutral_key();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(10));
                crate::taskbar_flyout::toggle_taskbar_flyout_by_target("tray");
                log_taskbar_event("tray_tersembunyi", "hotkey_trigger", "ok", None);
            });
            return LRESULT(1);
        }
        HotkeyAction::ToggleNativeTrayOverflow => {
            inject_neutral_key();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(10));
                crate::windows_tray_overflow::toggle_native_system_tray_overflow(
                    None,
                    1.0,
                    Some("bottom".to_string()),
                );
                log_taskbar_event("tray_tersembunyi", "hotkey_trigger", "ok", None);
            });
            return LRESULT(1);
        }
        HotkeyAction::PassThrough => {}
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::taskbar_safety::{
        get_taskbar_window_switches, set_taskbar_window_switches,
        sync_switches_from_navbar_config_value, TaskbarWindowSwitches, SWITCHES_TEST_LOCK,
    };

    struct SwitchesRestoreGuard {
        switches: TaskbarWindowSwitches,
        genie_enabled: bool,
    }

    impl Drop for SwitchesRestoreGuard {
        fn drop(&mut self) {
            set_taskbar_window_switches(self.switches.clone());
            crate::window_dock_anim::set_genie_animation_enabled(self.genie_enabled);
        }
    }

    #[test]
    fn test_hotkey_switch_synchronization_without_installing_hook() {
        let _lock = SWITCHES_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _restore = SwitchesRestoreGuard {
            switches: get_taskbar_window_switches(),
            genie_enabled: crate::window_dock_anim::is_genie_animation_enabled(),
        };

        assert_eq!(HOOK_HANDLE.load(Ordering::SeqCst), 0);
        assert!(!HOTKEY_THREAD_STARTED.load(Ordering::SeqCst));
        assert_eq!(WIN_KEY_MASK.load(Ordering::SeqCst), 0);
        assert!(!WIN_KEY_INTERRUPTED.load(Ordering::SeqCst));
        cleanup_taskbar_hotkey_layer();
        assert_eq!(HOOK_HANDLE.load(Ordering::SeqCst), 0);

        set_taskbar_window_switches(TaskbarWindowSwitches {
            use_gili_start: false,
            use_gili_search: true,
            use_gili_quick_settings: false,
            use_gili_volume_output: true,
            use_gili_notif_cal: false,
            use_gili_tray: true,
        });

        assert!(!USE_GILI_START.load(Ordering::SeqCst));
        assert!(USE_GILI_SEARCH.load(Ordering::SeqCst));
        assert!(!USE_GILI_QUICK_SETTINGS.load(Ordering::SeqCst));
        assert!(USE_GILI_VOLUME_OUTPUT.load(Ordering::SeqCst));
        assert!(!USE_GILI_NOTIF_CAL.load(Ordering::SeqCst));
        assert!(USE_GILI_TRAY.load(Ordering::SeqCst));

        sync_switches_from_navbar_config_value(&serde_json::json!({
            "enabled": true,
            "useGiliStart": true,
            "useGiliSearch": false,
            "useGiliQuickSettings": true,
            "useGiliVolumeOutput": false,
            "useGiliNotificationsCalendar": true,
            "useGiliTray": false
        }));

        assert!(USE_GILI_START.load(Ordering::SeqCst));
        assert!(!USE_GILI_SEARCH.load(Ordering::SeqCst));
        assert!(USE_GILI_QUICK_SETTINGS.load(Ordering::SeqCst));
        assert!(!USE_GILI_VOLUME_OUTPUT.load(Ordering::SeqCst));
        assert!(USE_GILI_NOTIF_CAL.load(Ordering::SeqCst));
        assert!(!USE_GILI_TRAY.load(Ordering::SeqCst));

        sync_switches_from_navbar_config_value(&serde_json::json!({
            "enabled": false,
            "useGiliStart": true,
            "useGiliSearch": true,
            "useGiliQuickSettings": true,
            "useGiliVolumeOutput": true,
            "useGiliNotificationsCalendar": true,
            "useGiliTray": true
        }));

        assert!(!USE_GILI_START.load(Ordering::SeqCst));
        assert!(!USE_GILI_SEARCH.load(Ordering::SeqCst));
        assert!(!USE_GILI_QUICK_SETTINGS.load(Ordering::SeqCst));
        assert!(!USE_GILI_VOLUME_OUTPUT.load(Ordering::SeqCst));
        assert!(!USE_GILI_NOTIF_CAL.load(Ordering::SeqCst));
        assert!(!USE_GILI_TRAY.load(Ordering::SeqCst));
        assert_eq!(HOOK_HANDLE.load(Ordering::SeqCst), 0);
    }

    fn all_gili_flags(enabled: bool) -> HotkeyFlags {
        HotkeyFlags {
            use_gili_start: enabled,
            use_gili_search: enabled,
            use_gili_quick_settings: enabled,
            use_gili_tray: enabled,
            use_gili_notif_cal: enabled,
            use_gili_volume_output: enabled,
            taskbar_hidden: false,
        }
    }

    #[test]
    fn test_hotkey_resets_stuck_win_key_when_physical_win_is_up() {
        let flags = all_gili_flags(true);
        let mods_win_up = ModifierState {
            ctrl: false,
            alt: false,
            shift: false,
            win_physically_down: false,
        };

        for vk in [VK_N_CODE, VK_A_CODE, VK_S_CODE, VK_B_CODE] {
            let mut state = HotkeyState::lwin_down(true);
            let action = evaluate_hotkey_event(&mut state, vk, WM_KEYDOWN, mods_win_up, flags);
            assert_eq!(action, HotkeyAction::PassThrough);
            assert!(!action.suppresses_event());
            assert!(!state.is_win_down());
            assert!(!state.win_key_interrupted);
        }

        let mut state_up = HotkeyState::lwin_down(false);
        let action_up = evaluate_hotkey_event(&mut state_up, VK_N_CODE, WM_KEYUP, mods_win_up, flags);
        assert_eq!(action_up, HotkeyAction::PassThrough);
        assert!(!state_up.is_win_down());
        assert!(!state_up.win_key_interrupted);
    }

    #[test]
    fn test_hotkey_wm_keyup_while_win_down_does_not_interrupt_solo_start() {
        let flags = all_gili_flags(true);
        let win_held = ModifierState {
            win_physically_down: true,
            ..Default::default()
        };
        let mut state = HotkeyState::default();

        let down = evaluate_hotkey_event(&mut state, VK_LWIN.0 as u32, WM_KEYDOWN, ModifierState::default(), flags);
        assert_eq!(down, HotkeyAction::WinKeyDownInjectNeutralDelayed);
        assert!(state.is_win_down());
        assert!(!state.win_key_interrupted);

        // Prior key's WM_KEYUP / WM_SYSKEYUP arriving while Win is held must not mark interrupted.
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_N_CODE, WM_KEYUP, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(!state.win_key_interrupted);
        assert_eq!(
            evaluate_hotkey_event(&mut state, 0x43, WM_SYSKEYUP, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(!state.win_key_interrupted);

        let up = evaluate_hotkey_event(&mut state, VK_LWIN.0 as u32, WM_KEYUP, ModifierState::default(), flags);
        assert_eq!(up, HotkeyAction::WinSoloStart);
        assert!(!up.suppresses_event());
        assert!(!state.is_win_down());
        assert!(!state.win_key_interrupted);

        // Pressing another key down interrupts solo Win start; repeated Win down keeps interrupted=true.
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_RWIN.0 as u32, WM_KEYDOWN, ModifierState::default(), flags),
            HotkeyAction::WinKeyDownInjectNeutralDelayed
        );
        assert_eq!(
            evaluate_hotkey_event(&mut state, 0x43, WM_KEYDOWN, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(state.win_key_interrupted);
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_RWIN.0 as u32, WM_KEYDOWN, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(state.win_key_interrupted);
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_RWIN.0 as u32, WM_KEYUP, ModifierState::default(), flags),
            HotkeyAction::PassThrough
        );
        assert!(!state.is_win_down());
        assert!(!state.win_key_interrupted);
    }

    #[test]
    fn test_hotkey_win_n_a_b_s_modifiers_and_flags() {
        let win_held = ModifierState {
            win_physically_down: true,
            ..Default::default()
        };

        let cases = [
            (
                VK_N_CODE,
                HotkeyAction::OpenFlyout {
                    target: "notificationsCalendar",
                    log_window: "notifikasi_kalender",
                },
            ),
            (
                VK_A_CODE,
                HotkeyAction::OpenFlyout {
                    target: "quickSettings",
                    log_window: "pengaturan_cepat",
                },
            ),
            (VK_B_CODE, HotkeyAction::ToggleGiliTray),
            (
                VK_S_CODE,
                HotkeyAction::OpenFlyout {
                    target: "search",
                    log_window: "cari",
                },
            ),
        ];

        for (vk, expected) in cases {
            let mut state = HotkeyState::lwin_down(false);
            let action = evaluate_hotkey_event(&mut state, vk, WM_KEYDOWN, win_held, all_gili_flags(true));
            assert_eq!(action, expected);
            assert!(action.suppresses_event());
            assert!(state.win_key_interrupted);

            // Disabled USE_GILI_* flags pass through to OS
            let mut state_disabled = HotkeyState::lwin_down(false);
            let disabled_action = evaluate_hotkey_event(
                &mut state_disabled,
                vk,
                WM_KEYDOWN,
                win_held,
                all_gili_flags(false),
            );
            assert_eq!(disabled_action, HotkeyAction::PassThrough);
            assert!(!disabled_action.suppresses_event());

            // Extra Ctrl, Alt, or Shift blocks Win+N/A/B/S
            for extra in [
                ModifierState { ctrl: true, win_physically_down: true, ..Default::default() },
                ModifierState { alt: true, win_physically_down: true, ..Default::default() },
                ModifierState { shift: true, win_physically_down: true, ..Default::default() },
            ] {
                let mut state_mod = HotkeyState::lwin_down(false);
                assert_eq!(
                    evaluate_hotkey_event(&mut state_mod, vk, WM_KEYDOWN, extra, all_gili_flags(true)),
                    HotkeyAction::PassThrough
                );
            }
        }

        // Win+B falls back to native tray overflow only when taskbar is hidden and USE_GILI_TRAY is false
        let mut state_hidden = HotkeyState::lwin_down(false);
        let mut flags_hidden = all_gili_flags(false);
        flags_hidden.taskbar_hidden = true;
        let hidden_action =
            evaluate_hotkey_event(&mut state_hidden, VK_B_CODE, WM_KEYDOWN, win_held, flags_hidden);
        assert_eq!(hidden_action, HotkeyAction::ToggleNativeTrayOverflow);
        assert!(hidden_action.suppresses_event());

        // Verify HotkeyFlags::from_atomics mirrors USE_GILI_* atomics
        let _lock = SWITCHES_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let _restore = SwitchesRestoreGuard {
            switches: get_taskbar_window_switches(),
            genie_enabled: crate::window_dock_anim::is_genie_animation_enabled(),
        };
        set_taskbar_window_switches(TaskbarWindowSwitches {
            use_gili_start: true,
            use_gili_search: false,
            use_gili_quick_settings: true,
            use_gili_volume_output: true,
            use_gili_notif_cal: false,
            use_gili_tray: true,
        });
        let snap = HotkeyFlags::from_atomics();
        assert!(snap.use_gili_start);
        assert!(!snap.use_gili_search);
        assert!(snap.use_gili_quick_settings);
        assert!(snap.use_gili_volume_output);
        assert!(!snap.use_gili_notif_cal);
        assert!(snap.use_gili_tray);
    }

    #[test]
    fn test_hotkey_win_ctrl_v_requires_ctrl_without_alt_or_shift() {
        let flags_on = all_gili_flags(true);
        let flags_off = all_gili_flags(false);

        let mut state_ok = HotkeyState::lwin_down(false);
        let win_ctrl = ModifierState {
            ctrl: true,
            win_physically_down: true,
            ..Default::default()
        };
        let action = evaluate_hotkey_event(&mut state_ok, VK_V_CODE, WM_KEYDOWN, win_ctrl, flags_on);
        assert_eq!(
            action,
            HotkeyAction::OpenFlyout {
                target: "volume",
                log_window: "output_suara",
            }
        );
        assert!(action.suppresses_event());

        // Disabled USE_GILI_VOLUME_OUTPUT passes through
        let mut state_off = HotkeyState::lwin_down(false);
        assert_eq!(
            evaluate_hotkey_event(&mut state_off, VK_V_CODE, WM_KEYDOWN, win_ctrl, flags_off),
            HotkeyAction::PassThrough
        );

        // Missing Ctrl or holding Alt/Shift passes through
        for invalid_mods in [
            ModifierState { win_physically_down: true, ..Default::default() },
            ModifierState { ctrl: true, alt: true, win_physically_down: true, ..Default::default() },
            ModifierState { ctrl: true, shift: true, win_physically_down: true, ..Default::default() },
        ] {
            let mut st = HotkeyState::lwin_down(false);
            assert_eq!(
                evaluate_hotkey_event(&mut st, VK_V_CODE, WM_KEYDOWN, invalid_mods, flags_on),
                HotkeyAction::PassThrough
            );
        }
    }

    #[test]
    fn test_hotkey_emergency_kill_switch_requires_ctrl_alt_shift_backspace() {
        let flags_off = all_gili_flags(false);
        let all_mods = ModifierState {
            ctrl: true,
            alt: true,
            shift: true,
            win_physically_down: false,
        };

        let mut state = HotkeyState::default();
        let down = evaluate_hotkey_event(&mut state, VK_BACK.0 as u32, WM_KEYDOWN, all_mods, flags_off);
        assert_eq!(down, HotkeyAction::TriggerEmergencyKillSwitch);
        assert!(down.suppresses_event());

        let sys_down = evaluate_hotkey_event(&mut state, VK_BACK.0 as u32, WM_SYSKEYDOWN, all_mods, flags_off);
        assert_eq!(sys_down, HotkeyAction::TriggerEmergencyKillSwitch);

        // Key-up must not trigger kill-switch
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_BACK.0 as u32, WM_KEYUP, all_mods, flags_off),
            HotkeyAction::PassThrough
        );

        // Missing any modifier or pressing a different key must not trigger kill-switch
        for mods in [
            ModifierState { ctrl: true, alt: true, shift: false, win_physically_down: false },
            ModifierState { ctrl: true, alt: false, shift: true, win_physically_down: false },
            ModifierState { ctrl: false, alt: true, shift: true, win_physically_down: false },
        ] {
            let mut st = HotkeyState::default();
            assert_eq!(
                evaluate_hotkey_event(&mut st, VK_BACK.0 as u32, WM_KEYDOWN, mods, flags_off),
                HotkeyAction::PassThrough
            );
        }
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_S_CODE, WM_KEYDOWN, all_mods, flags_off),
            HotkeyAction::PassThrough
        );
    }

    #[test]
    fn test_hotkey_solo_win_respects_use_gili_start() {
        let mut state = HotkeyState::default();
        let flags_off = all_gili_flags(false);
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_LWIN.0 as u32, WM_KEYDOWN, ModifierState::default(), flags_off),
            HotkeyAction::PassThrough
        );
        assert!(state.is_win_down());
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_LWIN.0 as u32, WM_KEYUP, ModifierState::default(), flags_off),
            HotkeyAction::PassThrough
        );
        assert!(!state.is_win_down());
    }

    #[test]
    fn test_hotkey_lwin_and_rwin_held_simultaneously() {
        let flags = all_gili_flags(true);
        let win_held = ModifierState {
            win_physically_down: true,
            ..Default::default()
        };
        let mut state = HotkeyState::default();

        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_LWIN.0 as u32, WM_KEYDOWN, ModifierState::default(), flags),
            HotkeyAction::WinKeyDownInjectNeutralDelayed
        );
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_RWIN.0 as u32, WM_KEYDOWN, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(state.is_win_down());

        // Releasing LWin while RWin remains held must keep Win active and not fire solo Start yet
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_LWIN.0 as u32, WM_KEYUP, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(state.is_win_down());

        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_N_CODE, WM_KEYDOWN, win_held, flags),
            HotkeyAction::OpenFlyout {
                target: "notificationsCalendar",
                log_window: "notifikasi_kalender",
            }
        );
        assert_eq!(
            evaluate_hotkey_event(&mut state, VK_RWIN.0 as u32, WM_KEYUP, ModifierState::default(), flags),
            HotkeyAction::PassThrough
        );
        assert!(!state.is_win_down());

        // Without interrupting key, solo Start fires only after both Win keys release
        let mut solo_state = HotkeyState::default();
        evaluate_hotkey_event(&mut solo_state, VK_LWIN.0 as u32, WM_KEYDOWN, ModifierState::default(), flags);
        evaluate_hotkey_event(&mut solo_state, VK_RWIN.0 as u32, WM_KEYDOWN, win_held, flags);
        assert_eq!(
            evaluate_hotkey_event(&mut solo_state, VK_LWIN.0 as u32, WM_KEYUP, win_held, flags),
            HotkeyAction::PassThrough
        );
        assert!(solo_state.is_win_down());
        assert_eq!(
            evaluate_hotkey_event(&mut solo_state, VK_RWIN.0 as u32, WM_KEYUP, ModifierState::default(), flags),
            HotkeyAction::WinSoloStart
        );
        assert!(!solo_state.is_win_down());
    }
}
