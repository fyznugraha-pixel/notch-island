# Katalog 29 Widget Desktop Native Gili

Seluruh 29 widget berikut tersedia di crate `gili-widgets` dan dapat ditambahkan dari Galeri Widget di Pengaturan Gili -> **Widget Desktop**. Semua widget mendukung mode Tanpa Latar (default), Tint Tipis, Kaca, dan Solid, serta pewarnaan Tema Global atau penimpaan per widget.

---

## Grup A: Versi Besar Modul Gili (Satu Sumber Data)

| No | ID Widget | Nama Tampilan | Ukuran | Sumber Data | Pengaturan & Catatan |
|---:|---|---|---|---|---|
| 1 | `calendar_agenda` | Kalender & Agenda | S, M, L | `EventNavbarModule` (`gili_navbar_events_v1`) | Tap membuka Kalender Gili; ukuran L menampilkan grid tanggal bulanan |
| 2 | `class_schedule` | Jadwal Kuliah Mingguan | M, L | `ClassScheduleNavbarModule` (`gili_class_schedule_v1`) | Mendukung field `day` (0-6) kompatibel mundur |
| 3 | `habit_heatmap` | Heatmap Kebiasaan | M, L | `StreakNavbarModule` (`gili_habit_streak_v2`) | Migrasi otomatis menambahkan peta riwayat harian `history` tanpa menghilangkan hitungan lama |
| 4 | `system_performance` | Performa Sistem | S, M, L | `NtQuerySystemInformation(8)` (CPU per-core asli), `GlobalMemoryStatusEx`, `GetDiskFreeSpaceExW`, `gpu_telemetry` | Tidak memakai estimasi sintetis |
| 5 | `now_playing` | Now Playing & Lirik | S, M, L | `media_lyrics_store` (`CURRENT_MEDIA`, `CURRENT_LYRICS`) | Memakai sumber lirik yang sama persis dengan Mini Player; tidak menambah sumber lirik baru |
| 6 | `weather_forecast` | Cuaca Lengkap | S, M, L | Open-Meteo (`api.open-meteo.com`) | Suhu saat ini, per jam, dan prakiraan 5 hari dengan backoff saat offline |
| 7 | `todo_groups` | To-Do dengan Grup | S, M, L | `todoUtils` (`island_todo_list`) | Mendukung label grup opsional & hitung progres selesai |
| 8 | `drop_zone` | Drop Zone | S, M | `shelf_server` & `island_drop_shelf` | Menampilkan berkas pada rak cepat Gili |

---

## Grup B: Produktif

| No | ID Widget | Nama Tampilan | Ukuran | Sumber Data | Pengaturan & Catatan |
|---:|---|---|---|---|---|
| 9 | `sticky_notes` | Catatan Tempel | S, M, L | Lokal `desktop_sticky_notes.json` | Mendukung banyak catatan, warna, checklist, dan input cepat lewat editor Win32 native |
| 10 | `mini_kanban` | Kanban Mini 3 Kolom | L | Lokal `desktop_kanban.json` | 3 kolom (Akan, Proses, Selesai), tambah kartu lewat editor native, ketuk kartu untuk pindah kolom |
| 11 | `time_tracker` | Pelacak Waktu Proyek | S, M | Lokal `desktop_time_tracker.json` | Mulai/henti per proyek, ekspor CSV ke `%APPDATA%\com.faiz.gili\time_tracker_export.csv` |
| 12 | `site_status` | Status Situs | M, L | HTTP HEAD HTTPS via `ureq` | Interval minimal 60 detik, timeout terkontrol, batas maks 6 situs, blokir loopback/non-HTTPS |
| 13 | `github_status` | Status GitHub | M, L | GitHub REST API (`If-None-Match` ETag + backoff) | Token fine-grained read-only disimpan di Windows Credential Manager (`GiliNotch/DesktopWidget/github_pat`) |
| 14 | `shortcuts_grid` | Pintasan Cepat | S, M, L | Lokal `desktop_shortcuts.json` | Grid aplikasi, folder, dan tautan milik pengguna sendiri dengan path terlihat jelas |
| 15 | `recent_files` | Berkas Terbaru | M, L | Pemindai metadata folder opt-in | Opt-in penuh, mendukung daftar folder pengecualian, hanya membaca metadata (tidak membaca isi berkas) |

---

## Grup C: Sistem

| No | ID Widget | Nama Tampilan | Ukuran | Sumber Data | Pengaturan & Catatan |
|---:|---|---|---|---|---|
| 16 | `top_processes` | Proses Teratas (Baca-Saja) | M, L | Win32 `EnumProcesses`, `GetProcessTimes`, `GetProcessMemoryInfo` | Menampilkan 5 proses teratas CPU/RAM secara HANYA-BACA (tanpa tombol akhiri proses) |
| 17 | `quick_controls` | Kontrol Cepat | S, M | `connectivity.rs` (Wi-Fi/Bluetooth WinRT Radio), `Themes\Personalize` (Mode Gelap), Core Audio | Toggle tanpa API publik stabil (Night Light, WNF) disembunyikan sepenuhnya |
| 18 | `storage_treemap` | Peta Penyimpanan | M, L | Pemindai folder lokal on-demand kedalaman terbatas | Dijalankan hanya saat diminta, dibatasi kedalaman/jumlah berkas, hasil di-cache |

---

## Grup D: Estetik & Gaya Hidup

| No | ID Widget | Nama Tampilan | Ukuran | Sumber Data | Pengaturan & Catatan |
|---:|---|---|---|---|---|
| 19 | `styled_clock` | Jam Bergaya (8 Gaya) | S, M, L | Waktu lokal sistem (`GetLocalTime`) | 8 gaya: `minimal_digital`, `kata_indonesia` (tipografi kata Bahasa Indonesia), `analog_classic`, `analog_skeleton`, `stacked_bold`, `retro_flip`, `editorial_thin`, `dual_zone` |
| 20 | `photo_frame` | Bingkai Foto / Polaroid | S, M, L | Folder foto lokal baca-saja | Membaca orientasi EXIF JPEG, mendukung mode polaroid, cache thumbnail |
| 21 | `live_mascot` | Maskot Hidup Gili | S, M | Vektor native Direct2D orisinal | Animasi ringan 8-10 fps (placeholder vektor orisinal Gili; kebutuhan aset sprite desainer dicatat di `LAPORAN.md`) |
| 22 | `audio_visualizer` | Visualizer Audio | M | Windows WASAPI Loopback (`AUDCLNT_STREAMFLAGS_LOOPBACK`) + FFT 256-point | Hanya aktif memindai audio ketika widget terpasang |
| 23 | `quote_poster` | Poster Kutipan | S, M, L | `KutipanHarianNavbarModule` (`gili_quote_daily_v1`) + teks sendiri | Tata letak editorial bersih dengan aksen garis atas |

---

## Grup E: Fokus Indonesia & Tambahan

| No | ID Widget | Nama Tampilan | Ukuran | Sumber Data | Pengaturan & Catatan |
|---:|---|---|---|---|---|
| 24 | `prayer_times` | Jadwal Sholat (Kemenag RI) | S, M, L | Kalkulator astronomis offline Kemenag RI (`prayer_calc.rs`) | Subuh 20 derajat, Isya 18 derajat, Ashar Syafi'i, ihtiyat +2 menit, mode Ramadan (Imsak/Sahur & Buka) |
| 25 | `currency_gold` | Kurs & Harga Emas | S, M | `open.er-api.com` (kurs) + trait `GoldPriceProvider` | Kurs ber-cache dengan atribusi; harga emas menampilkan status butuh API berlisensi (nol angka karangan) |
| 26 | `hijri_holidays` | Kalender Hijriyah & Libur | S, M | Konverter Hijriyah offline (+/-1 hari) + `skb3menteri_holidays.json` | Tanpa tanggal libur karangan; menampilkan catatan resmi bila berkas SKB 3 Menteri belum diimpor |
| 27 | `quick_expense` | Catat Pengeluaran Cepat | S, M | Lokal terenkripsi Windows DPAPI (`expenses_dpapi.bin`) | Input cepat format `Label nominal` lewat editor native + bar anggaran bulanan, nol telemetri |
| 28 | `football_scores` | Papan Skor Bola | M | Trait `FootballScoreProvider` | Antarmuka penyedia berlisensi saja (tanpa scraping dan tanpa skor palsu) |
| 29 | `ai_quick_ask` | Tanya Cepat AI | M | Router & BYOK Gili (`ai_credentials.rs`) | Kunci API tetap di Windows Credential Manager dan tidak pernah ditampilkan di log atau widget |
