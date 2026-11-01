# Gili Performance Baseline & Optimization Benchmark

> Dokumen ini mencatat metrik baseline performa sebelum implementasi Gili Navbar, target performa yang ditetapkan, serta metode pengukuran berkala sesuai bagian **7B Langkah 0** pada `prompt navbar.md`.

---

## 1. Lingkungan Pengukuran

- **OS**: Windows 11
- **Logical CPU Cores**: 20 Cores
- **Engine**: Tauri v2 + WebView2 (Chromium Evergreen)
- **Metode Pengukuran**:
  - Script sampling otomatis PowerShell (`Get-CimInstance Win32_Process` & `Get-Process`) yang memantau **seluruh pohon proses** (`gili.exe` + semua proses anak `msedgewebview2.exe`).
  - Total Memory = Sum of Private Working Set seluruh pohon proses.
  - Total CPU% = Delta CPU Time / elapsed time / core count.

---

## 2. Baseline Awal (Notch v4.3.2 - Sebelum Navbar)

Pengukuran dilakukan dalam kondisi app berjalan (Notch aktif, background listeners berjalan, idle state):

| Metrik | Nilai Terukur (Baseline) | Keterangan |
|---|---|---|
| **Total Proses dalam Pohon** | 10 proses | 1 `gili.exe` + 9 `msedgewebview2.exe` (broker, renderer, GPU, crashpad, utility) |
| **Total Memory (Working Set)** | **~272.05 MB** | Akumulasi seluruh proses WebView2 & Rust |
| **CPU Idle Rata-rata** | **~0.57%** (dari total 20 cores) | Rata-rata saat kursor diam |
| **GPU Engine (3D/DWM)** | **0% - 0.2%** | Render transparan hardware acceleration |

---

## 3. Target Performa Gili Navbar (Maksimal yang Diizinkan)

Sesuai aturan 7B Langkah 0:
1. **CPU Idle**: Rata-rata di bawah **0.5% dari satu core** saat idle (mouse diam, bar tampil).
2. **GPU Idle**: Mendekati **0%** saat tidak beranimasi.
3. **RAM Tambahan**: Memanfaatkan satu WebView2 user-data folder bersama, window `"navbar"` diproyeksikan hanya menambah memori renderer minimal (~30–45 MB).
4. **State SUSPENDED**: Saat layar terkunci, mode game/video fullscreen aktif, atau bar auto-hide tersembunyi, aktivitas polling harus **0% (berhenti total)**.
5. **Zero Duplication**: Notch dan Navbar wajib memakai **satu sampler bersama** (ref-count) di Rust; tidak boleh ada dua loop polling data sistem yang sama.

---

## 4. Matriks Skenario Uji Berkala

Pengujian ini diulang setelah penyelesaian setiap fase:

| Skenario | Target CPU | Target GPU | Status |
|---|---|---|---|
| **S01: Idle 10 Menit** (mouse diam, bar tampil) | < 0.5% | ~0% | *Baseline* |
| **S02: Hover Ikon / Magnify** | < 2.0% | < 5% | *Pending Fase 5* |
| **S03: Buka Settings Window** | < 3.5% (transisi) | < 8% | *Pending Fase 4* |
| **S04: Buka Dialog Tambah Modul (40 modul)** | < 4.0% | < 5% | *Pending Fase 6* |
| **S05: 6 Modul Aktif** | < 0.8% | ~0% | *Pending Fase 7* |
| **S06: Gaya Liquid Aktif** | < 0.8% | < 2% | *Pending Fase 5* |
| **S07: Game / Video Fullscreen (SUSPENDED)** | 0% | 0% | *Pending Fase 3* |
