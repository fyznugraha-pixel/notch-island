# T2: KEBIJAKAN DAN RANCANGAN ARSITEKTUR SKALA TEKS WINDOWS

Dokumen ini memuat rancangan arsitektur teknis untuk menangani Skala Teks Windows (Windows Text Size) pada aplikasi Gili Island, dengan fokus awal pada modul Mini Player.

---

## 1. Kebijakan Penskalaan (Scaling Policy)

### A. Rumus Skala Efektif (Effective Scale Factor)
Windows mengizinkan pengguna memilih skala teks dari 100% (1.0) hingga 225% (2.25).
Jika jendela desktop membesar mengikuti skala hingga 2.25x:
- Jendela Mini Player (Card) akan berukuran 855px x 765px, yang terlalu mendominasi layar desktop dan merusak filosofi *mini* player.
- Mengunci skala di 1.0x membuat teks terpotong dan tidak ramah aksesibilitas.

Oleh karena itu, ditetapkan aturan **Skala Efektif (Clamped Scale)**:
```
skala_efektif = clamp(TextScaleFactor, 1.0, 1.5)
```
- **Rentang 1.0x sampai 1.5x (100% - 150%)**:
  Jendela mini player dan seluruh tata letak membesar secara proporsional mengikuti teks. Teks judul, artis, lirik, dan tombol kontrol tampil penuh tanpa pemotongan.
- **Rentang di atas 1.5x (150% - 225%)**:
  Pertumbuhan tata letak dan ukuran jendela berhenti pada batas maksimum 1.5x. Teks yang melampaui ruang kontainer akan dipotong rapi menggunakan elipsis (`text-overflow: ellipsis`) atau pembatasan baris (`line-clamp`), sehingga jendela tidak meluber memenuhi layar.

---

## 2. Pencegahan Penskalaan Ganda (Anti-Double Scaling)

Berdasarkan temuan diagnostik T1:
- WebView2 Chromium **sudah secara otomatis** memperbesar ukuran teks DOM saat `TextScaleFactor` Windows berubah.
- **Keputusan Arsitektur**:
  1. Frontend CSS **TIDAK BOLEH** mengalikan lagi `font-size` dengan `TextScaleFactor` secara manual via JavaScript, karena hal itu akan menyebabkan pembesaran eksponensial (double scaling: 1.5 * 1.5 = 2.25x).
  2. Frontend hanya perlu menyediakan **ruang kontainer yang elastis** (menggunakan satuan `rem`/`em` atau flexbox `flex: 1` dengan `min-height: 0`) agar font yang sudah diperbesar oleh WebView2 tertampung dengan pas.
  3. Backend Win32 Tauri bertugas **memperbesar ukuran jendela (HWND)** sebesar `skala_efektif` agar kanvas WebView2 memiliki ruang yang cukup.

---

## 3. Arsitektur Backend (Rust Win32)

### A. Ukuran Jendela Berdasarkan Skala Efektif
Dimensi dasar jendela Mini Player pada skala 100% (1.0x):
- Card Mode: Dasar 380px (lebar) x 340px (tinggi).
- Bar Mode: Dasar 440px (lebar) x 120px (tinggi).

Perhitungan ukuran fisik jendela di Rust (`src-tauri/src/miniplayer_window.rs`):
```rust
let text_scale = get_system_text_scale().clamp(1.0, 1.5);
let dpi_sf = window.scale_factor().unwrap_or(1.0);

let target_logical_w = base_width * text_scale;
let target_logical_h = base_height * text_scale;

let target_phys_w = (target_logical_w * dpi_sf).round() as i32;
let target_phys_h = (target_logical_h * dpi_sf).round() as i32;
```

### B. Menjaga Posisi Relatif (Edge Anchoring)
Ketika ukuran jendela membesar atau mengecil akibat perubahan skala:
1. **Deteksi Tepi Terdekat**:
   - Jika jendela berada di paruh kanan layar: kunci koordinat tepi kanan (`right`). Jendela melebar ke arah kiri.
   - Jika jendela berada di paruh kiri layar: kunci koordinat tepi kiri (`left`). Jendela melebar ke arah kanan.
   - Kunci koordinat tepi bawah (`bottom`): jendela selalu mengembang ke atas dari bawah layar kerja (work area).
2. **Penjepitan ke Area Kerja Monitor (Work Area Clamping)**:
   Posisi `(new_x, new_y)` selalu dijepit (*clamped*) ke batas `rcWork` monitor aktif agar tidak pernah keluar dari layar desktop.

### C. Pendengar Event Perubahan Skala Sistem (Runtime Listener)
Backend Rust mendengarkan event Windows `UISettings.TextScaleFactorChanged`:
- Mengirim event ke frontend: `app.emit("system:text-scale-changed", text_scale)`.
- Menyesuaikan ukuran jendela aktif secara otomatis tanpa memerlukan restart aplikasi.

---

## 4. Arsitektur Frontend Mini Player

### A. Konversi Dimensi Statis ke Dimensi Adaptif
1. **Shell Container (`MiniPlayerApp.tsx`)**:
   - `targetShellWidth`: `mode === "card" ? 380 * scale : 440 * scale`.
   - `targetShellHeight`:
     - Card mode (idle): `298 * scale`.
     - Card mode (hover toolbar): `340 * scale`.
     - Bar mode (idle): `88 * scale`.
     - Bar mode (hover toolbar): `130 * scale`.
2. **Card Mode (`MiniPlayerCardMode.tsx`)**:
   - Ganti `flex flex-col justify-end` dengan `flex flex-col justify-between`.
   - Header: gunakan `min-h-[60px] h-auto shrink-0`. Artwork album diskalakan proporsional atau tetap 60px dengan teks judul yang memiliki ruang fleksibel.
   - Slot Lirik: ubah dari `h-[196px] min-h-[196px] max-h-[196px]` menjadi kontainer fleksibel `flex-1 min-h-0 w-full overflow-hidden`.
   - Posisi Baris Aktif: fungsi `computeCenteredTranslateY` membaca tinggi riil kontainer dari DOM (`list.clientHeight`) secara dinamis, bukan angka perkiraan 196px.
   - Progress Bar: tetap berada di bagian paling bawah dengan `shrink-0`.
3. **Bar Mode (`MiniPlayerBarMode.tsx` & `BarLyricSlot.tsx`)**:
   - Ganti batas kaku `h-[38px]` pada slot lirik dengan `flex-1 min-h-[38px]`.
   - Pengukuran teks canvas di `lyricsLayout.ts` mengalikan `fontSize` dengan `scale_efektif` sebelum melakukan text wrapping, sehingga kalkulasi pemecahan 2 baris akurat sesuai tampilan DOM.

---

## 5. Pengaturan Pengguna (User Setting)

Untuk memberikan fleksibilitas penuh kepada pengguna:
- **Nama Pengaturan**: "Ikuti ukuran teks Windows" (`follow_system_text_scale`).
- **Lokasi**: Jendela Pengaturan > Aksesibilitas / Tampilan.
- **Nilai Bawaan**: `true` (aktif).
- **Perilaku**:
  - `true`: Mini player dan jendela mengikuti skala teks Windows (1.0x - 1.5x).
  - `false`: Mini player dan jendela tetap terkunci pada skala 100% (1.0x) standar, mengabaikan pengaturan Windows jika pengguna menginginkan tampilan mini yang selalu kompak.

---

## 6. Rencana Verifikasi Gerbang T3

Pada tahap implementasi T3 nanti, pengujian harus memenuhi kriteria kelulusan berikut:
1. **Skala 100%**: Tampilan identik 100% dengan desain saat ini (zero regression visual).
2. **Skala 125% dan 150%**: Judul lagu tidak terpotong di tepi atas, baris lirik tidak menabrak progress bar, toolbar hover pas.
3. **Skala 200% dan 225%**: Tata letak tertahan rapi di 1.5x, teks panjang terpotong elipsis dengan aman tanpa meluber keluar jendela.
4. **Pergantian Real-time**: Menggeser slider ukuran teks di Windows Settings langsung memperbarui mini player tanpa glitch dan tanpa restart.

---
Dokumen ini dibuat tanpa tanda pisah panjang (em dash) dan siap untuk peninjauan tahap T2.

