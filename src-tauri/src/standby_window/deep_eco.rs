use super::StandbyConfig;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static DEEP_ECO_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn is_deep_eco_active() -> bool {
    DEEP_ECO_ACTIVE.load(Ordering::Acquire)
}

pub fn standby_uses_system_metrics(cfg: &StandbyConfig) -> bool {
    cfg.active_screen == "widgets" && cfg.right_widget == "system"
}

pub fn should_enter_deep_eco(
    enabled: bool,
    is_open: bool,
    is_closing: bool,
    elapsed_open_ms: u64,
    threshold_ms: u64,
    is_secondary_monitor: bool,
    system_idle_ms: u64,
) -> bool {
    if !enabled || !is_open || is_closing || threshold_ms == 0 {
        return false;
    }
    if elapsed_open_ms < threshold_ms {
        return false;
    }
    // On a permanent secondary monitor, wait until the whole PC is idle so the primary display stays responsive
    if is_secondary_monitor {
        return system_idle_ms >= threshold_ms;
    }
    true
}

pub fn reconcile_deep_eco(app: &AppHandle, should_be_active: bool, cfg: &StandbyConfig) {
    let was_active = DEEP_ECO_ACTIVE.load(Ordering::Acquire);
    let suspend_sampler = should_be_active && !standby_uses_system_metrics(cfg);

    if should_be_active == was_active {
        if should_be_active {
            crate::shared_sampler::SharedSampler::global().set_standby_suspended(suspend_sampler);
        }
        return;
    }

    DEEP_ECO_ACTIVE.store(should_be_active, Ordering::SeqCst);
    crate::desktop_widgets_bridge::engine().set_standby_paused(should_be_active);
    crate::shared_sampler::SharedSampler::global().set_standby_suspended(suspend_sampler);
    let _ = app.emit("standby:deep-eco-changed", should_be_active);

    if should_be_active {
        crate::memory_optimizer::schedule_working_set_trim(350);
    }
}

pub fn exit_deep_eco(app: &AppHandle) {
    if !DEEP_ECO_ACTIVE.swap(false, Ordering::SeqCst) {
        return;
    }
    crate::desktop_widgets_bridge::engine().set_standby_paused(false);
    crate::shared_sampler::SharedSampler::global().set_standby_suspended(false);
    let _ = app.emit("standby:deep-eco-changed", false);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_eco_gates_primary_and_secondary_monitors_cleanly() {
        let five_min = 5 * 60_000;

        assert!(!should_enter_deep_eco(false, true, false, five_min + 1, five_min, false, five_min));
        assert!(!should_enter_deep_eco(true, false, false, five_min + 1, five_min, false, five_min));
        assert!(!should_enter_deep_eco(true, true, true, five_min + 1, five_min, false, five_min));
        assert!(!should_enter_deep_eco(true, true, false, five_min - 1, five_min, false, 0));

        // Primary fullscreen StandBy enters Deep Eco once open duration crosses threshold
        assert!(should_enter_deep_eco(true, true, false, five_min, five_min, false, 0));

        // Secondary display StandBy waits for system-wide idle so active primary work is never paused
        assert!(!should_enter_deep_eco(true, true, false, five_min, five_min, true, 10_000));
        assert!(should_enter_deep_eco(true, true, false, five_min, five_min, true, five_min));
    }

    #[test]
    fn standby_system_metrics_detection_matches_visible_widget_only() {
        let mut cfg = StandbyConfig::default();
        assert!(!standby_uses_system_metrics(&cfg));

        cfg.active_screen = "widgets".into();
        cfg.right_widget = "system".into();
        assert!(standby_uses_system_metrics(&cfg));

        cfg.active_screen = "clock".into();
        assert!(!standby_uses_system_metrics(&cfg));
    }
}
