# Audit Repositori Gili untuk Sistem Widget Desktop Native (Direct2D)

Dokumen ini mencatat hasil penelusuran repositori Gili (branch `widgets-native`, baseline tag `pre-widgets` pada commit `8bc3c4d`) sebelum pembangunan crate `gili-widgets`. Prinsip utama: **Satu Sumber Data, Dua Tampilan** (ringkas di taskbar/notch, besar di desktop) tanpa menduplikasi logika bisnis.

---

## 1. Token Desain Eksisting

- **Warna & Permukaan**:
  - `src/types/navbar.ts` mendefinisikan mode tampilan `solid`, `liquid`, dan `followNotch` dengan latar `black`, `followNotch`, atau `custom`, radius default `15px`, aksen default `#3882F6`, serta `opacity` (15-100%) dan `blur` (0-100).
  - `src/components/standby/standbyTheme.ts` mendefinisikan palet OLED gelap (`#000000`, teks utama `#f5f5f7`, teks sekunder `#a8a8b3`, aksen merah malam `#ff453a` / `#ff6961`, batas garis halus `rgba(255,255,255,0.12)`).
  - `src/modules/modules.catalog.json` memakai warna kategori: Produktif `#3882F6`, Sistem `#34c3a0`, Media & estetika `#ec4899`.
  - `src/services/noteUtils.ts` mendefinisikan palet catatan: `blue` `#3882F6`, `mint` `#5EEAD4`, `amber` `#FBBF24`, `coral` `#F87171`.
- **Tipografi**:
  - Aplikasi memakai `Inter` (`@fontsource/inter`) di WebView dan font sistem Windows. Untuk renderer native DirectWrite di desktop, dipakai **Segoe UI Variable** (fallback ke Segoe UI bila tidak terpasang) dengan fitur angka tabular (`tnum`) dan anti-aliasing `D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE` di atas surface transparan.
- **Efek Kaca / Komposisi**:
  - `src-tauri/src/composition_backdrop.rs` dan `src-tauri/src/backdrop_blur.rs` sudah memakai `windows::UI::Composition` + `Direct2D` (`CLSID_D2D1GaussianBlur`) dan `DwmSetWindowAttribute` (`window_backdrop.rs`).
  - `src/utils/frostedGlass.ts` menyediakan preset optik kaca (`subtle`, `medium`, `heavy`) yang menjadi acuan visual mode Kaca dan Tint Tipis pada widget desktop.

---

## 2. Pemetaan Sumber Data Eksisting ke 29 Widget Desktop

| No | Widget Desktop | Sumber Data Eksisting di Gili | Status & Strategi Reuse |
|---:|---|---|---|
| 1 | Kalender bulan + agenda | `EventNavbarModule.tsx` (`localStorage`: `gili_navbar_events_v1`) | Reuse lewat snapshot bridge + mirror ke file APPDATA |
| 2 | Jadwal kuliah mingguan | `ClassScheduleNavbarModule.tsx` (`localStorage`: `gili_class_schedule_v1`) | Reuse + tambah field opsional `day` (0-6) kompatibel mundur |
| 3 | Heatmap kebiasaan | `StreakNavbarModule.tsx` (`localStorage`: `gili_habit_streak_v2` hanya menyimpan `{ title, count, lastCheckedDate }`) | Tambah riwayat harian `history: Record<string, number>` dengan migrasi kompatibel mundur |
| 4 | Performa sistem | `src-tauri/src/shared_sampler.rs`, `system_monitor.rs`, `gpu_telemetry.rs` | Reuse langsung di Rust; tambah sampling per-core CPU dan disk |
| 5 | Now Playing + lirik | `src-tauri/src/media_lyrics_store.rs` (`CURRENT_MEDIA`, `CURRENT_LYRICS`), `src/services/lyrics/` | Reuse penuh dari store backend; tidak menambah sumber lirik baru |
| 6 | Cuaca (sekarang, jam, 5 hari) | `src/services/weatherService.ts` (Open-Meteo `api.open-meteo.com`, `get.geojs.io`, cache `island_cached_weather_data`) | Reuse lokasi & provider Open-Meteo; tambah endpoint hourly + daily 5 hari via backend |
| 7 | To-do dengan grup | `src/services/todoUtils.ts` (`island_todo_list`) | Reuse data tugas; tambah field opsional `group` kompatibel mundur |
| 8 | Drop Zone | `src/services/shelfService.ts` (`shelf.json`, `island_drop_shelf`) & `src-tauri/src/shelf_server.rs` | Reuse langsung daftar berkas dari `shelf.json` |
| 9 | Catatan tempel | `src/services/noteUtils.ts` (`gili_mini_notes_v2`, mendukung `color` dan `checklist`) | Reuse langsung + editor Win32 native di atas widget |
| 10 | Kanban mini 3 kolom | Belum ada di Gili | Buat penyimpanan lokal baru di `gili-widgets` |
| 11 | Pelacak waktu proyek | Belum ada di Gili (hanya Pomodoro di `pomodoroService.ts`) | Buat provider lokal baru + ekspor CSV |
| 12 | Status situs | Belum ada di Gili | Buat provider HTTP HEAD/GET via `ureq` (interval min 60 dtk, allowlist domain, timeout) |
| 13 | Status GitHub | Belum ada di Gili | Buat provider REST API GitHub dengan ETag/If-None-Match + token di Windows Credential Manager |
| 14 | Pintasan (app/folder/link) | `QuickLauncherNavbarModule.tsx` (lokal) | Buat provider lokal + ekstrak ikon native `IShellItemImageFactory` ber-cache |
| 15 | File terbaru | Belum ada di Gili | Buat pemindai folder opt-in (daftar pengecualian, hanya metadata, tidak membaca isi) |
| 16 | Proses teratas (Top 5) | `system_monitor.rs` (baru menyimpan 1 `top_process`) | Perluas di Rust menjadi 5 proses baca-saja (CPU & RAM, tanpa tombol akhiri proses) |
| 17 | Kontrol cepat | `connectivity.rs` (Wi-Fi & Bluetooth WinRT `Radio`), `audio_endpoints.rs` (WASAPI), `system_quick_state.rs` | Hanya tampilkan toggle dengan API publik stabil: Wi-Fi, Bluetooth, Mode Gelap (Themes\Personalize), Bisukan Audio. Sembunyikan Night Light / WNF tak berdokumen |
| 18 | Peta penyimpanan (treemap) | `StorageNavbarModule.tsx` (hanya total/free per drive) | Tambah pemindai folder on-demand prioritas rendah, kedalaman terbatas, ber-cache |
| 19 | Jam bergaya (8 gaya) | Lokal sistem (`Local` / Win32 `GetLocalTime` & `GetSystemTime`) | Baru di `gili-widgets` (8 gaya termasuk tipografi kata Bahasa Indonesia) |
| 20 | Bingkai foto/polaroid | Belum ada di Gili | Baca-saja dari folder pilihan pengguna, baca orientasi EXIF, cache thumbnail |
| 21 | Maskot hidup | Belum ada aset sprite orisinal di repo | Buat karakter orisinal sederhana (Kepiting Gili / Gili Spirit) berbasis vektor Direct2D + catat kebutuhan aset desainer |
| 22 | Visualizer | `MediaLifestyleExtraModules.tsx` (saat ini hanya bar acak saat `is_playing`, belum WASAPI loopback) | Implementasikan WASAPI loopback (`AUDCLNT_STREAMFLAGS_LOOPBACK`) + FFT ringan ter-throttle di Rust |
| 23 | Poster kutipan tipografi | `KutipanHarianNavbarModule.tsx` (`QUOTES` & `gili_quote_daily_v1`) | Reuse daftar kutipan + dukungan teks sendiri |
| 24 | Jadwal sholat | `src/services/prayerService.ts` | Implementasikan kalkulator astronomis offline metode Kemenag RI (Subuh 20 derajat, Isya 18 derajat) di Rust + verifikasi kota resmi |
| 25 | Kurs & harga emas | `src/services/currencyService.ts` (`open.er-api.com/v6/latest/USD`, cache 12 jam). Harga emas belum ada provider berlisensi | Reuse `open.er-api.com` untuk kurs (atribusi & cache). Harga emas memakai antarmuka provider (kosong / butuh API berlisensi) |
| 26 | Kalender hijriyah + libur | `prayerService.ts` (hijriyah dari API). Berkas libur SKB 3 Menteri belum ada | Konversi hijriyah offline (+/-1 hari) + pemuat berkas JSON SKB 3 Menteri (tanpa tanggal karangan; status "Belum tersedia" bila berkas kosong) |
| 27 | Catat pengeluaran cepat | Belum ada di Gili | Penyimpanan lokal terenkripsi Windows DPAPI (`CryptProtectData`/`CryptUnprotectData`), nol telemetri |
| 28 | Papan skor bola | Belum ada di Gili | Antarmuka provider saja + state kosong ramah (tidak ada API gratis tanpa batas lisensi/scraping yang dapat diasumsikan) |
| 29 | Tanya cepat AI | `src/services/aiRouterService.ts`, `aiChatService.ts`, `src-tauri/src/ai_credentials.rs` | Reuse router & BYOK yang ada via bridge; API key tetap di Credential Manager dan tidak pernah ditampilkan |

---

## 3. Penyimpanan Pengaturan, Rahasia, dan Struktur Pengaturan Gili

- **Pengaturan**:
  - `tauri-plugin-store` (`settings.json`) untuk preferensi inti dan konfigurasi navbar.
  - Berkas JSON langsung di `%APPDATA%\com.faiz.gili\` (pola `standby_config.json` di `src-tauri/src/standby_window/mod.rs`). Konfigurasi widget desktop akan memakai berkas terversi `desktop_widgets_v1.json` dengan penulisan atomik (`temp file + rename`).
- **Penyimpanan Rahasia**:
  - `src-tauri/src/ai_credentials.rs` memakai Win32 `CredWriteW` / `CredReadW` / `CredDeleteW` (Windows Credential Manager, `CRED_TYPE_GENERIC`, prefix `GiliNotch/`). Token GitHub fine-grained read-only akan mengikuti pola identik dengan target `GiliNotch/DesktopWidget/github_pat`.
  - Data finansial lokal (pengeluaran) dienkripsi menggunakan Windows DPAPI (`CryptProtectData` / `CryptUnprotectData`) per-pengguna.
- **Struktur Halaman Pengaturan**:
  - `src/components/settingsWindow/SettingsSidebar.tsx` (`SIDEBAR_SECTIONS`) dan `src/components/settingsWindow/SettingsWindowApp.tsx` merender tab secara lazy. Tab baru `widgets` ("Widget Desktop") ditambahkan di samping tab yang ada tanpa mengubah tab lain.

---

## 4. Temuan Risiko dan Batasan Awal

1. **Kontrol Cepat**: `system_quick_state.rs` (Night Light, Battery Saver, Airplane Mode) dan `windows_dnd.rs` memakai kunci registry CloudStore dan WNF tak berdokumen. Sesuai aturan, widget Kontrol Cepat desktop hanya mengekspose kontrol berbasis API publik stabil (Wi-Fi, Bluetooth, Mode Gelap, Bisukan Audio).
2. **Performa Sistem (Field Sintetis)**: `src-tauri/src/system_monitor.rs` baris 321-346 menghasilkan estimasi sintetis untuk `cpu_cores`, `cpu_temp_c`, dan `gpu_*` dari total CPU. Crate `gili-widgets` tidak boleh memakai field sintetis tersebut: beban per-core CPU diambil asli dari `NtQuerySystemInformation(SystemProcessorPerformanceInformation)`, memori dari `GlobalMemoryStatusEx`, disk dari `GetDiskFreeSpaceExW`, serta GPU asli dari `gpu_telemetry.rs` (NVML/WMI).
3. **Visualizer**: Modul navbar saat ini belum menangkap audio WASAPI loopback. `gili-widgets` akan mengimplementasikan capture WASAPI loopback asli di Rust dengan throttle FFT.
4. **Sumber Data Eksternal Berlisensi**: Harga emas spot real-time, jadwal libur nasional SKB 3 Menteri tahun berjalan, dan papan skor bola tidak boleh dikarang. Ketiganya dibuatkan kontrak provider yang bersih serta state kosong/konfigurasi yang informatif.
