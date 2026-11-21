use super::window_ops::{
    current_last_input_time, destroy_standby_window, enumerate_physical_monitors,
    is_fullscreen_blocking, is_standby_foreground, is_video_or_movie_playing, now_monotonic_ms,
    open_standby_internal, request_smooth_close_standby, select_target_monitor, system_idle_ms,
    STANDBY_LABEL,
};
use super::{
    context_store, get_config_snapshot, in_recent_manual_dismiss_cooldown,
    LAST_DISMISS_INPUT_TIME, LAST_DISMISS_MONOTONIC_MS, OPENED_INPUT_TIME,
    OPENED_MONOTONIC_MS, SECONDARY_USER_DISMISSED, STANDBY_CLOSING, STANDBY_OPEN,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

fn is_escape_pressed() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};
        unsafe { (GetAsyncKeyState(VK_ESCAPE.0 as i32) as u16 & 0x8000) != 0 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub fn should_auto_trigger_idle(
    idle_ms: u64,
    threshold_ms: u64,
    last_input_dw: u32,
    dismiss_input_dw: u32,
    since_dismiss_ms: u64,
) -> bool {
    if idle_ms < threshold_ms {
        return false;
    }
    if dismiss_input_dw != 0 && last_input_dw == dismiss_input_dw && since_dismiss_ms < threshold_ms {
        return false;
    }
    true
}

pub fn start(app: AppHandle) {
    if WATCHER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::Builder::new()
        .name("gili-standby-watcher".into())
        .spawn(move || {
            let mut boot_sec_synced = false;
            let mut was_esc_down = false;
            let mut last_loop_mono = now_monotonic_ms();
            let mut last_wake_mono: u64 = 0;

            loop {
                let cfg = get_config_snapshot();
                let is_open = STANDBY_OPEN.load(Ordering::SeqCst)
                    || app.get_webview_window(STANDBY_LABEL).is_some();

                let sleep_ms = if is_open {
                    let close_on_act = context_store()
                        .lock()
                        .map(|g| g.close_on_activity)
                        .unwrap_or(false);
                    if close_on_act {
                        180
                    } else {
                        120
                    }
                } else if cfg.activation_mode == "off" {
                    2000
                } else {
                    1000
                };

                std::thread::sleep(Duration::from_millis(sleep_ms));

                let now_mono = now_monotonic_ms();
                // Large gap between ticks indicates system sleep/hibernation wake; grant a fresh idle window
                if now_mono.saturating_sub(last_loop_mono) > (sleep_ms + 15_000) {
                    last_wake_mono = now_mono;
                }
                last_loop_mono = now_mono;

                let cfg = get_config_snapshot();
                let is_open = STANDBY_OPEN.load(Ordering::SeqCst)
                    || app.get_webview_window(STANDBY_LABEL).is_some();

                if !crate::store_license::can_use_pro_bundle() {
                    super::deep_eco::exit_deep_eco(&app);
                    if is_open {
                        destroy_standby_window(&app);
                    }
                    was_esc_down = false;
                    continue;
                }

                if is_open {
                    if STANDBY_CLOSING.load(Ordering::SeqCst) {
                        super::deep_eco::exit_deep_eco(&app);
                        continue;
                    }

                    let ctx = context_store()
                        .lock()
                        .map(|g| g.clone())
                        .unwrap_or_default();

                    let elapsed_open =
                        now_monotonic_ms().saturating_sub(OPENED_MONOTONIC_MS.load(Ordering::SeqCst));

                    // Edge-triggered Escape handler when StandBy covers primary or holds focus
                    let esc_down = is_escape_pressed();
                    let esc_edge = esc_down && !was_esc_down;
                    was_esc_down = esc_down;
                    if esc_edge
                        && elapsed_open >= 250
                        && (!ctx.is_secondary_monitor || is_standby_foreground(&app))
                    {
                        if ctx.trigger == "secondary_permanent" {
                            SECONDARY_USER_DISMISSED.store(true, Ordering::SeqCst);
                        }
                        crate::standby_window::note_manual_dismiss_cooldown();
                        request_smooth_close_standby(&app);
                        continue;
                    }

                    // Fail-safe OS input watcher: dismiss idle screensaver even if focus moved
                    if ctx.close_on_activity && elapsed_open >= 900 {
                        let opened_dw = OPENED_INPUT_TIME.load(Ordering::SeqCst);
                        let now_dw = current_last_input_time();
                        if now_dw != opened_dw {
                            request_smooth_close_standby(&app);
                            continue;
                        }
                    }

                    if cfg.activation_mode == "secondary_permanent" && ctx.trigger == "secondary_permanent" {
                        let monitors = enumerate_physical_monitors();
                        if select_target_monitor(&monitors, cfg.target_monitor_id.as_deref(), true)
                            .is_none()
                        {
                            destroy_standby_window(&app);
                            continue;
                        }
                    }

                    let eco_threshold_ms = (cfg.screensaver_eco_minutes.max(1) as u64) * 60_000;
                    let idle_ms_for_eco = if ctx.is_secondary_monitor {
                        system_idle_ms()
                    } else {
                        0
                    };
                    let should_eco = super::deep_eco::should_enter_deep_eco(
                        cfg.screensaver_eco_enabled,
                        true,
                        false,
                        elapsed_open,
                        eco_threshold_ms,
                        ctx.is_secondary_monitor,
                        idle_ms_for_eco,
                    );
                    super::deep_eco::reconcile_deep_eco(&app, should_eco, &cfg);
                    continue;
                }
                super::deep_eco::exit_deep_eco(&app);
                was_esc_down = false;

                if cfg.activation_mode == "secondary_permanent"
                    && !in_recent_manual_dismiss_cooldown()
                    && !SECONDARY_USER_DISMISSED.load(Ordering::SeqCst)
                {
                    let monitors = enumerate_physical_monitors();
                    if select_target_monitor(&monitors, cfg.target_monitor_id.as_deref(), true)
                        .is_some()
                    {
                        if !boot_sec_synced {
                            boot_sec_synced = true;
                            std::thread::sleep(Duration::from_millis(600));
                        }
                        open_standby_internal(&app, "secondary_permanent");
                    }
                    continue;
                }

                if cfg.activation_mode == "auto_idle" {
                    if cfg.pause_during_fullscreen && is_fullscreen_blocking() {
                        continue;
                    }
                    if cfg.pause_during_media_video && is_video_or_movie_playing() {
                        continue;
                    }
                    let threshold_ms = (cfg.idle_minutes.max(1) as u64) * 60_000;
                    if last_wake_mono > 0 && now_mono.saturating_sub(last_wake_mono) < threshold_ms {
                        continue;
                    }
                    let idle_ms = system_idle_ms();
                    let last_dw = current_last_input_time();
                    let dismiss_dw = LAST_DISMISS_INPUT_TIME.load(Ordering::SeqCst);
                    let since_dismiss_ms =
                        now_monotonic_ms().saturating_sub(LAST_DISMISS_MONOTONIC_MS.load(Ordering::SeqCst));

                    if should_auto_trigger_idle(
                        idle_ms,
                        threshold_ms,
                        last_dw,
                        dismiss_dw,
                        since_dismiss_ms,
                    ) {
                        open_standby_internal(&app, "idle");
                    }
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_trigger_idle_blocks_immediate_reopen_after_dismiss() {
        assert!(!should_auto_trigger_idle(299_000, 300_000, 100, 0, 0));
        assert!(should_auto_trigger_idle(300_000, 300_000, 100, 0, 0));
        assert!(!should_auto_trigger_idle(305_000, 300_000, 100, 100, 5_000));
        assert!(should_auto_trigger_idle(305_000, 300_000, 200, 100, 5_000));
        assert!(should_auto_trigger_idle(305_000, 300_000, 100, 100, 300_000));
    }
}
