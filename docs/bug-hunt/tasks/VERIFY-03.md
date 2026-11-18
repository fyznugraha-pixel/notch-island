# Laporan Verifikasi Silang Independen - Batch 03 (VERIFY-03)

**Verifikator**: Sub-agen Independen `V03` (`VERIFY-03`)
**Metode**: Pembacaan langsung kode sumber asli (`src/`, `src-tauri/`) dan eksekusi skrip reproduksi mandiri (`tests/bug-hunt/V03_check.mjs`) tanpa membaca berkas laporan pemburu bug (`docs/bug-hunt/tasks/T*.md`).

---

## Tabel Ringkasan Verifikasi

| No | ID Temuan | Judul Temuan | Status Akhir | Keparahan Terverifikasi | Penanda Lingkungan |
|---|---|---|---|---|---|
| 1 | `T05-01` | `handleCloseImmediate` diblokir oleh `isSwitchingTabRef.current` selama 600-1200 ms saat buka atau pindah tab | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 2 | `T05-02` | Koneksi Wi-Fi terbuka (Open) yang belum tersimpan selalu gagal diam-diam tanpa pembuatan profil XML | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 3 | `T05-03` | Parsing `netsh` di `connectivity.rs` bergantung bahasa Inggris Windows, mengabaikan `State: connected` / `Hardware Off`, hanya membaca `stderr`, dan hardcode WPA2PSK/AES | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 4 | `T05-04` | Timer auto-dismiss notifikasi `1800ms` di `onMouseLeave` tidak tersimpan/dibatalkan sehingga menghapus notifikasi baru secara prematur | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 5 | `T05-05` | `ControlCenterPanel.onClose` dan `SettingsPanel.onClose` melewati `handleCloseImmediate()`, memicu reopen saat klik Snipping dan merusak reset 5 menit | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 6 | `T05-06` | Mode Dropdown `ControlCenterPanel` merender portal dan backdrop `fixed inset-0` ke `document.body` di luar `#notch-pill` | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 7 | `T08-01` | Lima modul produktivitas Taskbar terisolasi total dari panel dan layanan Notch (schema dan key `localStorage` berbeda) | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `KRITIS` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 8 | `T08-02` | `usePomodoro` memicu transisi ganda saat `autoStartNext` aktif + `completeAlert` direspons, `dailyStats` tidak rollover, dan `PomodoroNavbarModule` macet di `00:00` pasca-reload | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 9 | `T08-03` | `useTodoReminders` memicu bunyi/notifikasi ganda ketika snooze berakhir dan me-reset interval pada setiap render induk | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 10 | `T08-04` | Race condition async `playAdzanAudio` vs `stopAdzanAudio`, jadwal sholat gagal rollover saat reminder mati/Focus Mode, dan event tidak terkirim antar-jendela | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 11 | `T08-05` | `dateNlpParser` salah memotong angka kuantitas/persen/tahun sebagai jam serta menghapus teks waktu tidak valid | `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 12 | `T09-01` | `saveNavbarConfig` mengembalikan Promise sebelum `settings.json` disimpan (debounce 250ms tanpa flush) sehingga aktivasi/reset Taskbar batal | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 13 | `T09-02` | `settingsResetService.ts` gagal mereset 17+ key pengaturan/AI/cache (termasuk typo key DND/Muted), tidak mereset autostart OS, dan memicu race `opt_autostart` | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 14 | `T09-03` | `shortcutManager.applyAll` meng-unregister dan mencuri handler secara diam-diam saat dua aksi memiliki pintasan sama | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `SEDANG` (diturunkan dari `TINGGI` untuk UI normal karena ada guard `validateShortcut`, namun tetap `TINGGI` bila `settings.json` korup/manual) | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 15 | `T09-04` | `CustomColorPicker` (kedua versi) otomatis memekarkan input hex 3 digit pada ketikan ke-3 (`maxLength=6`) dan memblokir pengetikan kode 6 digit | `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 16 | `T10-01` | Click-through Mini Player memblokir scroll lirik manual, klik-seek baris lirik, dan double-click ganti mode di area tengah | `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`) | `KRITIS` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 17 | `T10-02` | Offset lirik di `LyricsView` tidak sinkron dengan Mini Player dan menimpa kalibrasi Mini Player | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 18 | `T10-03` | Scrubber `MediaExpandedPanel` dapat membuat `isSeeking` macet `true` permanen bila `releasePointerCapture` atau `smtc_seek` gagal | `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) | `TINGGI` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |

---

## Rincian Verifikasi Per Temuan

### 1. `T05-01` | `handleCloseImmediate` diblokir oleh `isSwitchingTabRef.current` selama 600-1200 ms saat buka atau pindah tab
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/App.tsx:1753-1754`:
    ```ts
    const handleCloseImmediate = useCallback((fromSync?: boolean) => {
      if (isSwitchingTabRef.current && !fromSync) return;
    ```
  - `setTabSwitchGrace(600)` dipanggil setiap kali membuka Notch lewat `openLastOrPreferredTab` (`src/App.tsx:1872`) dan setiap berpindah tab di `goToTab` (`src/App.tsx:2070`), serta `setTabSwitchGrace(1200)` saat `tray-open-control-center` (`src/App.tsx:4003`).
  - Fungsi `setTabSwitchGrace` (`src/App.tsx:1945-1955`) menyetel `isSwitchingTabRef.current = true` selama 600 ms atau 1200 ms.
  - Selama jendela waktu tersebut, semua pemanggil penutupan eksplisit oleh pengguna memanggil `handleCloseImmediate()` tanpa argumen (`fromSync = undefined`), sehingga langsung diabaikan oleh baris 1754:
    1. Menekan tombol `Escape` (`src/App.tsx:2276`).
    2. Menekan pintasan global `toggle_notch` (`handleShortcutToggleNotch` di `src/App.tsx:2638`), bahkan setelah `isShortcutPinnedRef.current` telanjur di-reset ke `false` pada baris 2633.
    3. Klik kanan pada panel terbuka (`onContextMenu` di `src/App.tsx:5705`).
    4. Menarik file keluar dari `DropShelfPanel` (`onDragStateChange` di `src/App.tsx:6489`), sehingga Notch gagal menutup saat drag file keluar jika drag dimulai kurang dari 600 ms sejak tab dibuka.
    5. Klik tombol "Uji Notifikasi" di `SettingsPanel` (`onTestNotification` di `src/App.tsx:6695`), sehingga panel Settings tetap terbuka dan menutupi notifikasi uji yang muncul 500 ms kemudian.

---

### 2. `T05-02` | Koneksi Wi-Fi terbuka (Open) yang belum tersimpan selalu gagal diam-diam tanpa pembuatan profil XML
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/components/ui/control-center/WifiSubmenu.tsx:138-162`:
    ```ts
    if (!network.is_saved && network.is_secure) {
      // membuka form input password -> connectToWifiWithPassword
      return;
    }
    setPasswordSsid(null);
    setConnectingSsid(network.ssid);
    try {
      await connectToWifi(network.ssid);
    ```
  - Ketika pengguna mengeklik jaringan Wi-Fi terbuka yang belum pernah disimpan (`is_secure: false`, `is_saved: false`), kondisi `!network.is_saved && network.is_secure` bernilai `false`, sehingga kode langsung memanggil `connectToWifi(network.ssid)` (command Rust `connect_wifi`).
  - Di `src-tauri/src/connectivity.rs:415-429`, `connect_wifi` hanya menjalankan `netsh wlan connect name=<ssid>`. Pada Windows, `netsh wlan connect` mewajibkan adanya profil WLAN tersimpan dengan nama tersebut. Karena `is_saved == false`, `netsh` keluar dengan kode error ("There is no profile ... assigned to the specified interface").
  - Lebih buruk lagi, blok `catch` di `WifiSubmenu.tsx:158-161` hanya melakukan `console.error(err)` dan mereset `setConnectingSsid(null)` tanpa menampilkan pesan error apa pun ke pengguna.

---

### 3. `T05-03` | Parsing `netsh` di `connectivity.rs` bergantung bahasa Inggris Windows, mengabaikan `State: connected` / `Hardware Off`, hanya membaca `stderr`, dan hardcode WPA2PSK/AES
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  1. **Ketergantungan Bahasa Inggris & Pengabaian `State` / `Hardware Off`** (`src-tauri/src/connectivity.rs:212-260, 308-323`):
     - `get_wifi_status` mem-parsing output `netsh wlan show interfaces` menggunakan label bahasa Inggris: `starts_with("Name")`, `starts_with("Radio status")`, `contains("software off")`, `starts_with("All User Profile")`, `starts_with("Authentication")`, `contains("open")`, dan `starts_with("Signal")`. Pada Windows dengan bahasa tampilan non-Inggris (Jerman, Prancis, Spanyol, Jepang, Mandarin, dll.), label ini diterjemahkan oleh OS sehingga `has_adapter`, `saved_profiles`, `is_secure`, dan `signal` gagal dikenali.
     - Di baris 219-225, `connected_ssid` langsung diisi dari baris `SSID : ...` tanpa memeriksa apakah `State` bernilai `connected` (padahal di baris 529-536 pada fungsi `connect_wifi_with_password`, developer sudah menyadari perlunya mengecek `State`).
     - Di baris 215-218, kode hanya memeriksa `contains("software off")`, mengabaikan kondisi `Hardware Off`.
  2. **Pembacaan Error `netsh` dari `stderr` padahal `netsh` menulis ke `stdout`** (`src-tauri/src/connectivity.rs:428, 501, 515, 588`):
     - Saat `output.status.success()` bernilai `false`, kode mengembalikan `Err(String::from_utf8_lossy(&output.stderr).to_string())`. Di Windows, utilitas `netsh` mencetak pesan kesalahan ke `stdout`, bukan `stderr`, sehingga `Err("")` (string kosong) yang dikembalikan.
  3. **Hardcode `WPA2PSK` dan `AES`** (`src-tauri/src/connectivity.rs:469-472`):
     - Template XML profil di `connect_wifi_with_password` secara kaku menulis `<authentication>WPA2PSK</authentication>` dan `<encryption>AES</encryption>`, sehingga jaringan WPA3-SAE murni atau WPA/TKIP tidak dapat tersambung.

---

### 4. `T05-04` | Timer auto-dismiss notifikasi `1800ms` di `onMouseLeave` tidak tersimpan/dibatalkan sehingga menghapus notifikasi baru secara prematur
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/App.tsx:5634-5643` (handler `onMouseLeave` pada `#notch-pill`):
    ```ts
    if (notif) {
      window.setTimeout(() => {
        if (!isCursorInsideNotchRef.current && currentNotifRef.current) {
          const k = `${currentNotifRef.current.appName || ""}|${currentNotifRef.current.title || ""}|${currentNotifRef.current.body || ""}`;
          lastDismissedNotifRef.current = { key: k, time: Date.now() };
          currentNotifRef.current = null;
          setNotif(null);
        }
      }, 1800);
      return;
    }
    ```
  - ID timer `window.setTimeout(..., 1800)` tersebut sama sekali tidak disimpan ke dalam ref mana pun, dan tidak pernah dibatalkan di `showNotif` (`src/App.tsx:354-433`), di `onMouseEnter`, maupun di `useEffect([notif, notifQueue])` (`src/App.tsx:4451-4462`).
  - Akibatnya, jika Notifikasi A sedang tampil, pengguna menggerakkan kursor keluar dari Notch (memicu timer 1800 ms), lalu 1000 ms kemudian Notifikasi B masuk via `showNotif(notifB)` (mengubah `currentNotifRef.current = notifB`), maka 800 ms kemudian timer warisan dari Notifikasi A akan mengeksekusi `currentNotifRef.current = null; setNotif(null);` dan langsung mematikan Notifikasi B secara prematur.

---

### 5. `T05-05` | `ControlCenterPanel.onClose` dan `SettingsPanel.onClose` melewati `handleCloseImmediate()`, memicu reopen saat klik Snipping dan merusak reset 5 menit
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/App.tsx:6331-6334`, prop `onClose` yang diberikan ke `ControlCenterPanel` adalah:
    ```ts
    onClose={() => {
      setIsQuickControl(false);
      setControlCenterSubmenu(null);
    }}
    ```
  - Dan di `src/App.tsx:6963`, prop `onClose` untuk `SettingsPanel` adalah:
    ```ts
    onClose={() => setIsSettings(false)}
    ```
  - Kedua callback ini melewati `handleCloseImmediate()` (`src/App.tsx:1753-1865`). Akibatnya:
    1. `isQuickControlRef.current` / `isSettingsRef.current` dan `currentTabRef.current` tidak segera di-reset secara sinkron.
    2. `isClosingRef.current = true` dan `closeGraceUntilRef.current = Date.now() + 450` (`src/App.tsx:1776-1777`) **tidak disetel**. Ketika pengguna mengeklik tombol Snipping (`ControlCenterPanel.tsx:862`), Lock (`707`), Sleep (`722`), Restart (`777`), atau Shutdown (`823`), panel menutup sementara kursor masih berada di area atas layar; event `notch-mouse-enter` / hover langsung masuk tanpa terhalang `closeGraceUntilRef` dan membuka kembali Notch tepat saat overlay Snipping Tool muncul.
    3. `lastPanelClosedAtRef.current` dan `localStorage.setItem("island_last_panel_closed_at", ...)` (`src/App.tsx:1833-1836`) tidak diperbarui, sehingga perhitungan kadaluarsa tab 5 menit (`TAB_IDLE_RESET_MS` di `src/App.tsx:1876`) menjadi tidak akurat.
    4. `invoke("update_pill_size", ...)` (`src/App.tsx:1854`) dan `broadcast_settings_sync` (`src/App.tsx:1846`) tidak dipanggil.

---

### 6. `T05-06` | Mode Dropdown `ControlCenterPanel` merender portal dan backdrop `fixed inset-0` ke `document.body` di luar `#notch-pill`
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/components/ui/ControlCenterPanel.tsx:524-598`, saat `isModeDropdownOpen` bernilai `true`, menu Mode beserta backdrop `<div className="fixed inset-0 z-[99998] bg-transparent" ... />` dirender menggunakan `createPortal(..., document.body)`.
  - Selain itu, pada baris `352-362` di dalam `ControlCenterPanel` juga sudah ada backdrop `<div className="fixed inset-0 z-30 bg-transparent" ... />`.
  - Karena portal dirender langsung sebagai anak dari `document.body` (di luar pohon DOM `<div id="notch-pill">`):
    1. Begitu `isModeDropdownOpen` menjadi `true`, backdrop `fixed inset-0` dengan `z-[99998]` menutupi seluruh viewport di atas `#notch-pill`. Ketika kursor bergerak sedikit saja, browser menganggap pointer keluar dari `#notch-pill` dan masuk ke elemen portal di `document.body`, sehingga memicu `onMouseLeave` pada `#notch-pill` (`src/App.tsx:5630`).
    2. Di `startCollapseTimer` (`src/App.tsx:1965, 2019`), pengecekan `pillEl.matches(":hover")` bernilai `false` karena elemen yang sedang di-hover adalah backdrop/menu portal di `document.body`, bukan `#notch-pill`.
    3. Di `src/App.tsx:3260-3292`, listener `window.addEventListener("pointerdown", handleGlobalPointerDown, true)` berjalan pada **capture phase** (`true`). Saat pengguna mengeklik opsi Mode di dalam portal yang posisinya sedikit keluar dari batas `rect` `#notch-pill` (atau mengeklik area backdrop untuk menutup dropdown saja), `notchElement.contains(e.target as Node)` bernilai `false` (karena `e.target` berada di portal `document.body`) dan `onPointerDown={(e) => e.stopPropagation()}` pada baris 535 tidak menghentikan listener capture phase di `window`, sehingga `handleGlobalPointerDown` langsung menutup seluruh Control Center (`handleCloseImmediate()`).

---

### 7. `T08-01` | Lima modul produktivitas Taskbar terisolasi total dari panel dan layanan Notch (schema dan key `localStorage` berbeda)
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `KRITIS`
- **Bukti Kode Sumber**:
  Perbandingan langsung pada berkas kode sumber membuktikan kelima modul Taskbar menggunakan key `localStorage` dan struktur data yang sama sekali berbeda dari panel Notch:
  1. **Pomodoro**:
     - Taskbar (`src/modules/components/PomodoroNavbarModule.tsx:18`): membaca/menulis `gili_pomodoro_live_state_v2` dengan skema `{ secondsLeft, totalSeconds, isRunning, mode: "work" | "break", cycle, endAtMs }` tanpa mendengarkan event Tauri `gili-pomodoro-sync`.
     - Notch (`src/hooks/usePomodoro.ts:420` & `src/services/pomodoroService.ts:31-32`): menulis `gili_pomodoro_live_state` dengan skema `{ mode: "focus" | "short_break" | "long_break", remainingSec, totalSec, isRunning, cycleSession, sessionsPerCycle }`, pengaturan di `gili_pomodoro_settings`, dan statistik di `gili_pomodoro_daily_stats`.
  2. **Water Reminder / Tracker**:
     - Taskbar (`src/modules/components/WaterNavbarModule.tsx:10, 39`): menggunakan key `gili_water_log_v2` dengan skema `{ date, amount }` dan target di-hardcode `const targetMl = 2000`.
     - Notch (`src/services/waterService.ts:32, 78, 81`): menggunakan key `gili_water_data` dengan skema `WaterData` (`records`, `settings.dailyTargetMl = 3000`, `bestStreakDays`, dll.).
  3. **Prayer Times**:
     - Taskbar (`src/modules/components/PrayerNavbarModule.tsx:16, 53`): menggunakan key `gili_prayer_cache_v2` dengan kota default `"Bandung"` dan memanggil `ambientEnvironmentService.ts`.
     - Notch (`src/services/prayerService.ts:106-108, 255`): menggunakan key `gili_prayer_schedule_cache_v1`, `gili_prayer_settings_v1`, `gili_prayer_completed_v1`, dan mengikuti lokasi cuaca/kota dari `weatherService.ts`.
  4. **To-Do List**:
     - Taskbar (`src/modules/components/TodoNavbarModule.tsx:15, 42-53`): menggunakan key `gili_todos` dengan item dummy bawaan (`"Tubes SIA BAB 1"`, `"Kirim laporan mingguan"`).
     - Notch (`src/App.tsx:4383`): menggunakan key `island_todo_list` dengan dukungan `dueAt`, `reminders`, dan `repeat`.
  5. **Quick Note / Mini Note**:
     - Taskbar (`src/modules/components/QuickNoteNavbarModule.tsx:17`): menggunakan key `gili_quick_notes`.
     - Notch (`src/services/noteUtils.ts:32`): menggunakan key `gili_mini_notes_v2`.

---

### 8. `T08-02` | `usePomodoro` memicu transisi ganda saat `autoStartNext` aktif + `completeAlert` direspons, `dailyStats` tidak rollover, dan `PomodoroNavbarModule` macet di `00:00` pasca-reload
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - **Sub-bug (a) Transisi Ganda**: Di `src/hooks/usePomodoro.ts:156-167`, saat sebuah fase selesai (`handlePhaseComplete`), kode memanggil `setCompleteAlert({...})` **dan** jika `currentCfg.autoStartNext` bernilai `true`, langsung memanggil `advanceToNextMode(finished, true)` (mis. dari `short_break` cycle 1 langsung maju ke `focus` cycle 2 dan mulai berjalan). Namun kartu `completeAlert` tetap ditampilkan di UI. Jika pengguna mengeklik tombol terima (`acceptCompleteAlert` di baris 368-373) atau lewati (`skipCompleteAlert` di baris 375-397), fungsi tersebut memanggil `advanceToNextMode(finished, ...)` lagi menggunakan `cycleRef.current` yang sudah dinaikkan (menjadi cycle 3!), atau mereset ulang timer yang sedang berjalan.
  - **Sub-bug (b) `dailyStats` Tidak Rollover & Tidak Sinkron**: Di `src/hooks/usePomodoro.ts:28`, `dailyStats` hanya diinisialisasi satu kali saat mount (`useState(() => loadPomodoroDailyStats())`) dan hanya diperbarui ketika sesi `focus` selesai (`baris 135-138`). Jika aplikasi melewati tengah malam (pukul 00:00) tanpa menyelesaikan sesi fokus baru, `dailyStats` tetap menampilkan angka kemarin. Selain itu, pada window sekunder (`options.isSecondary = true`), `handlePhaseComplete` tidak pernah dipanggil (karena diblokir di baris 176 `if (options.isSecondary || !isRunning) return;`) dan payload `gili-pomodoro-sync` (`baris 411-418`) tidak menyertakan `dailyStats`, sehingga `dailyStats` di window sekunder tidak pernah ter-update.
  - **Sub-bug (c) `PomodoroNavbarModule` Macet di `00:00`**: Di `src/modules/components/PomodoroNavbarModule.tsx:28-32`:
    ```ts
    if (running && typeof p.endAtMs === "number") {
      const rem = Math.max(0, Math.ceil((p.endAtMs - Date.now()) / 1000));
      secs = rem;
      if (rem === 0) running = false;
    }
    ```
    Jika pengguna me-reload atau membuka kembali Taskbar setelah waktu `endAtMs` terlewati, `state` diinisialisasi dengan `secondsLeft: 0` dan `isRunning: false`. Ketika pengguna menekan tombol Play (`toggleRun` di baris 109-113), kode menjalankan `endAtMs: Date.now() + state.secondsLeft * 1000` (yaitu `Date.now() + 0`), yang langsung habis pada tick pertama tanpa memulai sesi 25 menit.

---

### 9. `T08-03` | `useTodoReminders` memicu bunyi/notifikasi ganda ketika snooze berakhir dan me-reset interval pada setiap render induk
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/hooks/useTodoReminders.ts:56-80`:
    ```ts
    const snoozedTarget = snoozedUntilMap[item.id];
    if (snoozedTarget) {
      if (now >= snoozedTarget) {
        setSnoozedUntilMap((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        ...
        playReminderSound();
        if (onNotifyReminder) {
          onNotifyReminder(item, triggeredOffset);
        }
        continue;
      }
      continue;
    }
    ```
  - Dan di baris 113-117:
    ```ts
    checkReminders();
    const interval = window.setInterval(checkReminders, 5000);
    return () => clearInterval(interval);
    }, [todoItems, muteNotifs, snoozedUntilMap, onNotifyReminder, enabled, isSecondary]);
    ```
  - **Bukti Notifikasi/Bunyi Ganda**: Misalkan tugas memiliki `reminders: [0, 10]`. Saat pengingat `offset = 10` muncul (10 menit sebelum `dueAt`), kunci `${id}_${dueAt}_10` dimasukkan ke `firedSetRef.current`. Pengguna menekan Snooze 10 menit. Sepuluh menit kemudian (`now >= snoozedTarget`, yang bertepatan dengan waktu jatuh tempo `dueAt`, sehingga `diffMinutes === 0`), `checkReminders()` mengeksekusi blok `now >= snoozedTarget`: memutar `playReminderSound()`, memanggil `onNotifyReminder()`, dan memanggil `setSnoozedUntilMap(...)` untuk menghapus `item.id` tanpa menambahkan kunci `${id}_${dueAt}_0` ke `firedSetRef.current`. Perubahan state `snoozedUntilMap` langsung memicu re-run `useEffect` (karena `snoozedUntilMap` ada di dependency array baris 117), yang langsung memanggil `checkReminders()` secara sinkron di baris 113. Pada panggilan kedua di detik yang sama ini, `snoozedTarget` sudah `undefined`, sehingga eksekusi masuk ke loop `offsets` (baris 86) dan mencocokkan `offset = 0` (karena `${id}_${dueAt}_0` belum ada di `firedSetRef`), lalu memutar `playReminderSound()` dan `onNotifyReminder()` untuk **kedua kalinya** secara beruntun!
  - **Bukti Reset Interval Setiap Render**: Di `src/App.tsx:1252`, argumen ke-4 `onNotifyReminder` dikirim sebagai inline arrow function `(task, offset) => { ... }` tanpa `useCallback`. Karena `onNotifyReminder` masuk ke dependency array `useEffect` (`useTodoReminders.ts:117`), setiap kali `App` re-render (mis. setiap detik atau saat kursor bergerak), `useEffect` dibersihkan dan dijalankan ulang, memanggil `checkReminders()` terus-menerus dan me-reset `setInterval`.

---

### 10. `T08-04` | Race condition async `playAdzanAudio` vs `stopAdzanAudio`, jadwal sholat gagal rollover saat reminder mati/Focus Mode, dan event tidak terkirim antar-jendela
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  1. **Race condition `playAdzanAudio` vs `stopAdzanAudio`** (`src/services/prayerService.ts:171-234`):
     - `playAdzanAudio` memanggil `loadAdzanBuffer().then((buffer) => { ... currentAdzanSource = source; source.start(0); })`.
     - Jika `stopAdzanAudio()` dipanggil saat `loadAdzanBuffer()` masih berjalan (sebelum Promise `.then()` selesai), `currentAdzanSource` masih `null` sehingga `stopAdzanAudio()` tidak melakukan apa-apa. Beberapa milidetik kemudian ketika `loadAdzanBuffer()` selesai, callback `.then()` tetap membuat `AudioBufferSourceNode` dan memanggil `source.start(0)` tanpa memeriksa token pembatalan/generasi, sehingga suara adzan tetap menyala meskipun sudah dihentikan.
  2. **Gagal Rollover Jadwal Saat Tengah Malam bila Reminder Mati atau Focus Mode Aktif** (`src/hooks/usePrayerReminder.ts:107-138`):
     - Di `checkPrayerTimes`:
       ```ts
       if (!enabled) return;
       const settings = loadPrayerSettings();
       if (!settings.reminderEnabled) return;
       if (settings.dndFocus && isFocusMode) return;
       ```
     - Pengecekan pergantian tanggal (`if (activeSchedule.dateKey !== todayKey)` di baris 123-138) diletakkan **di bawah** return awal `!settings.reminderEnabled` dan `settings.dndFocus && isFocusMode`. Akibatnya, jika pengguna mematikan pengingat notifikasi atau sedang berada di Focus Mode saat melewati pukul 00:00, jadwal sholat di `PrayerReminderPanel` tidak pernah diperbarui ke hari baru.
  3. **Event Tidak Terkirim Lintas Jendela** (`src/services/prayerService.ts:308, 372` vs `src/hooks/usePrayerReminder.ts:100`):
     - `savePrayerSettings` dan `togglePrayerCompleted` hanya memanggil `window.dispatchEvent(new CustomEvent("gili_prayer_updated"))` (event DOM lokal satu window), bukan `emitCrossWindowEvent` / Tauri event. Akibatnya window sekunder yang mendengarkan `window.addEventListener("gili_prayer_updated", ...)` di `usePrayerReminder.ts:100` tidak pernah menerima notifikasi saat pengaturan atau status selesai sholat diubah di window utama.

---

### 11. `T08-05` | `dateNlpParser` salah memotong angka kuantitas/persen/tahun sebagai jam serta menghapus teks waktu tidak valid
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber & Hasil Uji (`tests/bug-hunt/V03_check.mjs`)**:
  - Di `src/utils/dateNlpParser.ts:160-163`, `combinedPattern` membuat kata kunci `jam|pukul|at` bersifat opsional (`(?:(?:jam|pukul|at)\\s+)?\\d{1,2}`) dan tidak memiliki batas kata (`\b`) di akhir angka.
  - Selain itu, di baris 239-254, jika `parseTimeSnippet(timePart)` mengembalikan `null` (mis. karena angka > 24 seperti `30` atau `99`), `fullMatchedStr` (`match[0]`) tetap menyertakan `timePart` sehingga teks angka tersebut tetap dipotong dari `cleanText`!
  - Di baris 321 & 341 (`parseTimeSnippet`), `h > 24` mengizinkan `h === 24` dengan menit berapa pun, lalu `h % 24` mengubah `24:30` menjadi `00:30`.
  - **Hasil eksekusi nyata `node tests/bug-hunt/V03_check.mjs`**:
    - `"Beli susu besok 2 liter"` -> `cleanText: "Beli susu liter"`, `rawMatched: "besok 2"`, `hasTime: true`, `time: "02:00"` (angka `2` dari `2 liter` dicuri sebagai pukul 02:00 dini hari).
    - `"Review PR hari ini 100%"` -> `cleanText: "Review PR 0%"`, `rawMatched: "hari ini 10"`, `hasTime: true`, `time: "10:00"` (angka `100%` terpotong menjadi `0%`).
    - `"Meeting senin 2026"` -> `cleanText: "Meeting 26"`, `rawMatched: "senin 20"`, `hasTime: true`, `time: "20:00"` (tahun `2026` terpotong menjadi `26`).
    - `"Laporan hari ini 30 menit"` -> `cleanText: "Laporan menit"`, `rawMatched: "hari ini 30"`, `hasTime: false`, `time: "23:59"` (angka `30` dihapus dari teks meskipun bukan jam valid).
    - `"Kerjakan hari ini jam 99"` -> `cleanText: "Kerjakan"`, `rawMatched: "hari ini jam 99"`, `hasTime: false`, `time: "23:59"` (`jam 99` dihapus diam-diam).
    - `"Kumpul tugas besok jam 24:30"` -> `cleanText: "Kumpul tugas"`, `hasTime: true`, `time: "00:30"`.

---

### 12. `T09-01` | `saveNavbarConfig` mengembalikan Promise sebelum `settings.json` disimpan (debounce 250ms tanpa flush) sehingga aktivasi/reset Taskbar batal
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/services/navbarConfigService.ts:509-518`:
    ```ts
    pendingConfigToSave = normalized;
    if (debouncedSaveTimer) clearTimeout(debouncedSaveTimer);
    debouncedSaveTimer = setTimeout(() => {
      if (pendingConfigToSave) {
        flushConfigToStore(pendingConfigToSave);
        pendingConfigToSave = null;
      }
    }, 250);

    return normalized;
    ```
  - `saveNavbarConfig` adalah fungsi `async` yang langsung me-resolve `normalized` tanpa menunggu `flushConfigToStore` (yang ditunda 250 ms oleh `setTimeout`), sementara `loadNavbarConfig()` (`src/services/navbarConfigService.ts:394-409`) membaca langsung dari `store.get("opt_navbar_config")` di `settings.json` tanpa memeriksa `pendingConfigToSave` dan mengutamakan nilai `store` di atas `localStorage` (`if (!loadedData && typeof window !== "undefined")` di baris 418).
  - Akibatnya:
    1. Di `NavbarSettingsTab.tsx:143-151`, saat pengguna mengaktifkan Taskbar (`enabled: true`), kode menjalankan `await saveNavbarConfig(nextConfig)` lalu langsung memanggil `await invoke("toggle_navbar", { enabled: true })`.
    2. Bila WebView `navbar` baru dibuat/dimuat dalam waktu `< 250 ms`, `NavbarApp.tsx:164` memanggil `loadNavbarConfig()` yang membaca `settings.json` dari disk (yang masih berisi `enabled: false` karena timer 250 ms di window Settings belum flush!).
    3. `loadNavbarConfig()` kemudian menimpa `localStorage` kembali dengan data lama (`enabled: false` di baris 458), dan `NavbarApp.tsx:175` memanggil `applyNavbarActivation(activeCfg, ...)` yang mengeksekusi `invoke("close_navbar_window")` (`baris 69-70`), langsung menutup kembali Taskbar yang baru saja diaktifkan pengguna!

---

### 13. `T09-02` | `settingsResetService.ts` gagal mereset 17+ key pengaturan/AI/cache (termasuk typo key DND/Muted), tidak mereset autostart OS, dan memicu race `opt_autostart`
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  1. **Typo Key DND & Muted Apps**:
     - `src/services/settingsResetService.ts:41-42` menghapus `"island_muted_apps"` dan `"island_dnd_mode"`, padahal `src/services/notificationHistoryService.ts:19-20` menyimpan data tersebut di `"island_muted_notification_apps"` dan `"island_dnd_enabled"`. Akibatnya daftar aplikasi yang dibisukan dan status DND tidak pernah ter-reset.
  2. **Key Pengaturan & Cache Lain yang Terlewat**:
     - Tidak ada penghapusan untuk key pengaturan/state berikut: `gili_user_navbar_presets_v1`, `gili_prayer_completed_v1`, `gili_prayer_schedule_cache_v1`, `gili_pomodoro_daily_stats`, `gili_pomodoro_live_state`, `gili_pomodoro_live_state_v2`, `gili_water_log_v2`, `gili_prayer_cache_v2`, `gili_todos`, `gili_quick_notes`, `gili_mini_notes_v2`, `gili_fired_todo_reminders`, serta key migrasi `opt_navbar_dual_monitor_all_v1` / `island_navbar_dual_monitor_all_v1`.
  3. **Race Condition `opt_autostart` Saat Reload Pasca-Reset**:
     - `resetAllAppSettings()` (`src/services/settingsResetService.ts:70-71, 138-140`) menghapus `autostart_initialized` dan `opt_autostart` dari `settings.json` tanpa memanggil `invoke("sync_autostart_state", { enabled: true })`, lalu mem-broadcast `settings_reset` yang membuat `App.tsx` (window utama) dan `SettingsWindowApp.tsx` (jendela pengaturan) sama-sama melakukan `window.location.reload()` secara bersamaan.
     - Saat kedua jendela selesai reload:
       - `App.tsx:3168-3173` melihat `!autostartInit`, lalu menyetel `sync_autostart_state({ enabled: true })` dan menulis `opt_autostart = true`.
       - Secara paralel, `SettingsWindowApp.tsx:514-519` **tidak memeriksa `autostart_initialized`**; ia membaca `s.get("opt_autostart")`. Jika pembacaan ini terjadi sebelum `App.tsx` selesai menulis `opt_autostart = true`, maka `savedAuto` bernilai `undefined`, sehingga `SettingsWindowApp.tsx:517` memanggil `get_autostart_state()` (yang masih `false` di registry OS karena belum disinkronkan oleh `resetAllAppSettings`), lalu baris 519 memanggil `invoke("sync_autostart_state", { enabled: false })` dan menimpa kembali status autostart OS menjadi mati!

---

### 14. `T09-03` | `shortcutManager.applyAll` meng-unregister dan mencuri handler secara diam-diam saat dua aksi memiliki pintasan sama
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `SEDANG` (diturunkan dari `TINGGI` karena untuk input melalui UI terdapat guard `validateShortcut`, namun bug pada `applyAllInternal` nyata bila konfigurasi dimuat dari store/preset yang memiliki duplikat)
- **Bukti Kode Sumber**:
  - Di `src/services/shortcuts.ts:396-422`:
    ```ts
    for (const action of SHORTCUT_ACTIONS) {
      const shortcut = map[action.id];
      ...
      try {
        // Clean up any existing registration in Windows OS first to avoid self-collision
        try {
          await unregister(shortcut);
        } catch {}

        await register(shortcut, (event) => { ... });
        statusMap[action.id] = "ok";
      } catch (err: any) {
        statusMap[action.id] = "conflict";
      }
    }
    ```
  - Jika dua aksi di dalam `map` memiliki string pintasan yang sama (mis. aksi pertama `quick_task` dan aksi terakhir `open_ai_chat` sama-sama `"Control+Alt+A"`), iterasi untuk `quick_task` mendaftarkan `"Control+Alt+A"` dan menandai `statusMap.quick_task = "ok"`. Kemudian saat iterasi mencapai `open_ai_chat`, baris 406 memanggil `await unregister(shortcut)` yang **menghapus pendaftaran milik `quick_task`**, lalu mendaftarkan ulang `"Control+Alt+A"` untuk `open_ai_chat` dan menandai `statusMap.open_ai_chat = "ok"`. Kedua aksi dilaporkan `"ok"` tanpa konflik, padahal handler `quick_task` telah terhapus diam-diam.
  - **Catatan Guard**: Di jalur UI normal, `validateShortcut` (`src/services/shortcuts.ts:327-335`) sudah menolak duplikasi antar-aksi sebelum disimpan. Namun saat inisialisasi dari `settings.json` (`src/App.tsx:3137-3152`), objek `savedShortcuts` langsung digabung dan dikirim ke `shortcutManager.applyAll` tanpa dedup/validasi ulang. Oleh karena itu bug di `applyAllInternal` terkonfirmasi di kode dengan keparahan `SEDANG`.

---

### 15. `T09-04` | `CustomColorPicker` (kedua versi) otomatis memekarkan input hex 3 digit pada ketikan ke-3 (`maxLength=6`) dan memblokir pengetikan kode 6 digit
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber & Hasil Uji (`tests/bug-hunt/V03_check.mjs`)**:
  - Berlaku identik pada `src/components/settingsWindow/navbar/CustomColorPicker.tsx:50-59, 94-102, 188-192` dan `src/components/ui/settings/CustomColorPicker.tsx:194-205, 240-248, 400-405`:
    - `<input type="text" value={hexInput.replace(/^#/, "")} onChange={(e) => handleHexInputChange(`#${e.target.value}`)} maxLength={6} />`
    - Di `handleHexInputChange(raw)`: ketika pengguna mengetik karakter ke-3 (misal ingin mengetik `ff0000`, baru sampai `ff0`), `raw` adalah `"#ff0"`.
    - `isValidHex("#ff0")` (`colorUtils.ts:8`: `/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/`) mengembalikan **`true`** untuk hex 3 digit!
    - Selanjutnya `normalizeHex("#ff0")` (`colorUtils.ts:13-15`) memekarkan `"#ff0"` menjadi 6 digit `"#ffff00"` dan memanggil `onChange("#ffff00")`.
    - Ketika prop `value` dari induk berubah menjadi `"#ffff00"`, `currentHex` berubah dan memicu `useEffect(() => { setHexInput(currentHex); ... }, [currentHex])`, yang langsung mengubah `hexInput` menjadi `"#ffff00"`.
    - Nilai di dalam `<input>` (`hexInput.replace(/^#/, "")`) seketika berubah dari `"ff0"` (3 karakter) menjadi `"ffff00"` (6 karakter). Karena `<input>` memiliki `maxLength={6}`, kotak teks langsung penuh pada ketikan ke-3 dan **memblokir ketikan karakter ke-4, ke-5, dan ke-6**!
    - Selain itu, jika pengguna menempelkan (paste) string dengan tanda pagar seperti `"#1d4ed8"` (7 karakter), `maxLength={6}` memotongnya menjadi `"#1d4ed"` lalu `onChange` menambahkan `#` di depannya menjadi `"##1d4ed"` yang gagal divalidasi oleh `isValidHex`.
  - **Hasil eksekusi nyata `node tests/bug-hunt/V03_check.mjs`**: Terbukti 100% sesuai langkah reproduksi.

---

### 16. `T10-01` | Click-through Mini Player memblokir scroll lirik manual, klik-seek baris lirik, dan double-click ganti mode di area tengah
- **Status Akhir**: `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `KRITIS`
- **Bukti Kode Sumber & Hasil Uji (`tests/bug-hunt/V03_check.mjs`)**:
  - Di `src/components/miniplayer/MiniPlayerCardMode.tsx`, komponen menyediakan fitur interaktif di area tengah kartu:
    - `onDoubleClick={onToggleMode}` pada container kartu (`baris 215`) dan `MiniPlayerBarMode.tsx:216`.
    - `onWheel={handleWheel}` pada viewport lirik (`baris 264`) untuk scroll lirik manual.
    - `onClick={(e) => handleLineClick(e, line.time)}` pada setiap baris lirik (`baris 355`) untuk lompat (seek) ke waktu lirik tersebut.
  - Namun di backend Rust `src-tauri/src/miniplayer_window.rs:318-330`:
    ```rust
    let expanded_top_y = (win_h_logical - expanded_h).max(0.0);
    let toolbar_height = 52.0;
    let bottom_progress_height = 22.0;
    let in_top_toolbar =
        in_window && rel_y >= expanded_top_y && rel_y < expanded_top_y + toolbar_height;
    let in_bottom_progress =
        in_window && rel_y >= (win_h_logical - bottom_progress_height) && rel_y <= win_h_logical;

    MiniplayerCursorHoverPayload {
        in_window,
        in_toolbar: in_top_toolbar || in_bottom_progress,
        is_anchored_right: is_right_half,
    }
    ```
  - Dan pada loop tracker (`src-tauri/src/miniplayer_window.rs:504-508`):
    ```rust
    let should_ignore_cursor =
        !current_state.in_window || !current_state.in_toolbar || ctrl_down;
    if should_ignore_cursor {
        if !was_ignored {
            apply_ignore_cursor(&win, true);
        }
    }
    ```
  - Ketika kursor berada di area lirik tengah Card Mode (`52.0 <= rel_y < 318.0` dari tinggi `340.0`), `in_toolbar` bernilai `false`, sehingga `should_ignore_cursor` bernilai **`true`** dan Rust memanggil `apply_ignore_cursor(&win, true)` (`WS_EX_TRANSPARENT` / `set_ignore_cursor_events(true)`).
  - Akibatnya, OS Windows meneruskan seluruh event mouse (wheel scroll, klik baris lirik, dan double-click) ke jendela aplikasi lain di belakang Mini Player; WebView Mini Player sama sekali tidak pernah menerima `onWheel`, `onClick`, maupun `onDoubleClick` di area lirik maupun area tengah kartu!

---

### 17. `T10-02` | Offset lirik di `LyricsView` tidak sinkron dengan Mini Player dan menimpa kalibrasi Mini Player
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Ketika pengguna mengubah offset lirik di Mini Player (`MiniPlayerApp.tsx:634`), fungsi `setSongLyricsOffset(artist, title, clamped)` di `src/services/mediaLyricsStore.ts:172-187` menyimpan offset ke backend Rust (`invoke("set_lyrics_offset", ...)`), yang kemudian memancarkan event Tauri `"lyrics:offset-changed"`.
  - Di window Notch, `mediaLyricsStore.ts:527-531` menerima `"lyrics:offset-changed"`, memperbarui `currentLyrics.offset`, memanggil `syncOffsetLocalStorage(event.payload)` (yang men-dispatch `CustomEvent("notch_lyrics_offset_changed")`), dan memberi tahu semua `lyricsSubscribers`.
  - Akan tetapi:
    1. Di `src/App.tsx:617-624`, saat `subscribeLyrics` menerima update, objek `lyricsData` yang disusun (`{ synced, lines, plainLyrics, instrumental, provider, providerName }`) **membuang field `offset`** dan tidak meneruskannya ke `<LyricsView />`.
    2. Di `src/components/ui/LyricsView.tsx:82-96`, state `offset` lokal hanya diambil satu kali saat `artist` atau `songTitle` berubah (`getSongLyricsOffset(artist || "", songTitle)`), dan `LyricsView` **sama sekali tidak mendengarkan** event `"notch_lyrics_offset_changed"` maupun `"lyrics:offset-changed"`.
  - Akibatnya, saat lagu sedang diputar dan `LyricsView` sudah ter-mount dengan `offset = 0.0`, perubahan offset di Mini Player (misal menjadi `+1.4s`) tidak mengubah `offset` di `LyricsView`. Jika pengguna kemudian menekan tombol `+` (`+0.2s`) di `LyricsView` (`baris 98-107`), `handleOffsetChange` menghitung `prev + delta` dari state lokalnya yang basi (`0.0 + 0.2 = 0.2`) lalu memanggil `setSongLyricsOffset(artist, songTitle, 0.2)`, langsung menimpa dan menghapus kalibrasi `+1.4s` yang sebelumnya diatur di Mini Player.

---

### 18. `T10-03` | Scrubber `MediaExpandedPanel` dapat membuat `isSeeking` macet `true` permanen bila `releasePointerCapture` atau `smtc_seek` gagal
- **Status Akhir**: `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`) `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan**: `TINGGI`
- **Bukti Kode Sumber**:
  - Di `src/components/ui/MediaExpandedPanel.tsx:237-252`:
    ```tsx
    onPointerUp={async (e) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (isSeeking) {
        if (mediaProgress.duration > 0) {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = Math.max(
            0,
            Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
          );
          const newPos = (percent / 100) * mediaProgress.duration;
          await invoke("smtc_seek", { positionSec: newPos });
          onSetMediaProgress((prev) => ({ ...prev, position: newPos }));
        }
        onSetIsSeeking(false);
      }
    }}
    ```
  - Bandingkan dengan `onPointerCancel` tepat di bawahnya (`baris 253-260`) yang membungkus `e.currentTarget.releasePointerCapture(e.pointerId)` dengan `try { ... } catch {}`.
  - Pada `onPointerUp`:
    1. `e.currentTarget.releasePointerCapture(e.pointerId)` dipanggil **tanpa `try/catch`**. Jika pointer capture sudah lepas sebelum `pointerup` (yang melempar `InvalidStateError` / `NotFoundError` pada DOM), fungsi langsung throw sebelum mencapai `onSetIsSeeking(false)`.
    2. `await invoke("smtc_seek", { positionSec: newPos })` (dan juga pada `LyricsView` `onSeek` di baris `498-501`) dipanggil **tanpa `try/catch/finally`**. Jika command IPC `smtc_seek` gagal/reject, eksekusi melompat keluar dari fungsi async sebelum mencapai baris 250 (`onSetIsSeeking(false)`).
    3. Lebih parah lagi, tidak ada cleanup `useEffect(() => () => onSetIsSeeking(false), [])` saat `MediaExpandedPanel` unmount, sementara state `isSeeking` disimpan di komponen induk `App.tsx`. Jika `isSeeking` tertinggal dalam kondisi `true`, progress bar media berhenti mengikuti waktu lagu secara permanen hingga aplikasi di-reload.
