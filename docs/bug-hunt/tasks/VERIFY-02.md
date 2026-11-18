# Laporan Verifikasi Silang Independen - Batch V02 (`VERIFY-02`)

Verifikator: Sub-Agen Verifikator Independen (`V02`)
Metode: Pembacaan langsung kode sumber asli Rust (`src-tauri/src/*.rs`) serta eksekusi skrip reproduksi mandiri (`tests/bug-hunt/T04_geometry_dpi_proof.mjs` dan `tests/bug-hunt/V02_check.mjs`) tanpa membaca berkas laporan `docs/bug-hunt/tasks/T*.md`.

---

## Tabel Ringkasan Hasil Verifikasi

| No | ID Temuan | Status Akhir | Label Bukti | Penilaian Keparahan | Status Desktop Asli |
|---|---|---|---|---|---|
| 1 | `T03-01` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 2 | `T03-02` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 3 | `T03-04` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 4 | `T03-05` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `KRITIS` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 5 | `T03-08` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 6 | `T03-09` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 7 | `T03-11` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` | `KRITIS` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 8 | `T03-13` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 9 | `T03-17` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 10 | `T04-01` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 11 | `T04-02` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` | `KRITIS` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 12 | `T04-04` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 13 | `T04-05` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 14 | `T04-06` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 15 | `T04-07` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 16 | `T04-08` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 17 | `T04-09` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |

---

## Rincian Verifikasi Per Temuan

### 1. `T03-01` | Emergency kill-switch dipanggil sinkron di callback `WH_KEYBOARD_LL` dan menghilangkan notifikasi UI
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L305-L308), di dalam fungsi callback `unsafe extern "system" fn low_level_keyboard_proc`, cabang `HotkeyAction::TriggerEmergencyKillSwitch` langsung memanggil `trigger_emergency_kill_switch(None)` secara sinkron sebelum mengembalikan `LRESULT(1)`.
  2. Di [taskbar_safety.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_safety.rs#L130-L156), `trigger_emergency_kill_switch(None)` menjalankan operasi berat secara berurutan di thread hook:
     - `log_taskbar_event(...)` ([taskbar_logger.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_logger.rs#L23-L48)) yang mengambil `Mutex` global, memanggil `create_dir_all`, `fs::metadata`, `fs::rename`, `OpenOptions::open`, dan `writeln!` ke disk.
     - `restore_windows_taskbar_hard()` ([taskbar_safety.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_safety.rs#L80-L106)) yang memanggil `SHAppBarMessage(ABM_SETSTATE)`, `ShowWindow`, `SetWindowPos` sinkron lintas-proses ke `Shell_TrayWnd` (`explorer.exe`), lalu memanggil `taskbar_manager::set_taskbar_visible(true)`.
     - `set_taskbar_visible(true)` ([taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L348-L402)) kembali melakukan IPC sinkron ke `Shell_TrayWnd` dan seluruh `Shell_SecondaryTrayWnd` (`SHAppBarMessage`, `DwmSetWindowAttribute`, `SetLayeredWindowAttributes`, `SetWindowLongW`, `ShowWindow`, `SetWindowPos`) serta operasi I/O disk `write_disk_flag(false)`. Bila `explorer.exe` sedang macet/hang (justru alasan utama user menekan kill-switch darurat), callback `WH_KEYBOARD_LL` akan melampaui `LowLevelHooksTimeout` Windows (~300 ms) sehingga OS melepas hook secara diam-diam.
  3. Karena dipanggil dengan argumen `None`, blok `if let Some(app) = app_handle { let _ = app.emit("taskbar-emergency-killed", ()); }` pada [taskbar_safety.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_safety.rs#L153-L155) terlewati sepenuhnya. Akibatnya frontend tidak pernah menerima event `"taskbar-emergency-killed"` saat kill-switch dipicu lewat shortcut keyboard.

---

### 2. `T03-02` | State `WIN_KEY_MASK` tertinggal saat Lock Screen/UAC dan modifier diabaikan untuk tombol Win
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. **Skenario (a) Lock Screen (`Win+L`) / UAC**: Di [taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L170-L191), ketika `Win` ditekan lalu `L` ditekan, `state.win_key_mask = BIT_LWIN` dan `state.win_key_interrupted = true`. Saat Windows berpindah ke desktop aman (Winlogon/UAC) sebelum `LWin` dilepas, event `WM_KEYUP` untuk `LWin` tidak pernah dikirim ke hook proses user. Ketika user kembali ke desktop dan menekan `LWin` secara solo:
     - Pada `WM_KEYDOWN` `LWin` ([taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L171-L178)), `was_down = state.is_win_down()` bernilai `true` karena `WIN_KEY_MASK` masih `1`. Akibatnya blok `if !was_down` dilewati: `state.win_key_interrupted` tetap `true` dan `WinKeyDownInjectNeutralDelayed` tidak dikembalikan.
     - Pada `WM_KEYUP` `LWin` ([taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L183-L189)), `interrupted` bernilai `true`, sehingga `WinSoloStart` gagal terpanggil dan menu Start bawaan Windows justru terbuka (karena neutral key tidak disuntikkan). Hal ini telah dibuktikan lewat eksekusi `tests/bug-hunt/V02_check.mjs`.
  2. **Skenario (b) Modifier diabaikan saat `is_win_key`**: Di [taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L280-L282), kode secara eksplisit menulis `let mods = if is_win_key { ModifierState::default() } else { ... };` dan di `evaluate_hotkey_event` ([taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L170-L191)) cabang `if is_win_key` sama sekali tidak memeriksa `mods.ctrl`, `mods.alt`, atau `mods.shift`. Jika user menahan `Ctrl`, `Shift`, atau `Alt` terlebih dahulu lalu menekan dan melepas `LWin`, `WinSoloStart` tetap terpicu dan menyuntikkan neutral key.
  3. **Skenario (c) Tap cepat `< 2 ms`**: Di [taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L309-L314), `WinKeyDownInjectNeutralDelayed` melakukan `std::thread::spawn` yang tidur `2 ms` (yang pada resolusi timer standar Windows dapat molor hingga ~15.6 ms) lalu memanggil `inject_neutral_key()` tanpa memeriksa apakah `WIN_KEY_MASK` masih aktif, sehingga injeksi `0xE8` terjadi setelah `WM_KEYUP` `LWin` selesai diproses.

---

### 3. `T03-04` | `release_tray_overflow_lease` memakai `AtomicU32::try_update` sekali coba sehingga lease bocor saat contention
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L45-L52):
     ```rust
     pub fn release_tray_overflow_lease() {
         let prev = TRAY_OVERFLOW_LEASE_COUNT
             .try_update(Ordering::SeqCst, Ordering::SeqCst, |v| Some(v.saturating_sub(1)))
             .unwrap_or(0);
         if prev <= 1 && TASKBAR_HIDDEN.load(Ordering::SeqCst) {
             restore_shell_tray_hidden_now();
         }
     }
     ```
  2. Berbeda dengan `fetch_update` (yang melakukan CAS loop), `AtomicU32::try_update` hanya melakukan **satu kali** percobaan `compare_exchange`! Jika pada saat bersamaan thread lain memodifikasi `TRAY_OVERFLOW_LEASE_COUNT` (mis. lewat `acquire_tray_overflow_lease()` di [taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L39-L43) atau `release_tray_overflow_lease()`), `try_update` gagal (`Err`) dan `.unwrap_or(0)` menghasilkan `prev = 0` tanpa mengurangi nilai `TRAY_OVERFLOW_LEASE_COUNT`.
  3. Akibatnya:
     - `TRAY_OVERFLOW_LEASE_COUNT` bocor permanen (`> 0` selamanya) karena `TrayOverflowLeaseGuard::drop` sudah menandai `self.released = true` ([taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L56-L58)).
     - Karena `has_tray_overflow_lease()` ([taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L27-L29)) selalu bernilai `true`, `restore_shell_tray_hidden_now()` ([taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L287)) langsung keluar (`return`), dan loop watchdog ([taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L510-L515)) tidak pernah lagi memanggil `cloak_and_hide_tray_hwnd(hwnd)`, melainkan membiarkan `Shell_TrayWnd` tanpa region kosong dan tanpa `SW_HIDE`.

---

### 4. `T03-05` | Watchdog menimpa preferensi `ABS_AUTOHIDE` user dan berpacu saat restart cepat
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `KRITIS`
- **Bukti Verifikasi Langsung**:
  1. **Selalu di-spawn walau `hideWindowsTaskbar = false`**: Di [lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L6201), `taskbar_safety::ensure_taskbar_watchdog_spawned()` dipanggil tanpa syarat saat startup aplikasi.
  2. **Menimpa `ABS_AUTOHIDE` secara membabi buta saat Gili keluar**: Di [taskbar_safety.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_safety.rs#L58-L106), ketika proses induk Gili berhenti (baik keluar normal, di-kill, maupun saat `hideWindowsTaskbar = false`), proses `--taskbar-watchdog` memanggil `restore_windows_taskbar_hard()` yang meng-hardcode `lParam: LPARAM(ABS_ALWAYSONTOP as isize)` pada `SHAppBarMessage(ABM_SETSTATE, &mut abd)` ([taskbar_safety.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_safety.rs#L88-L91)). Jika user sebelumnya mengaktifkan fitur Auto-Hide Taskbar bawaan Windows (`ABS_AUTOHIDE`), preferensi OS milik user langsung tertimpa menjadi `ABS_ALWAYSONTOP`.
  3. **Bug penyimpanan `ORIGINAL_TASKBAR_STATE`**: Di [taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L97-L111), `save_original_state` menganggap `0` sebagai sentinel "belum disimpan" (`if ORIGINAL_TASKBAR_STATE.load(...) != 0 { return; }`), dan `set_shell_autohide_state(hwnd, false)` ([taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L119-L120)) memaksa fallback `ABS_ALWAYSONTOP` jika `saved == 0`. Lebih parah lagi, pada startup berikutnya setelah crash (`check_and_recover_on_startup` di [taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L86-L94)), `set_taskbar_visible(true)` dipanggil ketika `ORIGINAL_TASKBAR_STATE` masih `0`, sehingga state `ABS_AUTOHIDE` yang disetel sesi sebelumnya ditimpa ke `ABS_ALWAYSONTOP`.
  4. **Race saat restart cepat (`restart_app`)**: Saat Gili melakukan `app.restart()` ([lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L4445-L4449)) atau di-restart cepat, proses watchdog lama yang menunggu `WaitForSingleObject(process_handle, INFINITE)` baru terbangun ketika PID lama mati, yang dapat terjadi berbarengan atau sesudah instance Gili baru menyembunyikan taskbar (`set_taskbar_visible(false)`), sehingga watchdog lama memanggil `restore_windows_taskbar_hard()` dan menampilkan kembali taskbar native di atas Gili baru.

---

### 5. `T03-08` | `was_just_open` menyuntikkan `VK_ESCAPE` ke aplikasi pengguna saat surface sudah tertutup dan timer terus ditimpa watcher
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [shell_surface_toggle.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shell_surface_toggle.rs#L203-L219), selama surface shell (mis. `StartMenuExperienceHost.exe` atau `SearchHost.exe`) masih terdeteksi sebagai foreground dan `IsWindowVisible(fg)` bernilai `true` (termasuk selama animasi penutupan XAML Island Windows 11), loop watcher setiap 25 ms terus memperbarui `LAST_SEEN_MS.store(now_ms(), Ordering::SeqCst)`.
  2. Ketika user membuka Start Menu / Search / Quick Settings lalu langsung klik ke jendela aplikasi kerja (sehingga surface shell otomatis tertutup karena kehilangan fokus), atau klik tombol Start di navbar dalam jendela `< 950 ms` (`RECENT_DISMISS_WINDOW_MS` di [shell_surface_toggle.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shell_surface_toggle.rs#L26,L258-L267)), fungsi `was_just_open` masuk ke **Case 2** (surface sudah BUKAN foreground window lagi, melainkan aplikasi pengguna yang sedang fokus!).
  3. Di dalam **Case 2** ([shell_surface_toggle.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shell_surface_toggle.rs#L265-L266)), kode tetap memanggil `dismiss_surface_state()` ([shell_surface_toggle.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shell_surface_toggle.rs#L236-L243)) yang menyuntikkan `keybd_event(VK_ESCAPE)` secara global ke jendela foreground aktif saat itu (yakni aplikasi pengguna, yang dapat menutup dialog/modal/mode edit di aplikasi pengguna) sekaligus mengembalikan `true` sehingga klik tombol Start di navbar gagal membuka Start Menu.

---

### 6. `T03-09` | Kebocoran COM `CoInitializeEx(COINIT_MULTITHREADED)` tanpa `CoUninitialize` mengunci thread pool ke mode MTA
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1154-L1156), fungsi `resolve_shortcut_with_options` memanggil:
     ```rust
     let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
     ```
     secara mentah tanpa `ComGuard` dan tanpa pernah memanggil `CoUninitialize()` di akhir fungsi.
  2. Setiap pemanggilan `resolve_shortcut` / `resolve_shortcut_with_options` menambah reference count inisialisasi COM (`COINIT_MULTITHREADED`) pada thread pemanggil secara permanen:
     - Saat dipanggil dari `get_recent_files` ([windows_start_search.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_start_search.rs#L137,L178)) di dalam `tauri::async_runtime::spawn_blocking`, worker thread pool Tokio yang belum memiliki STA langsung terkunci permanen ke apartemen MTA (`COINIT_MULTITHREADED`) karena `CoUninitialize` tidak pernah dipanggil.
     - Ketika worker thread Tokio yang sama kemudian digunakan oleh tugas `spawn_blocking` lain yang membutuhkan STA (`ComGuard::init(COINIT_APARTMENTTHREADED)` pada `launch_pinned_app` di [windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1708), `invoke_system_tray_item` di [windows_tray_overflow.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_tray_overflow.rs#L979), `open_system_tray_item_menu` di [windows_tray_overflow.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_tray_overflow.rs#L1085), atau `pick_files_dialog`), `CoInitializeEx(None, COINIT_APARTMENTTHREADED)` akan gagal dengan `RPC_E_CHANGED_MODE` (`0x80010106`).
     - Saat dipanggil dari `collect_all_installed_apps()` ([windows_app_indexer.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_app_indexer.rs#L363,L405)), meskipun `_com = ComGuard::init(COINIT_APARTMENTTHREADED)` masih hidup di blok luar pada baris 363? Perhatikan baris 362-376 di [windows_app_indexer.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_app_indexer.rs#L362-L376): `_com` dideklarasikan di dalam blok `unsafe { let _com = ComGuard::init(COINIT_APARTMENTTHREADED); ... }` yang **langsung di-drop pada baris 376** sebelum loop `for path in shortcut_files` pada baris 397-405! Akibatnya pada baris 405, `resolve_shortcut_with_options` berjalan saat STA sudah di-uninitialize, sehingga mengunci worker thread Tokio tersebut ke `COINIT_MULTITHREADED` secara permanen.

---

### 7. `T03-11` | Penutupan tray app berisiko membunuh proses keliru/sistem lewat substring 3 huruf dan celah bypass `can_close_tray_app`
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `KRITIS`
- **Bukti Verifikasi Langsung**:
  1. **Pencocokan substring `>= 3` huruf pada Tahap 2 UIA**: Di [tray_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/tray_apps.rs#L444-L453), item tray UIA yang belum terpetakan oleh `NotifyIconSettings` (mis. ikon sistem atau aplikasi yang namanya berupa kalimat tooltip panjang seperti `"Keamanan Windows - Tidak diperlukan tindakan"` atau `"Speakers (Realtek Audio): 80%"`) dicocokkan ke sembarang proses aktif (`active_procs`) hanya dengan syarat `stem.len() >= 3 && uname_low.contains(&stem)`. Skrip uji `tests/bug-hunt/V02_check.mjs` membuktikan bahwa tooltip tersebut mencocokkan proses apa pun yang memiliki nama stem 3 huruf yang kebetulan menjadi substring kalimat (seperti `man.exe`, `win.exe`, `ear.exe`, `pro.exe`, `cat.exe`, `net.exe`), lalu mengikat `pid`, `process_name`, dan `exe_path` proses tak bersalah itu ke item tray tersebut.
  2. **Daftar `PROTECTED_TRAY_PROCESSES` tidak lengkap dan tidak memeriksa path**: Di [tray_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/tray_apps.rs#L107-L148), `can_close_tray_app` hanya memeriksa daftar pendek nama file dan tidak memproteksi `msedgewebview2.exe` (proses renderer WebView2 milik Gili sendiri atau aplikasi lain), `textinputhost.exe`, `widgets.exe`, `systemsettings.exe`, maupun proses di `C:\Windows\System32`.
  3. **Bypass `can_close_tray_app` di `close_tray_background_app_sync`**: Di [tray_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/tray_apps.rs#L603-L638), `can_close_tray_app(pid, clean_proc)` hanya mengecek argumen input `process_name`, tetapi tidak pernah memvalidasi nama proses aktual dari `pid` maupun `exe_path` di `active_procs`! Pada baris 623-638:
     - Jika `pid` telah di-reuse oleh proses sistem yang terproteksi (atau caller mengirim `process_name = "app.exe"` dengan `pid` milik proses lain), filter `if *p == pid { return true; }` memasukkan `pid` tersebut ke `target_pids` tanpa mengecek apakah `fname` dari `*p` ada di `PROTECTED_TRAY_PROCESSES` atau `GENERIC_HOST_EXES`.
     - Lebih lanjut, `post_wm_close_to_pids` diikuti `TerminateProcess(handle, 0)` ([tray_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/tray_apps.rs#L671-L675)) terhadap seluruh PID yang cocok dengan nama `clean_proc` atau `norm_exe`.

---

### 8. `T03-13` | `activate_aumid` menolak Win32 AUMID berkurung kurawal/backslash dari `AppsFolder`
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [windows_app_indexer.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_app_indexer.rs#L195-L201), `collect_apps_folder_items` membaca `SIGDN_PARENTRELATIVEPARSING` dari `FOLDERID_AppsFolder` dan menyimpannya sebagai `lnk_path = format!("shell:AppsFolder\\{}", parsing)`. Untuk aplikasi Win32 yang terdaftar di `AppsFolder`, format standar parsing name Windows adalah KnownFolder GUID diikuti path relatif (mis. `{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\notepad.exe` atau `{6D809377-6AF0-444B-8957-A3773F02200E}\Manufacturer\App.exe`) atau `Microsoft.AutoGenerated.{GUID}`. Apabila `SIGDN_FILESYSPATH` gagal atau tidak menunjuk ke file langsung, `target_path` bernilai kosong (`""`).
  2. Ketika user meluncurkan aplikasi tersebut lewat `launch_pinned_app` ([windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1713-L1728)), cabang `if let Some(aumid) = lower_lnk.strip_prefix("shell:appsfolder\\")...` memanggil `activate_aumid(aumid)`.
  3. Di [windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1429-L1437):
     ```rust
     if trimmed.is_empty()
         || !trimmed
             .chars()
             .all(|c| c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '!' | ' '))
     {
         return false;
     }
     ```
     Karakter `{`, `}`, `\`, `:`, `(`, `)` ditolak oleh filter tersebut sehingga `activate_aumid` langsung mengembalikan `false` (dibuktikan lewat `tests/bug-hunt/V02_check.mjs`).
  4. Karena cabang `if let Some(aumid) = ...` adalah `if ... else if shell_execute_open(trimmed_lnk, "", None)` ([windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1713-L1727)), kegagalan `activate_aumid` dan `resolve_protocol_for_app` **tidak** jatuh ke `shell_execute_open(trimmed_lnk, ...)`, dan jika `target_path` kosong, fungsi berakhir dengan `Err("Gagal membuka aplikasi")`.

---

### 9. `T03-17` | `launch_pinned_app` tidak memvalidasi path/skema sebelum `ShellExecuteW` dan merusak multi-argumen di fallback `Command::new`
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. **Tanpa validasi skema/ekstensi pada `launch_pinned_app`**: Di [windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1710-L1728), `launch_pinned_app_sync` menerima `lnk_path` bebas dari command IPC Tauri (`launch_pinned_app`). Selama `trimmed_lnk` tidak diawali `"shell:appsfolder\\"`, baris 1725 langsung mengeksekusi `shell_execute_open(trimmed_lnk, "", None)` yang memanggil `ShellExecuteW(..., "open", trimmed_lnk, ...)` ([windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1478-L1485)) tanpa memeriksa apakah `lnk_path` benar-benar file `.lnk`/`.url` atau URI berbahaya (`ms-msdt:`, `search-ms:`, UNC path `\\server\share\payload.exe`, `.ps1`, `.bat`, `.vbs`). Sebagai perbandingan, indexer `.url` di [windows_app_indexer.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_app_indexer.rs#L149-L164) juga mengindeks semua file `.url` di Desktop/Start Menu tanpa membatasi skema `URL=` di dalamnya.
  2. **Kerusakan multi-argumen pada fallback `Command::new`**: Di [windows_pinned_apps.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_pinned_apps.rs#L1769-L1778):
     ```rust
     let mut cmd = std::process::Command::new(trimmed_target);
     if let Some(dir) = parent_dir.filter(|s| !s.is_empty()) {
         cmd.current_dir(dir);
     }
     if !arguments.trim().is_empty() {
         cmd.arg(&arguments);
     }
     ```
     `std::process::Command::arg(&arguments)` di Windows meneruskan seluruh string `arguments` sebagai **satu argumen tunggal yang diapit tanda kutip** (mis. `"--profile-directory=\"Default\" --app-id=123"` menjadi satu token argv[1] utuh), sehingga aplikasi target gagal mengenali flag multi-argumen dari shortcut `.lnk`.

---

### 10. `T04-01` | `sync_window_previews` meng-hardcode `"navbar"` sehingga live preview pada monitor sekunder salah posisi dan skala DPI
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [window_preview.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/window_preview.rs#L1261-L1293), command `sync_window_previews` tidak menerima parameter `window: tauri::WebviewWindow` dari pemanggil, melainkan meng-hardcode:
     ```rust
     let Some(nav) = app.get_webview_window("navbar") else {
         clear_window_previews();
         return Vec::new();
     };
     let Ok(raw_nav_hwnd) = nav.hwnd() else { ... };
     let scale_factor = nav.scale_factor().unwrap_or(1.0);
     ```
  2. Di [window_preview.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/window_preview.rs#L971-L984,L1025-L1028), `sync_slots_from_desired` menghitung posisi layar fisik DWM thumbnail menggunakan `ClientToScreen(nav, &mut origin)` dan `state.scale_factor` dari jendela `"navbar"` (monitor primer):
     ```rust
     let phys_x = origin.x + (item.x * scale).round() as i32;
     let phys_y = origin.y + (item.y * scale).round() as i32;
     let phys_w = (item.width * scale).round().max(1.0) as i32;
     let phys_h = (item.height * scale).round().max(1.0) as i32;
     ```
  3. Saat user mengarahkan kursor ke ikon aplikasi pada dock monitor sekunder (`navbar_secondary_1`, `navbar_secondary_2`, dst.), koordinat `item.x, item.y` yang dikirim relatif terhadap viewport `navbar_secondary_N` justru ditambahkan ke `origin` milik `"navbar"` pada monitor primer dengan `scale_factor` monitor primer. Sebagaimana dibuktikan pada `tests/bug-hunt/V02_check.mjs`, pada konfigurasi Monitor 1 `(0,0)` 100% dan Monitor 2 `(-1920,0)` 150%, thumbnail DWM muncul di `(420, 878)` ukuran `200x132` di Monitor 1, bukan di `(-1290, 699)` ukuran `300x198` di atas kartu popup Monitor 2. Selain itu, pengecekan Z-order di [window_preview.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/window_preview.rs#L1051,L1224-L1228) (`is_hwnd_above(nav, slot.hwnd)`) juga hanya membandingkan terhadap HWND `"navbar"` utama.

---

### 11. `T04-02` | Pencampuran `win.scale_factor()` dengan ukuran logis target pada `taskbar_flyout.rs` menyebabkan flyout menindih dock dan meluber ke luar monitor
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `KRITIS`
- **Bukti Verifikasi Langsung**:
  1. Di [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L460-L464) (`apply_target_to_flyout_window`) dan [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L1187-L1210) (`resize_taskbar_flyout`), kode mengambil `let scale_factor = win.scale_factor().unwrap_or(1.0);` dari jendela `taskbar_flyout` **sebelum** dipindahkan (saat cold-start berada di `(-10000, -10000)` atau masih di monitor sebelumnya).
  2. Di `resolve_trigger_screen_logical` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L780-L790)) dan `calculate_anchored_position` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L965-L968)), posisi trigger dan batas `rcWork` monitor target dibagi dengan `scale_factor` lama milik `win`, sedangkan `desired_w` dan `desired_h` (mis. `600x640`) tetap dalam satuan logis monitor target (`nav_scale`) tanpa dikalikan `ratio = nav_scale / safe_scale`.
  3. Di [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L524-L525):
     ```rust
     let _ = win_main.set_size(tauri::LogicalSize::new(desired_w, desired_h));
     let _ = win_main.set_position(tauri::LogicalPosition::new(target_x, target_y));
     ```
     Saat `set_position` memindahkan `taskbar_flyout` dari Monitor 1 (100%, `scale = 1.0`) ke Monitor 2 (150%, `scale = 1.5`), Windows mengirim `WM_DPICHANGED` yang mengubah ukuran fisik flyout menjadi `600 * 1.5 = 900px` x `640 * 1.5 = 960px`, sementara `target_y` dihitung dengan mengurangkan `height = 640` (bukan `960`) dari posisi fisik dock (`981px`)! Hasil eksekusi `node tests/bug-hunt/T04_geometry_dpi_proof.mjs` membuktikan `actualPhysBottom = 1289px` pada monitor bertinggi `1080px` (meluber `209px` ke bawah monitor dan menindih dock sebesar `308px`).
  4. Untuk Skenario (b) `1920x1080 @ 175%`, tinggi logis monitor adalah `1080 / 1.75 = 617.14px`, sedangkan `"search"` memiliki `desired_h = 700.0` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L277)) dan `calculate_anchored_position_in_bounds` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L929-L934)) hanya meng-clamp `y` ke `bounds.top + 12 = 12` tanpa membatasi `height` terhadap tinggi `rcWork`, sehingga bagian bawah flyout (`12 + 700 = 712px` logis = `1246px` fisik) terpotong keluar dari layar `1080p` dan menutup dock.

---

### 12. `T04-04` | Race condition `win.destroy()` asinkron pada `schedule_flyout_idle_destroy` vs re-open melalui `FLYOUT_BUILD_LOCK`
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L52-L78), setelah idle 90 detik, thread `schedule_flyout_idle_destroy` mengunci `FLYOUT_BUILD_LOCK`, memanggil `let _ = win.destroy();` (baris 73), lalu langsung keluar dari scope dan melepas `FLYOUT_BUILD_LOCK`.
  2. Di Tauri v2 (`tao`), `WebviewWindow::destroy()` dari background thread tidak menghancurkan HWND secara sinkron di tempat, melainkan mem-posting pesan penghancuran ke event loop main thread; jendela `"taskbar_flyout"` baru benar-benar dihapus dari daftar `app.webview_windows()` ketika `WindowEvent::Destroyed` selesai diproses di main thread ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L236-L240)).
  3. Selain itu, jalur re-open cepat di `open_taskbar_flyout_internal` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L690-L712)) dan `switch_taskbar_flyout_target` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L1143-L1156)) bahkan **tidak mengunci `FLYOUT_BUILD_LOCK`** sama sekali, dan jalur lambat `ensure_flyout_window_with_initial` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L141-L143)) langsung mengembalikan `Some(win)` dari `app.get_webview_window("taskbar_flyout")` jika `WindowEvent::Destroyed` belum dieksekusi di main thread!
  4. Akibatnya:
     - `ensure_flyout_window_with_initial` mengembalikan objek `WebviewWindow` yang sedang sekarat (menunggu `WM_DESTROY` di main thread).
     - `spawn_lazy_flyout_and_apply` menunggu `FLYOUT_READY` selama 1500 ms pada window yang akan hancur, lalu ketika `WindowEvent::Destroyed` akhirnya dieksekusi di main thread ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L236-L240)), handler tersebut mereset `FLYOUT_OPEN.store(false)` dan `FLYOUT_READY.store(false)`, membatalkan pembukaan flyout yang baru saja diminta user.

---

### 13. `T04-05` | Race cold-start target switch, grace period `Focused(false)` 550ms, timpaan `LAST_FG_HWND` child HWND, dan fokus dicuri saat close
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. **Skenario (a) Cold-start target switch**: Di [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L623-L625), `ensure_flyout_window_with_initial` menyuntikkan `initialization_script` dengan `init_target` awal (mis. `"start"`). Jika `< 300 ms` kemudian (saat WebView2 masih memuat HTML/JS dan `FLYOUT_READY` masih `false`) user menekan tombol/hotkey target kedua (mis. `"quickSettings"`), `open_taskbar_flyout_internal` memperbarui `ACTIVE_TARGET` menjadi `"quickSettings"`, memanggil `spawn_lazy_flyout_and_apply` yang langsung `return` karena `FLYOUT_CREATING` sudah `true` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L604-L609)). Saat JS selesai dimuat dan memanggil `get_taskbar_flyout_state()` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L734-L752)), `FLYOUT_READY` disetel ke `true` pada baris 735 **sebelum** fungsi `window.__setTaskbarFlyoutState` sempat didaftarkan oleh `useEffect` React setelah promise IPC `get_taskbar_flyout_state` resolve! Thread Rust di baris 633 langsung terbangun dalam `< 15 ms` dan mengeksekusi `win_main.eval("... if (typeof window.__setTaskbarFlyoutState === 'function') ...")` saat handler JS belum terpasang, sementara `initialization_script` awal memiliki `window.__PENDING_TASKBAR_FLYOUT__ = { target: 'start' }`.
  2. **Skenario (b) Grace period 550 ms di-reset berulang kali**: Di [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L188-L192,L200-L204), `WindowEvent::Focused(false)` mengabaikan kehilangan fokus apabila `now_epoch_ms().saturating_sub(FLYOUT_OPENED_AT_MS.load(...)) < 550`. Selain saat dibuka (`L477`, `L515`, `L531`, `L725`, `L738`), `FLYOUT_OPENED_AT_MS` juga di-reset ulang setiap kali `resize_taskbar_flyout` dipanggil oleh frontend ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L1212))! Jika user klik di luar flyout dalam `< 550 ms` sejak flyout terbuka atau sejak animasi resize konten selesai, event `Focused(false)` diabaikan dan tidak ada timer lanjutan setelah 550 ms untuk memeriksa ulang apakah flyout sudah kehilangan fokus, sehingga flyout tetap menggantung terbuka meskipun fokus sudah pindah ke aplikasi lain.
  3. **Skenario (c) Timpaan `LAST_FG_HWND` dengan child HWND WebView2 & pencurian fokus saat close**:
     - Di [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L693-L698) dan [taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L715-L723), kode hanya memeriksa `fg.0 != raw_hwnd.0` (tanpa `!IsChild(raw_hwnd, fg)`!). Pada Windows WebView2, ketika input di dalam flyout fokus, `GetForegroundWindow()` atau fokus dapat berada pada window maupun saat berpindah target; dan sebaliknya di `hide_taskbar_flyout()` ([taskbar_flyout.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_flyout.rs#L1056-L1064)):
       ```rust
       let prev_hwnd = LAST_FG_HWND.swap(0, Ordering::SeqCst);
       if prev_hwnd != 0 {
           unsafe {
               let fg = GetForegroundWindow();
               if fg.0.is_null() || (flyout_hwnd_raw != 0 && fg.0 as isize == flyout_hwnd_raw) {
                   let _ = SetForegroundWindow(HWND(prev_hwnd as *mut _));
               }
           }
       }
       ```
       Ketika user klik ke jendela aplikasi baru di luar flyout, pada transisi klik-luar Windows kadang membuat `GetForegroundWindow()` bernilai `NULL` sesaat (`fg.0.is_null()`) sementara proses target sedang mengaktifkan jendelanya. Karena cabang `if fg.0.is_null()` bernilai `true`, `hide_taskbar_flyout()` memanggil `SetForegroundWindow(prev_hwnd)` yang mencuri fokus kembali ke jendela lama (`prev_hwnd`) dan menggagalkan klik user ke jendela baru.

---

### 14. `T04-06` | `sync_navbar_bounds` tidak mendeteksi hotplug/unplug monitor saat `has_secondary` tetap true dan memicu flicker saat pindah monitor
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. **Skenario (a) Hotplug/unplug monitor ke-3 (`2 <-> 3` monitor)**: Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L2010-L2017):
     ```rust
     let has_secondary = app
         .webview_windows()
         .keys()
         .any(|k| k.starts_with("navbar_secondary_"));
     mode_changed = !prev_mode.eq_ignore_ascii_case(mode);
     if mode_changed || (is_all && !has_secondary) || (!is_all && has_secondary) {
         sync_secondary_navbar_windows(&app, is_all);
     }
     ```
     Saat mode `"all"` aktif pada 2 monitor, `navbar_secondary_1` sudah ada sehingga `has_secondary == true`. Ketika monitor ke-3 dicolokkan (`2 -> 3` monitor), atau ketika 1 dari 3 monitor dicabut (`3 -> 2` monitor), `mode_changed` bernilai `false`, `is_all` bernilai `true`, dan `has_secondary` tetap `true`! Akibatnya `sync_secondary_navbar_windows` **tidak pernah dipanggil**: pada `2 -> 3` monitor, `navbar_secondary_2` tidak pernah dibuat; pada `3 -> 2` monitor, `navbar_secondary_2` menjadi jendela yatim karena `resolve_target_monitor_for_window` ([navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1932)) mengembalikan `None` dan jendela tersebut tidak dihancurkan. Selain itu, handler `WindowEvent::ScaleFactorChanged` ([navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1498-L1500)) dan `WindowEvent::Resized` ([navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1501-L1516)) pada navbar juga tidak memanggil `sync_secondary_navbar_windows` (berbeda dengan jendela `"main"` di [lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L4845-L4847) yang memanggil `sync_all_displays_windows`).
  2. **Skenario (b) Dua kali `SetWindowPos` berurutan saat pindah monitor**: Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L2129-L2148), ketika `cur_mon != target_mon` dan posisi dock adalah `"bottom"`, kode memanggil `SetWindowPos` pertama ke `(mon_pos.x, mon_pos.y, phys_w, phys_h)` (pojok kiri-atas monitor baru dengan `SWP_SHOWWINDOW`!), lalu langsung memanggil `SetWindowPos` kedua ke `(phys_x, phys_y, phys_w, phys_h)` (bagian bawah monitor). Lebih buruk lagi, jika monitor lama dan monitor baru memiliki DPI berbeda, `phys_w` dan `phys_h` dihitung memakai `scale_factor` monitor baru, lalu ketika `SetWindowPos` pertama memindahkan HWND lintas monitor, Windows mengirim `WM_DPICHANGED` yang kembali mengubah ukuran jendela sebelum `SetWindowPos` kedua selesai.

---

### 15. `T04-07` | Deteksi fullscreen `navbar_window.rs` gagal pada borderless ber-frame, memantul saat fokus Gili, dan tertunda hingga 1.5 detik pada F11/Alt+Enter
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. **Skenario (a) Gagal pada aplikasi/game fullscreen yang masih memiliki bit `WS_CAPTION` / `WS_THICKFRAME`**: Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L672-L681):
     ```rust
     let style = GetWindowLongW(fg, GWL_STYLE) as u32;
     let has_frame = (style & (WS_CAPTION.0 | WS_THICKFRAME.0)) != 0;
     ...
     covers_full_monitor && !has_frame
     ```
     Banyak game modern (Unreal Engine, Unity, DX12 borderless windowed) dan pemutar media memperbesar ukuran `win_rect` hingga menutupi seluruh `rcMonitor` (atau lebih besar sehingga bingkai berada di luar layar) tanpa menghapus bit `WS_THICKFRAME` / `WS_CAPTION` dari `GWL_STYLE`. Karena syarat `!has_frame`, `is_fullscreen_app_covering_navbar` selalu mengembalikan `false` untuk aplikasi-aplikasi tersebut, sehingga dock Gili (jika auto-hide mati) tetap menimpa game fullscreen. (Bandingkan dengan `is_foreground_window_fullscreen` untuk notch di `lib.rs` yang jauh lebih lengkap).
  2. **Skenario (b) Penundaan hingga 1.5 detik (`60 * 25 ms`) saat tekan `F11` / `Alt+Enter`**: Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1267-L1270):
     ```rust
     let fs_due = fg_raw != state.last_fs_fg_hwnd
         || desktop_zcheck_due
         || (near_edge && tick.is_multiple_of(16))
         || tick.is_multiple_of(60);
     ```
     Saat user menekan `F11` di browser atau `Alt+Enter` di dalam game yang sudah aktif di foreground, `fg_raw` tidak berubah (`fg_raw == state.last_fs_fg_hwnd`). Jika kursor tidak berada di dekat tepi dock (`!near_edge`), pengecekan `is_fullscreen_app_covering_navbar` hanya dijalankan setiap `tick.is_multiple_of(60)` pada loop tidur `25 ms` (`60 * 25 ms = 1500 ms`), meskipun `backdrop_win_event_proc` sudah menerima `EVENT_OBJECT_LOCATIONCHANGE` (yang hanya menyetel `OVERLAP_RECHECK_NEEDED`, bukan flag fullscreen check).
  3. **Skenario (c) Memantul keluar dari mode fullscreen saat membuka `taskbar_flyout` / jendela Gili**: Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L644-L650), `is_fullscreen_app_covering_navbar` langsung mengembalikan `false` jika `!is_external_user_window(fg)` (yang menolak semua HWND milik PID Gili sendiri di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L500)). Akibatnya, begitu user menekan tombol `Win` atau `Win+A` untuk membuka `taskbar_flyout` saat bermain game fullscreen, `fg` berpindah ke `taskbar_flyout` (PID Gili), `is_fullscreen_app_covering_navbar` langsung bernilai `false`, dan navbar muncul kembali menimpa layar fullscreen.

---

### 16. `T04-08` | `EVENT_OBJECT_REORDER` memicu burst `HWND_TOPMOST` yang menimpa menu konteks desktop dan memanggil `SW_RESTORE` sinkron dari background thread
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L503-L505), setiap event `EVENT_OBJECT_REORDER` dari jendela top-level mana pun di sistem memanggil `crate::navbar_window::request_desktop_zorder_check()` yang menyetel `DESKTOP_ZORDER_CHECK_NEEDED = true`.
  2. Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1244-L1257):
     ```rust
     let desktop_zcheck_due = DESKTOP_ZORDER_CHECK_NEEDED.swap(false, Ordering::AcqRel);
     let fg_is_desktop = is_desktop_shell_class(fg);
     let fg_switched_to_desktop = (fg_changed && fg_is_desktop) || desktop_zcheck_due;
     ...
     if fg_switched_to_desktop {
         state.desktop_reassert_ticks = 16;
     }
     ```
     Perhatikan bahwa `fg_switched_to_desktop` bernilai `true` setiap kali `desktop_zcheck_due` bernilai `true` (yaitu pada **setiap** `EVENT_OBJECT_REORDER` di sistem, termasuk saat menu konteks `#32768` atau popup muncul!).
  3. Ketika user mengklik kanan pada area desktop (`fg_is_desktop == true`) di dekat dock/notch, pembukaan menu konteks desktop memicu `EVENT_OBJECT_REORDER` -> `desktop_zcheck_due = true` -> `state.desktop_reassert_ticks = 16`. Pada tick berikutnya (`15, 10, 5, 0` serta saat `desktop_zcheck_due` itu sendiri di baris 1300-1303), `reassert_overlay_above_desktop` dipanggil dengan `force_burst = true` yang mengeksekusi `SetWindowPos(hwnd, HWND_TOPMOST, ...)` ([navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1160-L1170)), sehingga jendela navbar (yang tingginya mencakup `overhead = 380px` di atas dock!) diangkat ke puncak Z-order `HWND_TOPMOST` di atas menu konteks desktop `#32768`.
  4. Selain itu, di `restore_if_minimized_hwnd` ([navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1106-L1139)), thread background watcher memanggil `ShowWindow(hwnd, SW_SHOWNOACTIVATE)` dan `ShowWindow(hwnd, SW_RESTORE)` secara sinkron pada HWND milik UI thread utama Tauri (dan di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1501-L1515), `WindowEvent::Resized` di UI thread juga memanggil `reassert_overlay_above_desktop` secara reentrancy saat `WM_SIZE` sedang diproses).

---

### 17. `T04-09` | `backdrop_blur.rs` dan `composition_backdrop.rs` tanpa penanganan Battery Saver, Transparency Effects OS, Sleep/Wake, Device Loss, serta risiko loop `GetMessageW`
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Penilaian Keparahan**: `TINGGI`
- **Bukti Verifikasi Langsung**:
  1. **Risiko infinite spin loop `GetMessageW(...).as_bool()` saat mengembalikan `-1`**: Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L561) (serta pola identik di [taskbar_hotkey.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_hotkey.rs#L380), [taskbar_manager.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/taskbar_manager.rs#L483), dan [window_preview.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/window_preview.rs#L1164)), loop pesan ditulis sebagai:
     ```rust
     while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
     ```
     Dalam crate `windows`, `GetMessageW` mengembalikan `BOOL(i32)` di mana `BOOL::as_bool()` didefinisikan sebagai `self.0 != 0`. Menurut dokumentasi Win32, `GetMessageW` mengembalikan `-1` apabila terjadi error. Karena `-1 != 0`, `.as_bool()` mengevaluasi `-1` sebagai `true` dan berputar tanpa batas membakar 100% 1 core CPU.
  2. **Bug `slot.visible` tidak pernah pulih setelah parent sempat `!IsWindowVisible`**: Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L751-L758):
     ```rust
     if slot.visible {
         if !IsWindowVisible(parent).as_bool() {
             let _ = ShowWindow(HWND(slot.underlay_hwnd as *mut c_void), SW_HIDE);
             slot.visible = false;
         } else if !IsIconic(parent).as_bool() { ... }
     }
     ```
     Ketika jendela parent (`main` atau `navbar`) disembunyikan sementara oleh Win32 (`!IsWindowVisible(parent)`) tanpa mengirim `AcrylicCommand::SetHidden`, worker thread menyembunyikan underlay dan menyetel `slot.visible = false`. Ketika `parent` ditampilkan kembali (`IsWindowVisible(parent) == true`), tidak ada kode di loop pemeliharaan (baris 739-791) yang memulihkan `slot.visible` kembali ke `true` kecuali frontend kebetulan mengirim `AcrylicCommand::Sync` baru! Selama tidak ada `Sync` baru, underlay acrylic hilang permanen.
  3. **Tanpa penanganan Device Loss / Sleep-Wake pada `Compositor` & `ID2D1Factory`**: Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L613-L615), `compositor` dan `d2d_factory` hanya dibuat **satu kali** saat thread `gili-native-dwm-acrylic` mulai hidup. Ketika sistem keluar dari Sleep/Hibernate, driver GPU di-reset (TDR), atau DWM restart, `refresh_backdrop` ([backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L356-L407)) hanya mencoba membuat ulang brush pada `compositor` lama yang sudah invalid tanpa pernah membuat ulang `Compositor` atau `DesktopWindowTarget`.
  4. **Tanpa penghormatan terhadap Battery Saver / Transparency Effects OS**: Baik di `backdrop_blur.rs` (yang terus memutar siklus `refresh_backdrop` setiap 650 ms di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L804) selama ada slot visible) maupun di `composition_backdrop.rs`, tidak ada pemeriksaan status Battery Saver atau setting `EnableTransparency` (`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`).
  5. **Pemanggilan berulang `CreateDispatcherQueueController` di `composition_backdrop.rs`**: Di [composition_backdrop.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/composition_backdrop.rs#L133-L138), `CompositionRoundedBackdrop::attach` selalu memanggil `CreateDispatcherQueueController(dq_opts)?` untuk `DQTYPE_THREAD_CURRENT` tanpa memeriksa apakah thread saat ini sudah memiliki `DispatcherQueue` (`DispatcherQueue::GetForCurrentThread()`), dan menyimpan `_dq_controller` per instance struct sehingga jika satu instance di-drop sementara instance lain di thread yang sama masih aktif, controller thread tersebut ikut terdampak.
