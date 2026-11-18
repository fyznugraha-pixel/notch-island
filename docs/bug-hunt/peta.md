# Peta Sistem Aplikasi Gili (Baseline Bug Hunt)

- **Branch Kerja:** `bug-hunt` (berawal dari commit `fefe3d0`, tag aman: `pre-bug-hunt`)
- **Perubahan Working Tree Pra-Audit (Dipertahankan):** `src-tauri/src/lib.rs`, `src/App.tsx`
- **Versi Tercatat:** `5.1.1` (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `AppxManifest.xml` `5.1.1.0`)
- **Total Komponen Terpetakan:** `291` file frontend (`src/`, `4.07 MB`), `41` file backend Rust (`src-tauri/src/`, `1.27 MB`), `197` `#[tauri::command]`, `40` modul katalog taskbar + `7` modul builtin, `7` jenis jendela WebView2, `4` berkas Worker proxy (`gili-free-proxy/`).
- **Observasi Baseline Lingkungan:**
  - `dist/`: `373` file (`9.00 MB` / `9.437.104` byte)
  - `public/`: `154` file (`6.03 MB` / `6.323.271` byte; `logo/` `2.31 MB`, `assets/` `1.59 MB`, `azan2.mp3` `558 KB`, `qris-support.png` `416 KB`, `logo-greating.mp4` `372 KB`, `gili-greating-light.mp4` `315 KB`)
  - Proses aktif teramati saat survei awal (`Get-CimInstance Win32_Process`): ditemukan proses `msedgewebview2.exe` yang berjalan di sistem saat sesi observasi (tidak menjalankan aplikasi uji interaktif penuh di desktop nyata dalam tahap pemetaan awal).

---

## 1. Arsitektur Jendela WebView2 (Entry Router: `src/main.tsx`)

| Jendela (`label`) | Komponen Akar (`src/main.tsx`) | Ukuran & Sifat (`tauri.conf.json` / Rust) | Lifecycle |
|---|---|---|---|
| `main` | `App` | `820x460`, transparan, `always_on_top`, tanpa dekorasi | Aktif permanen saat app berjalan |
| `notch_secondary_1..4` | `App` (`isSecondaryWindow=true`) | `820x460`, transparan, `WS_EX_NOACTIVATE` / click-through | On-demand saat monitor target = `"all"` / >1 monitor |
| `navbar` & `navbar_secondary_1..4` | `NavbarApp` | Selebar monitor x ~`260..460px`, transparan, `WS_EX_TOOLWINDOW` | Dibuat `+20ms` saat startup bila fitur taskbar aktif & berlisensi |
| `taskbar_flyout` | `TaskbarFlyoutApp` | `260x300` s/d `740x700` dinamis, transparan, `always_on_top` | Dibuat *on-demand* saat klik/hotkey, otomatis `win.destroy()` setelah `90` detik idle (`FLYOUT_IDLE_DESTROY_SECS`) |
| `miniplayer` | `MiniPlayerApp` | `440x130` (bar) / `380x340` (card) * textScale, transparan | On-demand saat detach dari notch, `win.hide()` lalu `win.destroy()` setelah `300` detik idle (`MINIPLAYER_IDLE_DESTROY_SECS`) |
| `settings` | `SettingsWindowApp` | `860x600` (min `680x480`), non-transparan, shadow | On-demand ketika user membuka Settings terpisah |
| `lyrics_share` | `LyricsShareWindowApp` | `840x590` (min `700x500`), non-transparan, shadow | On-demand dari menu Share Lyrics |

Semua jendela berbagi argumen Chromium terpusat `WEBVIEW_BROWSER_ARGS` (`src-tauri/src/lib.rs:3-4` & `src-tauri/tauri.conf.json:28`): `--autoplay-policy=no-user-gesture-required --force-gpu-mem-available-mb=48 --gpu-program-cache-size-kb=4096 --disable-gpu-shader-disk-cache`.

---

## 2. Fitur UI: Notch, Panel Produktivitas, Settings & Taskbar

### A. Panel & Kartu Notch (`src/App.tsx`, `src/services/tabConfigService.ts`)
- **13 tab yang dapat dikelola (`ManageableTabId`) + `settings`:**
  1. `media_expanded` (`MediaExpandedPanel`, `MediaQueueView`, `LyricsView`)
  2. `quick_control` (`ControlCenterPanel`, `WifiSubmenu`, `BluetoothSubmenu`)
  3. `ai_chat` (`AiChatPanel` dan subkomponen `src/components/ui/aichat/*`)
  4. `todo` (`TodoListPanel`, `TodoCalendarView`)
  5. `mini_note` (`MiniNotePanel`)
  6. `drop_shelf` (`DropShelfPanel`, `DropShelfTransferModal`, `DropShelfSettingsView`, `DropShelfReceivedBanner`)
  7. `pomodoro` (`PomodoroPanel`)
  8. `water_reminder` (`WaterReminderPanel` & subkomponen `src/components/ui/water/*`)
  9. `prayer_reminder` (`PrayerReminderPanel` & subkomponen `src/components/ui/prayer/*`)
  10. `sys_monitor` (`SystemMonitorPanel`)
  11. `clipboard` (`ClipboardPanel`)
  12. `volume_mixer` (`VolumeMixerPanel`, `AudioOutputPanel`)
  13. `notif_center` (`NotificationCenterPanel`)
- **Kartu cepat & mode idle:** `IdleLayoutSetting` (`IdleSlotView`), `IdleLyrics`, `IdleMascot`, `QuickTodoNotchCard`, `QuickNotePanel`, `QuickAiChatNotchCard`, `GreetingNotification`, `WaterNotchToast`, `PrayerNotchToast`, `NotchNotifications`.
- **Auto-reset tab idle:** `TAB_IDLE_RESET_MS = 5 * 60 * 1000` mengarahkan pembukaan notch ke `media_expanded` saat musik aktif atau ke `quick_control` bila tidak.

### B. Taskbar Dock (`src/components/navbar/*`) & Taskbar Flyout (`src/components/taskbarFlyout/*`)
- **Komponen dock builtin (7 default di `DEFAULT_NAVBAR_MODULES`):** `startSearch` (`StartSearchGroup`), `pinnedApps` (`PinnedAppsGroup`, `WindowPreviewCard`, `AppContextMenu`), `runningApps`, `hiddenTray` (`SystemTrayGroup`), `systemIcons`, `notifications`, `clockDate`.
- **40 Modul Katalog (`src/modules/modules.catalog.json`) & Pemetaan Komponen (`moduleComponents.ts`, `moduleAliases.ts`):**
  - *Produktif:* `acara_berikutnya`, `to_do_fokus`, `pomodoro`, `catat_cepat`, `clipboard`, `water_tracker`, `kalender_mini`, `streak_kebiasaan`, `tangkap_layar`, `peluncur_cepat`, `hitung_mundur`, `kalkulator_konverter`, `waktu_layar`, `jadwal_kelas`, `text_snippet`, `drop_zone_mini`.
  - *Sistem:* `pantau_sistem`, `jaringan`, `baterai_daya`, `output_audio`, `desktop_virtual`, `mode_fokus`, `gpu_suhu`, `penyimpanan`, `privasi_kamera_mic`, `mixer_suara`, `baterai_perangkat`, `hotspot_vpn`.
  - *Media & Estetika:* `sedang_diputar`, `cuaca`, `jam_dunia`, `visualizer`, `kontrol_media`, `kutipan_harian`, `suara_ambient`, `progres_hari`.
  - *Gaya Hidup:* `waktu_sholat`, `kualitas_udara`, `check_in_mood`, `istirahat_mata`.
  - *Catatan bundel:* `SystemExtraModules` (7 modul), `ProductivityExtraModules` (7 modul), `MediaLifestyleExtraModules` (4 modul), dan `MixerNavbarModule` (2 modul) digabung dalam 4 barrel chunk.
- **6 Target Flyout (`TaskbarFlyoutApp`):** `start` (`StartMenuView`), `search` (`SearchView`), `tray` (`TrayFlyoutView`), `quickSettings` (`QuickSettingsView`), `volume` (`SoundOutputMixerView`), `notificationsCalendar` (`NotificationsCalendarView`).
- **4 Popover Inline (`src/components/navbar/popovers/*`):** `NavbarStartLauncherFlyout`, `NavbarControlCenterFlyout`, `NavbarNotificationsFlyout`, `NavbarCalendarFlyout`, ditambah `NavbarPopoverShell`.

### C. Pengaturan & Kustomisasi (`src/components/settingsWindow/*` & `src/components/ui/settings/*`)
- **Settings Window & Panel Notch:** `GeneralTab`, `AppearanceTab`, `IdleTab`, `TabsManagerView`, `ModulesTab`, `AdvancedTab`, `MonitorSelector`, `KeyboardShortcutsCard`, `TransparencyControlSection`, `NavbarSettingsTab` (`NavbarLookCard`, `NavbarPositionCard`, `NavbarShapeCard`, `NavbarBehaviorCard`, `NavbarIconThemeCard`, `NavbarModulesOrderCard`, `AddModuleDialog`, `NavbarPresetsModal`, `NavbarLivePreview`), `AboutView`, `SupportView`.

---

## 3. Backend Rust, Integrasi Windows & Proses Latar (`src-tauri/src/`)

Total **41 file sumber** dengan **197 endpoint `#[tauri::command]`** yang terdaftar di `invoke_handler` (`src-tauri/src/lib.rs:4538-4710`):
- **Core App, SMTC, Clipboard, OCR & AI HTTP (`lib.rs`):** loop polling SMTC media & album cover (`256px` JPEG/PNG), loop hit-test kursor & desktop Z-order guard, loop ICMP ping (`8.8.8.8`), watcher `UserNotificationListener` / Clipboard / CapsLock, watcher koneksi Bluetooth, OCR Windows Media.Ocr, HTTP proxy `ai_http_request` & streaming `ai_http_stream`, `fetch_external_lyrics_api`.
- **Integrasi Shell & Taskbar Windows:**
  - `taskbar_manager.rs`: menyembunyikan & memulihkan `Shell_TrayWnd` / `Shell_SecondaryTrayWnd`.
  - `taskbar_safety.rs`: watchdog out-of-process / pemulihan taskbar darurat bila proses crash/kill & kill switch.
  - `taskbar_hotkey.rs`: low-level keyboard hook (`WH_KEYBOARD_LL`) untuk `Win` solo, `Win+N/A/B/S`, `Win+Ctrl+V`, kill switch `Ctrl+Alt+Shift+Backspace`.
  - `shell_surface_toggle.rs`: pencegahan konflik / handoff dengan Start/Search/QuickSettings native Explorer.
  - `windows_pinned_apps.rs`, `windows_app_indexer.rs`, `windows_start_search.rs`: enumerasi Taskband, `.lnk`, UWP AUMID, Start Menu index, recent files.
  - `windows_tray_overflow.rs`, `tray_apps.rs`: integrasi UI Automation system tray & proses background tray.
- **Window, Backdrop, Preview & Animasi:** `navbar_window.rs`, `backdrop_blur.rs` (`EVENT_SYSTEM_FOREGROUND`, `EVENT_SYSTEM_MINIMIZESTART`, `EVENT_OBJECT_REORDER`, DWM acrylic worker), `composition_backdrop.rs`, `window_backdrop.rs`, `window_dock_anim.rs`, `window_preview.rs` (DWM thumbnail / `PrintWindow` GDI capture), `taskbar_flyout.rs`, `miniplayer_window.rs`, `lyrics_share.rs`.
- **Hardware, Telemetri & Kontrol Sistem:** `shared_sampler.rs` (`gili-shared-sampler` condvar worker), `system_monitor.rs`, `system_hardware.rs` (storage, virtual desktop Win32 COM, VPN), `gpu_telemetry.rs` (WMI / PDH GPU), `privacy.rs` (`MFCreateSensorActivityMonitor`, WASAPI mic, registry webcam/mic), `audio_endpoints.rs` (CoreAudio default output & spatial audio), `connectivity.rs` (Wi-Fi Native/WLAN, Bluetooth Radio, Mobile Hotspot WinRT), `system_quick_state.rs` (Night Light registry CloudStore LEB128, Battery Saver, Airplane mode, accessibility URI), `accessibility_toggles.rs` (Color Filter, High Contrast, Narrator, Magnifier, dll.), `windows_dnd.rs`, `toast_banners.rs`, `memory_optimizer.rs` (`K32EmptyWorkingSet` periodik `300s`).
- **Server Transfer Lokal & Store Media:** `shelf_server.rs` (`tiny_http` LAN file send/receive HTML UI + upload/download), `media_lyrics_store.rs`, `app_icon.rs`, `migration.rs`, `taskbar_logger.rs`, `install_repair.rs`.

---

## 4. Jalur Data, Penyimpanan Rahasia, Proxy & Updater

- **Persistensi Lokal:**
  - `@tauri-apps/plugin-store`: `settings.json` (preferensi notch, navbar config, tabs preferences, i18n) dan `shelf.json` (`shelfService.ts`).
  - `localStorage`: >45 kunci (`island_*`, `gili_*`, `notch_lyrics_*`) untuk sinkronisasi cepat antar jendela serta histori chat AI, clipboard, to-do, water, dan posisi panel.
  - Disk cache Rust: temporary clipboard images (`gili_clipboard_images`), file diterima File Shelf, cache ikon/lirik/thumbnail SMTC (`HashMap`).
- **Sinkronisasi Multi-Window:** `BroadcastChannel("gili_navbar_sync_channel")`, storage events, dan IPC `broadcast_settings_sync` -> `gili-settings-sync`.
- **Penyimpanan Rahasia & Lisensi:**
  - `ai_credentials.rs` (`CredWriteW` / `CredReadW` / `CredDeleteW` Windows Credential Manager dengan prefix provider & model) + `aiCredentialService.ts`.
  - `store_license.rs` (`Services_Store` MSIX StoreContext + state cache disk) + `taskbarProService.ts`.
  - `gili-free-proxy/` (Cloudflare Worker + D1 `schema.sql` / `quota.ts`) dan `src/services/giliFreeService.ts`.
- **Build, CI & Updater:**
  - `src-tauri/tauri.conf.json` (`plugins.updater.pubkey` minisign & endpoint GitHub Releases `latest.json`), `src/services/updateService.ts`, `scripts/build-signed.js`, `.github/workflows/release.yml`, `src-tauri/capabilities/default.json` (CSP & permission 16 target/pattern jendela).

---

## 5. Pembagian Tugas Audit Sub-Agen (`T01` s/d `T14`)

1. **Gelombang 1 (Backend, Keamanan, Windows Shell, Kondisi Sistem):** `T01` (Backend & IPC), `T02` (Keamanan, Rahasia & Updater), `T03` (Integrasi Sistem Windows, Hook & Pemulihan State), `T04` (Multi-Monitor, DPI, Transparansi & Fullscreen).
2. **Gelombang 2 (Seluruh UI & Modul):** `T05` (Inti Notch & Control Center), `T06` (Taskbar Dock, Flyout & Popover), `T07` (Modul Taskbar Sistem, Media & Gaya Hidup), `T08` (Modul & Panel Produktivitas).
3. **Gelombang 3 (Data, Media, AI, Data Pengguna):** `T09` (Data, Pengaturan, Migrasi & Sinkronisasi), `T10` (Media, Lirik, Mini Player & Lyrics Share), `T11` (AI Chat, Router Model, Biaya & Privasi), `T12` (Notifikasi, Clipboard, File Shelf).
4. **Gelombang 4 (Kinerja, Aksesibilitas & Rilis):** `T13` (Kinerja, Memori, Handle & CPU Idle), `T14` (Aksesibilitas, Build, CI, Updater & Versi).
