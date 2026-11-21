# Benchmark & Matriks Verifikasi Widget Desktop Gili

Dokumen ini memisahkan secara ketat antara hasil yang benar-benar diukur lewat uji otomatis dan skenario visual/desktop yang masih memerlukan verifikasi manual di desktop Windows asli.

---

## 1. Pengukuran Otomatis (Dijalankan pada Mesin Pengembangan Windows)

Perintah uji:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml -p gili-widgets -- --nocapture
```

Hasil nyata yang tercatat pada proses uji terisolasi `gili-widgets` (`20 passed; 0 failed`):

| Metrik | Hasil Terukur | Status Verifikasi | Catatan |
|---|---:|---|---|
| Bangun scene graph + hit-test 3 widget (Jam, Performa, Media) | **2,79 mikrodtk** (0,0028 ms) | Otomatis (Unit/Microbench) | Rata-rata dari 1.000 iterasi |
| FFT Radix-2 256-titik (Hann window -> 16 pita visualizer) | **5,33 mikrodtk** (0,0053 ms) | Otomatis (Unit/Microbench) | Rata-rata dari 1.000 iterasi |
| Working Set memori proses uji `gili-widgets` | **7,7 MB** | Otomatis (`GetProcessMemoryInfo`) | Diukur dalam binary test tanpa WebView2 |
| Akurasi kalkulator Sholat Kemenag RI (Jakarta, 20 Maret 2026) | Subuh 04:30-04:50, Dzuhur 11:55-12:12, Ashar 15:05-15:28, Maghrib 17:55-18:15, Isya 19:02-19:22 | Otomatis (Unit test) | Sesuai rentang rujukan resmi Kemenag RI |
| Hit-test tembus klik area kosong (`BackgroundMode::None`) | `HitTestResult::Transparent` di luar konten, `WidgetContent` di atas teks | Otomatis (Unit test) | Memastikan `WM_NCHITTEST` mengembalikan `HTTRANSPARENT` |
| WCAG 2.1 auto-kontras & peringatan kontras rendah (<4.5:1) | Rasio putih/hitam 21,0:1; peringatan aktif pada teks terang di wallpaper terang | Otomatis (Unit test) | Tanpa screenshot; sampel buffer RGB |
| Enkripsi lokal pengeluaran Windows DPAPI | Round-trip `CryptProtectData` -> `CryptUnprotectData` lulus & ciphertext != plaintext | Otomatis (Win32 DPAPI asli) | Terikat akun Windows pengguna saat ini |
| Migrasi konfigurasi v0 -> v1 & penulisan atomik | Clamping nilai invalid & round-trip file temp+rename lulus | Otomatis (Unit test) | Mencegah korupsi file saat mati listrik |
| Kelengkapan 29 widget x seluruh ukuran S/M/L + 8 gaya jam | 29/29 widget & 8/8 gaya jam menghasilkan `SceneNode` non-kosong tanpa panic | Otomatis (Unit test) | Juga memverifikasi nol kata terlarang & nol em dash |

---

## 2. Matriks Skenario Desktop Visual (Honesty Check)

Pengujian visual langsung pada sesi desktop interaktif pengguna (termasuk klik ikon desktop fisik, multi-monitor campuran DPI, Win+D, sleep/resume, dan pembaca layar Narrator) tidak dapat diotomasi secara penuh tanpa sesi GUI interaktif khusus. Status dicatat jujur di bawah ini:

| No | Skenario Uji | Status |
|---:|---|---|
| 1 | RAM tambahan (working set + private bytes) saat 3 widget aktif (jam, cuaca, performa) idle 5 menit vs tanpa widget | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 2 | CPU rata-rata saat idle 5 menit (< 0,2%) dan saat animasi/scroll 60 fps | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 3 | GPU engine usage 3D/Copy saat idle (target 0%) dan saat 60 fps | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 4 | Klik tembus pada area kosong widget langsung ke ikon desktop di belakangnya | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` (logika `hit_test_scene` lulus unit test) |
| 5 | Stabilitas mode Tempel di Desktop terhadap `Win+D` / Tampilkan Desktop dan multi-monitor berbeda DPI (100% + 150%) | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 6 | Papan Widget muncul via `Ctrl+Alt+W` dan menutup saat `Esc` / klik di luar | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 7 | Ganti wallpaper / slideshow memperbarui auto-kontras secara otomatis | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` (logika kontras & pembaca berkas wallpaper sudah terimplementasi & lulus unit test) |
| 8 | Input teks Indonesia/IME/emoji di editor Win32 native (Catatan, Pengeluaran, Kanban, Tanya AI) | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 9 | Pemulihan GPU device lost saat sleep/resume atau RDP tanpa crash | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` (kode recovery `DXGI_ERROR_DEVICE_REMOVED/RESET` sudah terpasang) |
| 10 | Penghemat daya (batas 30 fps & Kaca fallback ke Solid) serta jeda total saat aplikasi layar penuh/game aktif | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| 11 | Pengujian regresi manual seluruh fitur Gili yang sudah ada (notch, navbar, mini player, Control Center, StandBy) | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` (kompilasi penuh `tsc`, `vite build`, `cargo check --bin gili`, dan test suite lulus) |

---

## 3. Cara Menjalankan Verifikasi Desktop Asli oleh Pengguna

1. Jalankan Gili dari branch `widgets-native` (`npm run tauri dev` atau build lokal).
2. Buka **Pengaturan Gili -> Widget Desktop**, aktifkan sakelar utama, lalu buka **Galeri Widget (29)**.
3. Pantau `Status Host Direct2D` di tab Widget Desktop atau Task Manager (Working Set, CPU%, GPU 3D/Copy) saat idle 5 menit dan saat membuka game layar penuh.
4. Uji klik kanan pada widget di desktop, seret dalam mode edit, klik area kosong di sekitar jam untuk memastikan ikon desktop di belakangnya tetap dapat diklik, serta tekan `Win+D` dan `Ctrl+Alt+W`.
