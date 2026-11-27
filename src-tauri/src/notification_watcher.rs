use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::time::{Duration, Instant};

const MAX_SEEN_IDS: usize = 2048;

static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);
static ACCESS_RECHECK_REQUESTED: AtomicBool = AtomicBool::new(false);
static WAKE_EVENT_RAW: AtomicIsize = AtomicIsize::new(0);

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct RealNotifPayload {
    pub app_name: String,
    pub title: String,
    pub body: String,
    pub aumid: String,
}

/// Splits raw `ToastGeneric` text elements into `(title, body)`.
pub(crate) fn assemble_toast_text(lines: &[String]) -> (String, String) {
    let Some(first) = lines.first() else {
        return (String::new(), String::new());
    };
    let title = first.clone();
    let body = lines
        .iter()
        .skip(1)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (title, body)
}

/// Filters out empty non-toast events (badge/tile/silent updates) that have no visible text.
pub(crate) fn is_meaningful_payload(payload: &RealNotifPayload) -> bool {
    !payload.title.trim().is_empty() || !payload.body.trim().is_empty()
}

/// Bounded set of already-seen Windows notification IDs so restarts/evictions stay predictable.
#[derive(Debug, Default)]
pub(crate) struct SeenNotificationTracker {
    ids: HashSet<u32>,
    order: VecDeque<u32>,
}

impl SeenNotificationTracker {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn contains(&self, id: u32) -> bool {
        self.ids.contains(&id)
    }

    pub(crate) fn record_added(&mut self, id: u32) -> bool {
        if !self.ids.insert(id) {
            return false;
        }
        self.order.push_back(id);
        while self.ids.len() > MAX_SEEN_IDS {
            if let Some(oldest) = self.order.pop_front() {
                self.ids.remove(&oldest);
            } else {
                break;
            }
        }
        if self.order.len() > MAX_SEEN_IDS * 2 {
            self.order.retain(|entry| self.ids.contains(entry));
        }
        true
    }

    pub(crate) fn record_removed(&mut self, id: u32) {
        self.ids.remove(&id);
    }

    /// Seeds initial active IDs without removing IDs that arrived concurrently from live events.
    pub(crate) fn seed_ids(&mut self, ids: &HashSet<u32>) {
        for &id in ids {
            let _ = self.record_added(id);
        }
    }

    pub(crate) fn sync_current(&mut self, current_ids: &HashSet<u32>) -> Vec<u32> {
        let mut newly_added = Vec::new();
        for &id in current_ids {
            if self.record_added(id) {
                newly_added.push(id);
            }
        }
        self.ids.retain(|id| current_ids.contains(id));
        self.order.retain(|id| self.ids.contains(id));
        newly_added
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.ids.len()
    }
}

/// Prevents self-triggered `wpndatabase.db-wal` writes from causing a feedback loop in fallback mode.
#[derive(Debug, Default)]
pub(crate) struct FallbackSyncGuard {
    last_sync: Option<Instant>,
    empty_streak: u32,
    suppress_until: Option<Instant>,
}

impl FallbackSyncGuard {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    fn cooldown(&self) -> Duration {
        match self.empty_streak {
            0 => Duration::from_secs(3),
            1 => Duration::from_secs(10),
            _ => Duration::from_secs(30),
        }
    }

    pub(crate) fn remaining_wait(&self, now: Instant) -> Option<Duration> {
        let suppress_rem = self
            .suppress_until
            .filter(|&until| now < until)
            .map(|until| until.duration_since(now));
        let cooldown_rem = self.last_sync.and_then(|prev| {
            let elapsed = now.saturating_duration_since(prev);
            let cd = self.cooldown();
            (elapsed < cd).then(|| cd - elapsed)
        });
        match (suppress_rem, cooldown_rem) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        }
    }

    pub(crate) fn can_sync(&self, now: Instant) -> bool {
        self.remaining_wait(now).is_none()
    }

    pub(crate) fn record_sync(&mut self, now: Instant, found_new: bool) {
        self.last_sync = Some(now);
        self.suppress_until = Some(now + Duration::from_secs(2));
        if found_new {
            self.empty_streak = 0;
        } else {
            self.empty_streak = self.empty_streak.saturating_add(1);
        }
    }
}

/// Starts the single event-driven Windows notification watcher thread.
pub fn start_notification_watcher(app: tauri::AppHandle) {
    if WATCHER_STARTED.swap(true, Ordering::AcqRel) {
        return;
    }
    #[cfg(windows)]
    {
        if std::thread::Builder::new()
            .name("gili-notif-watcher".to_string())
            .spawn(move || {
                win_impl::run_watcher(app);
            })
            .is_err()
        {
            WATCHER_STARTED.store(false, Ordering::Release);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

/// Wakes the notification watcher immediately when the user grants/changes notification access.
pub fn notify_access_changed() {
    ACCESS_RECHECK_REQUESTED.store(true, Ordering::Release);
    #[cfg(windows)]
    {
        let raw = WAKE_EVENT_RAW.load(Ordering::Acquire);
        if raw != 0 {
            use windows::Win32::Foundation::HANDLE;
            use windows::Win32::System::Threading::SetEvent;
            let handle = HANDLE(raw as *mut std::ffi::c_void);
            unsafe {
                let _ = SetEvent(handle);
            }
        }
    }
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::{Arc, Mutex};
    use tauri::Emitter;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::{
        NotificationKinds, UserNotification, UserNotificationChangedEventArgs,
        UserNotificationChangedKind,
    };
    use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT};
    use windows::Win32::Storage::FileSystem::{
        FindCloseChangeNotification, FindFirstChangeNotificationW, FindNextChangeNotification,
        FILE_NOTIFY_CHANGE_LAST_WRITE, FILE_NOTIFY_CHANGE_SIZE,
    };
    use windows::Win32::System::Com::COINIT_MULTITHREADED;
    use windows::Win32::System::Threading::{
        CreateEventW, WaitForMultipleObjects, WaitForSingleObject, INFINITE,
    };

    struct HandleGuard(HANDLE);
    impl Drop for HandleGuard {
        fn drop(&mut self) {
            if !self.0.is_invalid() && !self.0.0.is_null() {
                unsafe {
                    let _ = CloseHandle(self.0);
                }
            }
        }
    }

    fn extract_payload(notif: &UserNotification) -> RealNotifPayload {
        let app_name = notif
            .AppInfo()
            .and_then(|i| i.DisplayInfo())
            .and_then(|i| i.DisplayName())
            .map(|s| s.to_string())
            .unwrap_or_default();
        let aumid = notif
            .AppInfo()
            .and_then(|i| i.AppUserModelId())
            .map(|s| s.to_string())
            .unwrap_or_default();

        let mut lines = Vec::new();
        if let Ok(notification) = notif.Notification() {
            if let Ok(visual) = notification.Visual() {
                if let Ok(binding) = visual.GetBinding(&HSTRING::from("ToastGeneric")) {
                    if let Ok(elements) = binding.GetTextElements() {
                        if let Ok(count) = elements.Size() {
                            lines.reserve(count as usize);
                            for i in 0..count {
                                if let Ok(elem) = elements.GetAt(i) {
                                    lines.push(elem.Text().unwrap_or_default().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        let (title, body) = assemble_toast_text(&lines);
        RealNotifPayload {
            app_name,
            title,
            body,
            aumid,
        }
    }

    fn seed_existing_toasts(
        listener: &UserNotificationListener,
        tracker: &Arc<Mutex<SeenNotificationTracker>>,
    ) {
        let Ok(notifs) = listener
            .GetNotificationsAsync(NotificationKinds::Toast)
            .and_then(|op| op.get())
        else {
            return;
        };
        let mut current = HashSet::new();
        for notif in notifs {
            if let Ok(id) = notif.Id() {
                current.insert(id);
            }
        }
        if let Ok(mut guard) = tracker.lock() {
            guard.seed_ids(&current);
        }
    }

    fn sync_toasts_diff(
        app: &tauri::AppHandle,
        listener: &UserNotificationListener,
        tracker: &Arc<Mutex<SeenNotificationTracker>>,
    ) -> bool {
        let Ok(notifs) = listener
            .GetNotificationsAsync(NotificationKinds::Toast)
            .and_then(|op| op.get())
        else {
            return false;
        };
        let mut current_ids = HashSet::new();
        let mut payloads_by_id = Vec::new();
        for notif in notifs {
            if let Ok(id) = notif.Id() {
                current_ids.insert(id);
                payloads_by_id.push((id, extract_payload(&notif)));
            }
        }
        let newly_added: Vec<u32> = if let Ok(mut guard) = tracker.lock() {
            guard.sync_current(&current_ids)
        } else {
            return false;
        };
        if newly_added.is_empty() {
            return false;
        }
        let new_set: HashSet<u32> = newly_added.into_iter().collect();
        let mut emitted = false;
        for (id, payload) in payloads_by_id {
            if new_set.contains(&id) && is_meaningful_payload(&payload) {
                let _ = app.emit("real-notif", payload);
                emitted = true;
            }
        }
        emitted
    }

    fn open_wpn_dir_watch() -> Option<HANDLE> {
        let local_app_data = std::env::var_os("LOCALAPPDATA")?;
        let notif_dir = std::path::PathBuf::from(local_app_data)
            .join("Microsoft")
            .join("Windows")
            .join("Notifications");
        if !notif_dir.is_dir() {
            return None;
        }
        let wide: Vec<u16> = notif_dir
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let handle = unsafe {
            FindFirstChangeNotificationW(
                PCWSTR(wide.as_ptr()),
                false,
                FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_SIZE,
            )
            .ok()?
        };
        if handle.is_invalid() || handle.0.is_null() {
            None
        } else {
            Some(handle)
        }
    }

    fn run_passive_file_fallback(
        app: &tauri::AppHandle,
        listener: &UserNotificationListener,
        tracker: &Arc<Mutex<SeenNotificationTracker>>,
        wake_event: HANDLE,
    ) {
        let mut guard = FallbackSyncGuard::new();
        let Some(dir_handle) = open_wpn_dir_watch() else {
            loop {
                unsafe {
                    let _ = WaitForSingleObject(wake_event, 30_000);
                }
                if ACCESS_RECHECK_REQUESTED.swap(false, Ordering::AcqRel) {
                    if let Ok(status) = listener.GetAccessStatus() {
                        if status != UserNotificationListenerAccessStatus::Allowed {
                            return;
                        }
                    }
                }
                let _ = sync_toasts_diff(app, listener, tracker);
            }
        };

        let handles = [wake_event, dir_handle];
        let mut pending_sync = false;
        loop {
            let wait_ms = if pending_sync {
                guard
                    .remaining_wait(Instant::now())
                    .map(|d| d.as_millis().clamp(50, 60_000) as u32)
                    .unwrap_or(0)
            } else {
                INFINITE
            };
            let wait_res = unsafe { WaitForMultipleObjects(&handles, false, wait_ms) };
            if wait_res == WAIT_OBJECT_0 {
                if ACCESS_RECHECK_REQUESTED.swap(false, Ordering::AcqRel) {
                    if let Ok(status) = listener.GetAccessStatus() {
                        if status != UserNotificationListenerAccessStatus::Allowed {
                            break;
                        }
                    }
                }
                continue;
            }
            if wait_res.0 == WAIT_OBJECT_0.0 + 1 {
                unsafe {
                    let _ = FindNextChangeNotification(dir_handle);
                }
                pending_sync = true;
            }
            if wait_res.0 == WAIT_OBJECT_0.0 + 1 || wait_res == WAIT_TIMEOUT {
                if pending_sync && guard.can_sync(Instant::now()) {
                    pending_sync = false;
                    std::thread::sleep(Duration::from_millis(150));
                    let found_new = sync_toasts_diff(app, listener, tracker);
                    guard.record_sync(Instant::now(), found_new);

                    // Drain self-triggered WAL update notifications produced by GetNotificationsAsync.
                    std::thread::sleep(Duration::from_millis(350));
                    if unsafe { WaitForSingleObject(dir_handle, 0) } == WAIT_OBJECT_0 {
                        unsafe {
                            let _ = FindNextChangeNotification(dir_handle);
                        }
                    }
                } else if wait_res != WAIT_TIMEOUT && wait_res.0 != WAIT_OBJECT_0.0 + 1 {
                    std::thread::sleep(Duration::from_secs(5));
                }
            } else {
                std::thread::sleep(Duration::from_secs(5));
            }
        }

        unsafe {
            let _ = FindCloseChangeNotification(dir_handle);
        }
    }

    pub(crate) fn run_watcher(app: tauri::AppHandle) {
        let _com = crate::ComGuard::init(COINIT_MULTITHREADED);

        let Ok(wake_event) = (unsafe { CreateEventW(None, false, false, PCWSTR::null()) }) else {
            WATCHER_STARTED.store(false, Ordering::Release);
            return;
        };
        let _wake_guard = HandleGuard(wake_event);
        WAKE_EVENT_RAW.store(wake_event.0 as isize, Ordering::Release);

        let Ok(listener) = UserNotificationListener::Current() else {
            WAKE_EVENT_RAW.store(0, Ordering::Release);
            WATCHER_STARTED.store(false, Ordering::Release);
            return;
        };

        let tracker = Arc::new(Mutex::new(SeenNotificationTracker::new()));

        loop {
            let mut allowed = listener
                .GetAccessStatus()
                .map(|s| s == UserNotificationListenerAccessStatus::Allowed)
                .unwrap_or(false);

            while !allowed {
                unsafe {
                    let _ = WaitForSingleObject(wake_event, 60_000);
                }
                let _ = ACCESS_RECHECK_REQUESTED.swap(false, Ordering::AcqRel);
                allowed = listener
                    .GetAccessStatus()
                    .map(|s| s == UserNotificationListenerAccessStatus::Allowed)
                    .unwrap_or(false);
            }

            let handler_app = app.clone();
            let handler_tracker = tracker.clone();
            let handler =
                TypedEventHandler::<UserNotificationListener, UserNotificationChangedEventArgs>::new(
                    move |sender, args| {
                        let Some(listener_ref) = sender.as_ref() else {
                            return Ok(());
                        };
                        let Some(args_ref) = args.as_ref() else {
                            return Ok(());
                        };
                        let Ok(id) = args_ref.UserNotificationId() else {
                            return Ok(());
                        };
                        match args_ref.ChangeKind() {
                            Ok(UserNotificationChangedKind::Removed) => {
                                if let Ok(mut guard) = handler_tracker.lock() {
                                    guard.record_removed(id);
                                }
                            }
                            Ok(UserNotificationChangedKind::Added) => {
                                let already_seen = handler_tracker
                                    .lock()
                                    .map(|guard| guard.contains(id))
                                    .unwrap_or(false);
                                if already_seen {
                                    return Ok(());
                                }
                                let Ok(notif) = listener_ref.GetNotification(id) else {
                                    return Ok(());
                                };
                                let payload = extract_payload(&notif);
                                let is_new = handler_tracker
                                    .lock()
                                    .map(|mut guard| guard.record_added(id))
                                    .unwrap_or(false);
                                if is_new && is_meaningful_payload(&payload) {
                                    let _ = handler_app.emit("real-notif", payload);
                                }
                            }
                            _ => {}
                        }
                        Ok(())
                    },
                );

            // Register live event handler BEFORE seeding existing toasts to close any startup race gap.
            match listener.NotificationChanged(&handler) {
                Ok(token) => {
                    seed_existing_toasts(&listener, &tracker);
                    // Event-driven wait: zero calls to WpnUserService and zero disk I/O while idle.
                    loop {
                        unsafe {
                            let _ = WaitForSingleObject(wake_event, INFINITE);
                        }
                        if ACCESS_RECHECK_REQUESTED.swap(false, Ordering::AcqRel) {
                            if let Ok(status) = listener.GetAccessStatus() {
                                if status != UserNotificationListenerAccessStatus::Allowed {
                                    let _ = listener.RemoveNotificationChanged(token);
                                    break;
                                }
                            }
                        }
                    }
                }
                Err(_) => {
                    seed_existing_toasts(&listener, &tracker);
                    run_passive_file_fallback(&app, &listener, &tracker, wake_event);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assemble_toast_text_extracts_title_and_trims_body_lines() {
        let (title, body) = assemble_toast_text(&[
            "WhatsApp".to_string(),
            "  Budi  ".to_string(),
            "   ".to_string(),
            "Halo dunia".to_string(),
        ]);
        assert_eq!(title, "WhatsApp");
        assert_eq!(body, "Budi\nHalo dunia");
        assert_eq!(assemble_toast_text(&[]), (String::new(), String::new()));
    }

    #[test]
    fn is_meaningful_payload_filters_empty_or_whitespace_only_updates() {
        let empty = RealNotifPayload {
            app_name: "App".into(),
            title: "  ".into(),
            body: "\n\t ".into(),
            aumid: "app!id".into(),
        };
        assert!(!is_meaningful_payload(&empty));

        let title_only = RealNotifPayload {
            title: "Pesan baru".into(),
            ..empty.clone()
        };
        assert!(is_meaningful_payload(&title_only));

        let body_only = RealNotifPayload {
            body: "Isi pesan".into(),
            ..empty
        };
        assert!(is_meaningful_payload(&body_only));
    }

    #[test]
    fn seen_tracker_deduplicates_removes_and_bounds_size() {
        let mut tracker = SeenNotificationTracker::new();
        assert!(tracker.record_added(10));
        assert!(!tracker.record_added(10));
        assert!(tracker.contains(10));

        tracker.record_removed(10);
        assert!(!tracker.contains(10));
        assert!(tracker.record_added(10));

        // seed_ids preserves concurrently observed live IDs instead of wiping them
        let seed: HashSet<u32> = [20, 21].into_iter().collect();
        tracker.seed_ids(&seed);
        assert!(tracker.contains(10));
        assert!(tracker.contains(20));
        assert!(tracker.contains(21));

        for i in 100..(100 + MAX_SEEN_IDS as u32 + 50) {
            tracker.record_added(i);
        }
        assert!(tracker.len() <= MAX_SEEN_IDS);

        let active: HashSet<u32> = [9999].into_iter().collect();
        let added = tracker.sync_current(&active);
        assert_eq!(added, vec![9999]);
        assert_eq!(tracker.len(), 1);
        assert!(tracker.contains(9999));
    }

    #[test]
    fn fallback_sync_guard_suppresses_self_write_and_backs_off_on_empty_syncs() {
        let mut guard = FallbackSyncGuard::new();
        let t0 = Instant::now();
        assert!(guard.can_sync(t0));
        assert_eq!(guard.remaining_wait(t0), None);

        guard.record_sync(t0, false);
        // Self-write suppression window (2s) + streak-1 cooldown (10s)
        assert!(!guard.can_sync(t0 + Duration::from_secs(1)));
        assert_eq!(
            guard.remaining_wait(t0 + Duration::from_secs(1)),
            Some(Duration::from_secs(9))
        );
        assert!(!guard.can_sync(t0 + Duration::from_secs(5)));
        assert!(guard.can_sync(t0 + Duration::from_secs(10)));
        assert_eq!(guard.remaining_wait(t0 + Duration::from_secs(10)), None);

        // Second consecutive empty sync backs off further to 30s
        let t1 = t0 + Duration::from_secs(10);
        guard.record_sync(t1, false);
        assert!(!guard.can_sync(t1 + Duration::from_secs(20)));
        assert_eq!(
            guard.remaining_wait(t1 + Duration::from_secs(20)),
            Some(Duration::from_secs(10))
        );
        assert!(guard.can_sync(t1 + Duration::from_secs(30)));

        // Real new notification resets cooldown back to 3s base (after 2s self-write suppress)
        let t2 = t1 + Duration::from_secs(30);
        guard.record_sync(t2, true);
        assert!(!guard.can_sync(t2 + Duration::from_secs(2)));
        assert_eq!(
            guard.remaining_wait(t2 + Duration::from_secs(2)),
            Some(Duration::from_secs(1))
        );
        assert!(guard.can_sync(t2 + Duration::from_secs(3)));
    }
}
