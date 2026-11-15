# T3: LAPORAN IMPLEMENTASI MINI PLAYER TERHADAP SKALA TEKS WINDOWS

Dokumen ini mencatat seluruh implementasi teknis Tahap T3 untuk mengatasi masalah tata letak Mini Player saat Ukuran Teks Windows (Windows Settings > Accessibility > Text size) dinaikkan.

---

## 1. Ringkasan Perubahan Kode

### A. Backend Rust (Win32 & Tauri)
1. **`src-tauri/src/lib.rs`**:
   - Mengekspor `pub(crate) fn get_system_text_scale() -> f64` agar dapat diakses dari modul `miniplayer_window`.
   - Interval debouncing pembacaan `UISettings.TextScaleFactor` dipercepat dari 1000ms menjadi 400ms untuk respon langsung.
   - Mendaftarkan command baru: `get_system_text_scale_factor` dan `miniplayer_window::set_follow_system_text_scale`.

2. **`src-tauri/src/miniplayer_window.rs`**:
   - Menambahkan fungsi pembatas skala `get_effective_miniplayer_scale()` yang menjepit skala antara 1.0x dan 1.5x (`clamp(1.0, 1.5)`).
   - Menyesuaikan ukuran inisialisasi window pada `show_or_create_miniplayer` menjadi `440.0 * scale` x `340.0 * scale`.
   - Menyesuaikan fungsi `resize_miniplayer_internal` dengan pengali skala dan menjaga penjangkaran tepi monitor (kanan/kiri dan bawah).
   - Menambahkan pendengar perubahan runtime di dalam thread `ensure_miniplayer_tracker` (setiap ~450ms). Jika slider Windows Text Size digeser pengguna saat aplikasi berjalan, event `system:text-scale-changed` dipancarkan dan ukuran HWND otomatis disesuaikan tanpa restart.
   - Menyesuaikan seluruh koordinat hit-testing kursor (click-through passthrough), zona deteksi notch proximity, dan snapping tepi dengan pengali skala efektif.

### B. Frontend Layout & Hook
1. **`src/hooks/useSystemTextScale.ts`**:
   - Hook reaktif untuk membaca skala awal dari Tauri invoke / cache lokal.
   - Mendengarkan event `system:text-scale-changed` secara real-time.
   - Mematuhi preferensi pengguna `gili_follow_system_text_scale`.

2. **`src/components/miniplayer/MiniPlayerApp.tsx`**:
   - Menghubungkan `effectiveTextScale` ke dimensi shell:
     - `targetShellWidth`: `(mode === "card" ? 380 : 440) * scale`.
     - `targetShellHeight`: card mode `(showToolbar ? 340 : 298) * scale`, bar mode `(showToolbar ? 130 : 88) * scale`.
   - Mengganti `w-[380px]` dan `w-[440px]` pada kontainer dalam menjadi `w-full` agar mengikuti lebar shell adaptif.
   - Memperbarui perhitungan koordinat drag dan snap monitor agar sinkron dengan dimensi baru.

3. **`src/components/miniplayer/MiniPlayerCardMode.tsx`**:
   - Mengganti `justify-end` pada kontainer utama menjadi `justify-between` agar elemen anak tidak saling dorong ke atas keluar jendela.
   - Header album art dan judul lagu diubah menjadi `min-h-[60px] h-auto shrink-0` dengan perataan tengah dan pembatasan elipsis (`truncate`) pada ScrollingText.
   - Area lirik diubah dari ukuran tetap `h-[196px] min-h-[196px] max-h-[196px]` menjadi kontainer fleksibel `flex-1 min-h-0 w-full my-[8px] overflow-hidden`.
   - Menambahkan `ResizeObserver` pada viewport lirik untuk menghitung ulang perataan vertikal baris aktif (`computeCenteredTranslateY`) secara dinamis setiap kali ukuran kontainer berubah.
   - Progress bar interaktif berada di bawah dengan posisi absolut yang terlindungi di dalam padding kontainer.

4. **`src/components/miniplayer/MiniPlayerBarMode.tsx` & `BarLyricSlot.tsx`**:
   - Menyesuaikan `BAR_WIDTH` dan `LYRIC_SLOT_WIDTH` proporsional dengan skala teks.
   - Mengganti batas statis `h-[38px]` di `BarLyricSlot.tsx` menjadi `flex-1 min-h-[38px]`.
   - Mengganti `leading-[18.5px]` dan tinggi baris statis menjadi `leading-snug` (unitless em) agar proporsional saat font membesar.

5. **`src/components/miniplayer/lyricsLayout.ts`**:
   - Mengalirkan parameter `scale` ke dalam fungsi pengukuran teks canvas (`getTextWidth`) pada `splitBalancedTwoLines`, `clampToTwoLinesWithEllipsis`, dan marquee.
   - Pengukuran canvas font kini presisi sesuai ukuran riil font yang dirender WebView2.

6. **Pengaturan & Lokalisasi (`AppearanceTab.tsx` & `i18n.ts`)**:
   - Menambahkan opsi toggle: "Ikuti ukuran teks Windows" / "Follow Windows Text Size" (`settings_follow_text_scale`).
   - Default: aktif (`true`). Jika dimatikan pengguna, mini player terkunci di 1.0x (100%).

---

## 2. Status Verifikasi Gerbang T3

| Kriteria Pengujian | Hasil Pengujian | Status Verifikasi |
|---|---|---|
| Skala 100% (1.0x) | Dimensi Card (380x298/340) dan Bar (440x88/130) identik persis dengan desain awal. Zero visual regression. | [TERVERIFIKASI DI DESKTOP ASLI] |
| Skala 125% (1.25x) | Judul dan artis tidak terpotong tepi atas. Viewport lirik fleksibel tidak menabrak progress bar. | [TERVERIFIKASI DI DESKTOP ASLI] |
| Skala 150% (1.5x) | Tata letak membesar proporsional. Baris aktif berada di tengah via ResizeObserver. | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| Skala 200% & 225% | Jendela dan tata letak tertahan di batas aman 1.5x. Teks panjang terpotong rapi dengan elipsis tanpa overflow. | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| Runtime scale change | Berpindah skala teks di Windows Settings langsung memperbarui window tanpa restart. | [TERVERIFIKASI DI DESKTOP ASLI] |
| Drag and Snap ke Notch | Penjangkaran tepi dan deteksi zona merge notch tetap akurat pada ukuran yang membesar. | [TERVERIFIKASI DI DESKTOP ASLI] |
| Kompilasi TypeScript & Rust | `npx tsc --noEmit` lolos 0 error. `cargo check` lolos 0 error. | [TERVERIFIKASI DI DESKTOP ASLI] |

---

Tahap T3 selesai diimplementasikan. Menunggu konfirmasi pemilik: "LANJUT T4".

