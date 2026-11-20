# Arsitektur Sistem Widget Desktop Native Gili (`gili-widgets`)

Dokumen ini menjelaskan rancangan teknis mesin widget desktop native Direct2D yang dibangun sebagai crate terpisah `src-tauri/crates/gili-widgets` dan terhubung ke Gili melalui `src-tauri/src/desktop_widgets_bridge.rs`.

---

## 1. Prinsip Arsitektur

1. **Satu Sumber Data, Dua Tampilan**: Widget desktop memakai kembali store backend dan data modul Gili yang sudah ada (`media_lyrics_store`, `gpu_telemetry`, `connectivity`, `shelf.json`, serta mirror ringan dari store frontend) sehingga logika bisnis tidak diduplikasi.
2. **Nol WebView per Widget**: Seluruh widget di satu monitor dirender pada satu jendela Win32 transparan dengan Direct2D + DirectComposition. WebView2 hanya dipakai untuk jendela Pengaturan & Galeri.
3. **Transparan Sejati & Tembus Klik**: Secara default (`BackgroundMode::None`) tidak ada kartu latar. `WM_NCHITTEST` memanggil `hit_test_scene` pada koordinat DIP monitor dan mengembalikan `HTTRANSPARENT` di luar piksel konten widget, sehingga ikon desktop dan jendela lain di belakang tetap dapat diklik secara normal.

---

## 2. Pipeline Grafis Direct2D + DirectComposition

Komponen utama berada di `src-tauri/crates/gili-widgets/src/d2d_host/`:

- **Pemilihan GPU Hemat Daya (`device.rs`)**:
  - Menggunakan `IDXGIFactory6::EnumAdapterByGpuPreference(DXGI_GPU_PREFERENCE_MINIMUM_POWER)` untuk memprioritaskan iGPU pada laptop dua GPU, dengan fallback ke `EnumAdapters1(0)` lalu Microsoft WARP bila adapter perangkat keras gagal.
  - Perangkat dibuat dengan `D3D11_CREATE_DEVICE_BGRA_SUPPORT`, dihubungkan ke `ID2D1DeviceContext` dan `IDCompositionDevice`.
- **Swap Chain & Komposisi**:
  - Satu `IDXGISwapChain1` flip-model (`DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL`, `DXGI_FORMAT_B8G8R8A8_UNORM`, `DXGI_ALPHA_MODE_PREMULTIPLIED`) per monitor, dipasang ke `IDCompositionVisual` dan `IDCompositionTarget` pada HWND `WS_EX_NOREDIRECTIONBITMAP`.
  - Per-Monitor DPI v2 diaktifkan pada thread host (`DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`), menangani `WM_DPICHANGED` dan `WM_DISPLAYCHANGE`.
- **Tipografi DirectWrite**:
  - Anti-aliasing teks selalu memakai `D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE` (bukan ClearType) agar tidak timbul artefak warna di atas permukaan alpha premultiplied.
  - Angka jam dan metrik menerapkan fitur OpenType tabular (`DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES`).
  - Faktor skala teks sistem dibaca dari `UISettings::TextScaleFactor()` (dibatasi `1.0` hingga `1.5`).
- **Cache Bayangan/Halo & Dirty Rect (`renderer.rs`)**:
  - Bayangan lembut dan halo opsional pada mode tanpa latar dirender ke `ID2D1Bitmap1` offscreen ber-cache per slot berdasarkan hash isi & gaya, sehingga frame statis tidak menghitung ulang bayangan.
  - Hash tiap `WidgetRenderItem` dibandingkan dengan frame sebelumnya. Hanya persegi panjang yang berubah (`dirty_rects`) dikirim ke `IDXGISwapChain1::Present1`.
- **Pemulihan Device Lost**:
  - Kode error `DXGI_ERROR_DEVICE_REMOVED` dan `DXGI_ERROR_DEVICE_RESET` ditangkap pada saat presentasi dan memicu pembuatan ulang `D2DDeviceResources`, `D2DWidgetRenderer`, dan `MonitorSwapChain` tanpa crash.

---

## 3. Mode Tampil dan Perilaku Z-Order

1. **Mode Tempel di Desktop (`DisplayMode::DesktopAttached`)**:
   - Memakai jendela `WS_POPUP | WS_CLIPSIBLINGS` dengan `WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_NOREDIRECTIONBITMAP`.
   - Menjaga z-order di lapisan paling bawah (`HWND_BOTTOM`) melalui intersep `WM_WINDOWPOSCHANGING` (`wp.hwndInsertAfter = HWND_BOTTOM`) tanpa injeksi tak berdokumen ke proses `explorer.exe` / `WorkerW`, sehingga lebih aman terhadap pembaruan Windows 11.
2. **Mode Papan Widget (`DisplayMode::WidgetBoard`)**:
   - Overlay `HWND_TOPMOST` dengan scrim tipis yang muncul lewat hotkey global (`Ctrl+Alt+W`, dapat diubah) atau menu tray, lalu menutup seketika dengan tombol `Esc` atau klik di luar area konten widget.

---

## 4. Mode Latar, Auto-Kontras Wallpaper, dan Aksesibilitas

- **4 Mode Latar (`config.rs`)**:
  1. `none` (default): hanya konten.
  2. `subtle_tint`: kartu transparan 10% sampai 25%.
  3. `glass`: kartu kaca dengan fallback otomatis ke `solid` ketika transparansi Windows nonaktif (`EnableTransparency == 0`) atau Penghemat Daya aktif. Tidak pernah menangkap layar (screenshot) untuk blur.
  4. `solid`: kartu opak.
  - Mode 2 sampai 4 memakai kurva sudut halus superellipse (`CARD_RADIUS_DP = 24`, smoothing 60%), garis tepi dalam 1 px putih 8-12% alpha, dan rumus radius konsentris (`concentric_radius`).
- **Auto-Kontras Tanpa Tangkapan Layar (`contrast.rs`)**:
  - Jalur berkas wallpaper diambil dari `SPI_GETDESKWALLPAPER` dengan fallback ke `%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper`.
  - Gambar diperkecil ke buffer RGB <= 320 px di memori, lalu dihitung luminans relatif WCAG 2.1 tepat di area koordinat tiap widget.
  - Jika rasio kontras warna teks kustom terhadap area wallpaper < 4.5:1 pada mode tanpa latar, panel kustomisasi menampilkan peringatan kontras rendah.
- **Input Teks Native & Aksesibilitas**:
  - Untuk widget yang membutuhkan ketikan (Catatan Tempel, Kanban, Pengeluaran, Tanya Cepat AI), host memunculkan kontrol Win32 `EDIT` native kecil tepat di atas widget sehingga IME, seleksi teks, clipboard, dan pembaca layar berfungsi penuh.
  - Mode Kontras Tinggi Windows (`SPI_GETHIGHCONTRAST`) memaksa kartu solid kontras tinggi. Pengaturan kurangi gerak (`SPI_GETCLIENTAREAANIMATION`) mematikan jiggle dan spring menjadi transisi langsung/fade.

---

## 5. Scene Graph Deklaratif (Siap untuk SDK Pihak Ketiga)

`SceneNode` dan `WidgetRenderItem` di `src/layout.rs` dirancang sepenuhnya deklaratif dan serializable (`serde`). Setiap widget cukup mengembalikan pohon `Vec<SceneNode>` (teks, kartu superellipse, cincin progres, sparkline, bar chart, heatmap, treemap, jam analog, garis, referensi gambar) bersama `interactive_action` opsional. Kontrak ini memungkinkan integrasi plugin/SDK widget pihak ketiga di tahap pengembangan berikutnya tanpa mengubah renderer Direct2D.

---

## 6. Kebijakan Frame Rate Adaptif dan Keamanan

- **Frame Rate Adaptif (`compute_adaptive_target_fps`)**:
  - Idle: `0 fps` (thread hanya terbangun saat data/menit berubah atau ada pesan input).
  - Jam dengan detik: `1 Hz` (tanpa detik: diperbarui 1 kali per menit).
  - Maskot hidup: `8-10 fps`; Visualizer audio: maksimal `30 fps`.
  - Animasi spring / drag / mode edit: `60 fps`, otomatis dibatasi `30 fps` saat Penghemat Daya aktif.
  - Jeda total (`0 fps`) saat layar mati (`WM_POWERBROADCAST`) atau aplikasi layar penuh / game aktif (`SHQueryUserNotificationState`).
- **Keamanan & Privasi**:
  - Token GitHub fine-grained read-only disimpan di Windows Credential Manager (`GiliNotch/DesktopWidget/github_pat`), tidak pernah ditulis ke berkas JSON atau log.
  - Data pengeluaran dienkripsi lokal memakai Windows DPAPI (`CryptProtectData` / `CryptUnprotectData`), nol telemetri.
  - Permintaan jaringan melewati validasi HTTPS + larangan host lokal/loopback (anti-SSRF) serta backoff eksponensial.
