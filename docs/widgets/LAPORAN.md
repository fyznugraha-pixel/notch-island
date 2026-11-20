# Laporan Akhir Pembangunan Sistem Widget Desktop Native Gili

Dokumen ini merangkum seluruh pekerjaan pada branch `widgets-native` (baseline tag `pre-widgets`), angka performa yang terukur, keputusan mengenai sumber data berlisensi, serta risiko yang tersisa.

---

## 1. Ringkasan Penyelesaian

### Selesai dan Teruji Otomatis
- **Audit Repositori (`docs/widgets/AUDIT.md`)**: Pemetaan lengkap token desain Gili, sumber data modul navbar, temuan field sintetis pada `system_monitor.rs`, klasifikasi kontrol cepat berbasis API publik vs registry/WNF tak berdokumen, serta pola penyimpanan pengaturan & kredensial.
- **Crate Native Direct2D (`src-tauri/crates/gili-widgets`)**:
  - Host Direct3D 11 + Direct2D 1.1 + DirectWrite (Grayscale AA + angka tabular) + DirectComposition flip-model premultiplied alpha dengan prioritas iGPU (`DXGI_GPU_PREFERENCE_MINIMUM_POWER`) dan pemulihan device lost.
  - Satu jendela transparan Per-Monitor DPI v2 per monitor, mendukung mode **Tempel di Desktop** (`HWND_BOTTOM`) dan **Papan Widget** (overlay `Ctrl+Alt+W`, tutup via `Esc`/klik di luar).
  - Transparan sejati tanpa kartu secara default dengan `WM_NCHITTEST` -> `HTTRANSPARENT` di luar piksel konten.
  - 4 mode latar (Tanpa Latar, Tint Tipis 10-25%, Kaca dengan fallback otomatis ke Solid, Solid), kurva superellipse 60%, batas dalam 1 px, dan radius konsentris.
  - Cache bitmap bayangan/halo teks, dirty-rect presentation, sistem animasi spring (response 0,4 dtk, damping 0,8), kurangi gerak, kontras tinggi, skala teks sistem 1,0-1,5, dan penjadwal FPS adaptif (0 fps idle, 30 fps Penghemat Daya, jeda total saat layar penuh/layar mati).
  - Auto-kontras dari berkas wallpaper (tanpa screenshot) + ekstraksi palet dominan + indikator peringatan kontras rendah (< 4.5:1).
  - Editor input teks Win32 `EDIT` native di atas widget untuk Catatan, Kanban, Pengeluaran, dan Tanya Cepat AI.
  - Scene graph deklaratif serializable (`SceneNode`) yang siap untuk SDK widget pihak ketiga di masa mendatang.
- **Seluruh 29 Widget (Grup A sampai E)** terimplementasi lengkap dengan komposisi tersendiri, state kosong/belum dikonfigurasi/offline yang ramah, serta tombol aksi.
- **Integrasi Tauri & Pengaturan Gili**:
  - Bridge `src-tauri/src/desktop_widgets_bridge.rs` (17 command Tauri, menu tray Papan Widget, feeder latar belakang yang tidur total saat widget nonaktif).
  - Migrasi kompatibel mundur riwayat harian kebiasaan pada `StreakNavbarModule.tsx` & `src/services/habitHistoryService.ts`.
  - Tab **Widget Desktop** di Pengaturan Gili (`DesktopWidgetsTab.tsx`), kustomisasi warna & tema global/per-widget (`WidgetColorCustomizer.tsx`), dan Galeri Widget dengan pencarian, kategori, serta pratinjau S/M/L (`WidgetGalleryModal.tsx`).
  - Pintasan global baru `toggle_widget_board` (`Ctrl+Alt+W`) terhubung di `shortcuts.ts`, `i18n.ts`, `KeyboardShortcutsCard.tsx`, dan `App.tsx`.

### Belum Diverifikasi di Desktop Visual Interaktif
- Uji visual dan ergonomi langsung di desktop Windows asli (klik tembus fisik ke ikon desktop, perilaku `Win+D` di berbagai build Windows 11, multi-monitor DPI campuran, input IME langsung di Win32 `EDIT`, sleep/resume GPU device lost, serta pengukuran idle 5 menit penuh bersama proses Gili utama) ditandai `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` di `docs/widgets/BENCHMARK.md`.

---

## 2. Angka Performa Terukur Saat Ini

- **Build scene + hit-testing 3 widget**: `2,79 mikrodtk` (0,0028 ms) per siklus.
- **FFT 256-titik visualizer**: `5,33 mikrodtk` (0,0053 ms) per blok sampel.
- **Working set proses uji `gili-widgets` (tanpa WebView2)**: `7,7 MB`.
- **Unit test `gili-widgets`**: `20 passed, 0 failed`.
- **Kompilasi penuh**: `tsc`, `vite build`, dan `cargo check --bin gili` lulus tanpa error.

---

## 3. Sumber Data yang Membutuhkan Keputusan Lisensi atau Berkas Resmi

Sesuai aturan tanpa karangan dan tanpa scraping:

1. **Harga Emas Spot Real-Time (Widget #25)**:
   - Kurs mata uang memakai kembali penyedia Gili yang sudah ada (`open.er-api.com`) dengan cache & atribusi.
   - Harga emas spot tidak memiliki sumber gratis berlisensi yang dapat diasumsikan. Disediakan kontrak trait `GoldPriceProvider` + implementasi default `UnconfiguredGoldProvider` sehingga widget menampilkan pesan jujur ("Emas: butuh API berlisensi") sampai API berlisensi dipilih.
2. **Hari Libur Nasional SKB 3 Menteri (Widget #26)**:
   - Tanggal Hijriyah dihitung 100% offline dengan opsi geser +/-1 hari.
   - Jadwal libur nasional tidak dikarang di dalam kode. Widget membaca berkas JSON resmi `%APPDATA%\com.faiz.gili\skb3menteri_holidays.json`. Bila berkas belum diimpor, widget menampilkan catatan informatif bahwa data SKB 3 Menteri belum tersedia.
3. **Papan Skor Bola (Widget #28)**:
   - Disediakan kontrak trait `FootballScoreProvider` + `UnconfiguredFootballProvider` serta tampilan state kosong yang ramah karena layanan skor langsung komersial memerlukan lisensi API resmi (misalnya API-Football / Sportradar) dan tidak boleh diambil lewat scraping.
4. **Aset Sprite Maskot Hidup Gili (Widget #21)**:
   - Saat ini memakai karakter vektor orisinal ringan berbasis Direct2D (8-10 fps) sebagai placeholder aman tanpa aset pihak ketiga. Untuk produksi rilis penuh, disarankan menugaskan desainer membuat sprite sheet orisinal Gili (idle, fokus, malam, reaksi klik).

---

## 4. Risiko Tersisa dan Mitigasi

1. **Perilaku `Win+D` (Show Desktop) di Windows 11**:
   - Karena sengaja menghindari teknik injeksi `WorkerW` tak berdokumen pada `explorer.exe` demi stabilitas lintas pembaruan Windows, beberapa versi Windows 11 dapat menyembunyikan sementara jendela `HWND_BOTTOM` saat `Win+D` ditekan sebelum `WM_SHOWWINDOW` / loop pemulihan menampilkannya kembali. Pengujian langsung di versi Windows 11 target disarankan.
2. **DWM Acrylic per Kartu pada Satu Swap Chain Multi-Widget**:
   - Mode Kaca saat ini merender efek kaca translusen pada permukaan DirectComposition dan otomatis fallback ke Solid saat transparansi OS mati atau Penghemat Daya aktif. Untuk blur latar belakang DWM per-kartu terpisah pada satu jendela, diperlukan pohon visual `Windows.UI.Composition` per kartu dengan `HostBackdropBrush` sebagai iterasi lanjutan bila diinginkan.
3. **Ekstraksi Ikon Pintasan (`IShellItemImageFactory`)**:
   - Widget Pintasan saat ini menampilkan nama dan path secara eksplisit dengan kartu bersih Direct2D. Pemetaan bitmap ikon native `IShellItemImageFactory` ke cache bitmap Direct2D dapat ditambahkan sebagai penyempurnaan visual tahap berikutnya tanpa mengubah skema `ShortcutEntry`.
4. **Cakupan UI Automation Lanjutan**:
   - Host sudah mengekspose judul aksesibel tingkat jendela melalui `WM_GETOBJECT` / `DefWindowProcW`, namun penyedia pohon anak `IRawElementProviderFragment` per widget untuk navigasi fokus Narrator penuh direkomendasikan di iterasi berikutnya.
