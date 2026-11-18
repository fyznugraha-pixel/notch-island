use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
};

#[link(name = "kernel32")]
extern "system" {
    fn K32EmptyWorkingSet(hProcess: *mut c_void) -> i32;
}

const INITIAL_TRIM_DELAY_SECS: u64 = 60;
const PERIODIC_TRIM_INTERVAL_SECS: u64 = 300;

static OPTIMIZER_STARTED: AtomicBool = AtomicBool::new(false);
static TRIM_GEN: AtomicU64 = AtomicU64::new(0);
static APP_START: OnceLock<Instant> = OnceLock::new();

fn uptime_secs() -> u64 {
    APP_START
        .get()
        .map(|start| start.elapsed().as_secs())
        .unwrap_or(0)
}

pub fn trim_process_tree_working_set() {
    let own_pid = std::process::id();
    let mut entries: Vec<(u32, u32, String)> = Vec::new();

    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe = String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase();
                entries.push((entry.th32ProcessID, entry.th32ParentProcessID, exe));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }

    let mut tree_pids: HashSet<u32> = HashSet::from([own_pid]);
    for _ in 0..3 {
        let mut added = false;
        for (pid, parent_pid, exe) in &entries {
            if tree_pids.contains(parent_pid)
                && (exe == "msedgewebview2.exe" || exe == "gili.exe")
                && tree_pids.insert(*pid)
            {
                added = true;
            }
        }
        if !added {
            break;
        }
    }

    for pid in tree_pids {
        unsafe {
            if let Ok(handle) = OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA,
                false,
                pid,
            ) {
                let _ = K32EmptyWorkingSet(handle.0);
                let _ = CloseHandle(handle);
            }
        }
    }
}

fn trim_if_flyout_closed() {
    if !crate::taskbar_flyout::is_flyout_open() {
        trim_process_tree_working_set();
    }
}

pub fn schedule_working_set_trim(delay_ms: u64) {
    if uptime_secs() < INITIAL_TRIM_DELAY_SECS {
        return;
    }
    let gen = TRIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(delay_ms));
        if uptime_secs() < INITIAL_TRIM_DELAY_SECS || TRIM_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        trim_process_tree_working_set();
    });
}

pub fn start_memory_optimizer() {
    let _ = APP_START.get_or_init(Instant::now);
    if OPTIMIZER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    std::thread::Builder::new()
        .name("gili-memory-optimizer".into())
        .spawn(|| {
            std::thread::sleep(Duration::from_secs(INITIAL_TRIM_DELAY_SECS));
            trim_if_flyout_closed();
            loop {
                std::thread::sleep(Duration::from_secs(PERIODIC_TRIM_INTERVAL_SECS));
                trim_if_flyout_closed();
            }
        })
        .ok();
}
