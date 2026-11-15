# T1: REPRODUKSI DAN DIAGNOSIS MASALAH SKALA TEKS WINDOWS

Dokumen ini berisi hasil reproduksi, analisis mekanisme teknis, daftar dimensi terkunci, dan audit modul aplikasi Gili terkait fitur Skala Teks Windows (Windows Text Size).

---

## 1. Tabel Matriks Reproduksi (Skala Teks Windows x DPI Layar)

Status Pengujian:
- Desktop Asli: Windows 11 (Resolusi 1920x1080 @ 125% DPI dasar).
- Skala Teks: Pengaturan Windows > Aksesibilitas > Ukuran teks (TextScaleFactor 100% sampai 225%).
- Tangkapan Layar Desktop Asli: `docs/text-scale/desktop-reproduction-card-mode.png` (Card Mode pada skala teks tinggi).

Tanda Status:
- `[TERVERIFIKASI DI DESKTOP ASLI]`: Diverifikasi langsung melalui tangkapan layar dan pengujian di desktop Windows asli.
- `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`: Berdasarkan analisis matematis DOM, CSS, dan Win32 canvas (menunggu pengambilan tangkapan layar interaktif lanjutan).

### Tabel 1.1: Matriks Kombinasi Skala Teks x DPI Layar

| No | Skala Teks | DPI Layar | Card Mode (Idle) | Card Mode (Hover) | Bar Mode (Idle) | Bar Mode (Hover) | Status Verifikasi |
|---|---|---|---|---|---|---|---|
| 1 | 100% (1.0x) | 100% (1.0x) | Normal (Header pas, lirik pas) | Normal (Toolbar 36px muat) | Normal (2 baris lirik pas) | Normal (Toolbar 36px muat) | [TERVERIFIKASI DI DESKTOP ASLI] |
| 2 | 100% (1.0x) | 150% (1.5x) | Normal (Skala DPI tajam seragam) | Normal (Skala DPI tajam) | Normal (Layout proporsional) | Normal (Layout proporsional) | [TERVERIFIKASI DI DESKTOP ASLI] |
| 3 | 100% (1.0x) | 200% (2.0x) | Normal (DPI 4K tajam seragam) | Normal (DPI 4K tajam) | Normal (Layout proporsional) | Normal (Layout proporsional) | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 4 | 125% (1.25x) | 100% (1.0x) | Judul lagu mulai rapat ke atas | Header terdorong ke atas ~12px | Slot 2 baris terpotong ~4px | Toolbar menekan teks media | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 5 | 125% (1.25x) | 150% (1.5x) | Judul rapat ke atas, lirik padat | Header terdorong ~14px | Baris kedua lirik terpotong | Toolbar menekan teks media | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 6 | 125% (1.25x) | 200% (2.0x) | Gejala sama dengan 125% x 100% | Header terdorong ~14px | Baris kedua lirik terpotong | Toolbar menekan teks media | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 7 | 150% (1.5x) | 100% (1.0x) | Judul terpotong 30%, lirik nabrak bar | Judul hilang 50%, bar tertutup | 2 baris lirik terpotong 50% | Teks judul menabrak toolbar | [TERVERIFIKASI DI DESKTOP ASLI] |
| 8 | 150% (1.5x) | 150% (1.5x) | Judul terpotong separuh, lirik tabrakan | Header hilang separuh | 2 baris lirik tidak muat | Teks judul menabrak toolbar | [TERVERIFIKASI DI DESKTOP ASLI] |
| 9 | 150% (1.5x) | 200% (2.0x) | Gejala sama persis dengan skala 150% | Header hilang separuh | Baris kedua hilang | Teks judul menabrak toolbar | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 10 | 200% (2.0x) | 100% (1.0x) | Judul hilang total, lirik bertumpuk | Layout hancur total | Hanya muat 1 baris terpotong | Overlap parah di seluruh bar | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 11 | 200% (2.0x) | 150% (1.5x) | Judul hilang, lirik menabrak bar | Layout hancur total | Hanya muat 1 baris terpotong | Overlap parah di seluruh bar | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 12 | 200% (2.0x) | 200% (2.0x) | Judul hilang, lirik menabrak bar | Layout hancur total | Hanya muat 1 baris terpotong | Overlap parah di seluruh bar | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 13 | 225% (2.25x) | 100% (1.0x) | Teks sangat besar, keluar kanvas | Konten tertolak keluar batas | Teks meluber keluar batas | Teks menutupi seluruh tombol | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 14 | 225% (2.25x) | 150% (1.5x) | Teks sangat besar, keluar kanvas | Konten tertolak keluar batas | Teks meluber keluar batas | Teks menutupi seluruh tombol | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |
| 15 | 225% (2.25x) | 200% (2.0x) | Teks sangat besar, keluar kanvas | Konten tertolak keluar batas | Teks meluber keluar batas | Teks menutupi seluruh tombol | [BELUM DIVERIFIKASI DI DESKTOP ASLI] |

Bukti Tangkapan Layar Desktop Asli:
- Berkas: `docs/text-scale/desktop-reproduction-card-mode.png`
- Kasus: LANY - Stuck pada mode Card di desktop Windows asli.
- Hasil pengamatan visual:
  1. Teks judul "Stuck" terpotong di tepi atas (setengah bagian atas huruf 'S', 't', 'u', 'c', 'k' terpotong oleh overflow kanvas).
  2. Baris lirik terbawah ("won't ever leave your side") menabrak dan menempel langsung ke garis progress bar di bawahnya.
  3. Header (artwork 60px, judul, artis) terdorong ke atas akibat desakan ketinggian lirik di bawahnya.

---

## 2. Pembuktian Mekanisme Teknis

### A. Perbedaan Skala DPI vs Skala Teks Windows
1. **Skala DPI Layar (Display DPI Scaling: 100%, 125%, 150%, 200%)**:
   - Dikelola oleh Windows DWM dan driver display.
   - Di Windows API: dibaca lewat `GetDpiForWindow` atau `MonitorFromWindow`.
   - Di Tauri/WebView2: `window.scale_factor()` otomatis mengalikan seluruh ukuran koordinat fisik dan logis secara proporsional. Seluruh window, kontainer div, border, gambar, dan font membesar secara serentak (uniform 1:1). Tidak terjadi layout shift atau clipping internal.
2. **Skala Teks Windows (Accessibility Text Size: 100% sampai 225%)**:
   - Dikelola oleh subsistem Windows Accessibility (`Windows.UI.ViewManagement.UISettings.TextScaleFactor` dan registry `HKCU:\Software\Microsoft\Accessibility\TextScaleFactor`).
   - Fitur ini khusus dirancang agar teks lebih mudah dibaca oleh pengguna dengan keterbatasan penglihatan tanpa memperbesar elemen non-teks.

### B. Perilaku Microsoft Edge WebView2 (Chromium Core)
1. **Elemen yang dipengaruhi**:
   - WebView2 secara otomatis mendeteksi `TextScaleFactor` Windows dan menerapkannya langsung ke kalkulasi rendering font CSS di dalam DOM.
   - Berlaku untuk font-size dengan satuan `px` maupun `rem`:
     - Font `text-[15px]` pada skala teks 150% dihitung menjadi `15px * 1.5 = 22.5px`.
     - Font `text-[12px]` pada skala teks 150% dihitung menjadi `12px * 1.5 = 18.0px`.
     - Font `text-[14.5px]` pada skala teks 150% dihitung menjadi `14.5px * 1.5 = 21.75px`.
   - Nilai `line-height` relatif (seperti `leading-snug`, `leading-[1.35]`) otomatis ikut membesar proporsional dengan ukuran font.
2. **Elemen yang TIDAK dipengaruhi oleh WebView2**:
   - Ukuran kontainer CSS yang menggunakan nilai piksel eksplisit:
     - `w-[380px]`, `w-[440px]`
     - `h-[60px]`, `h-[196px]`, `h-[38px]`, `h-14`
     - Padding: `p-[14px_18px_20px]`, `py-[5px]`
     - Gap dan margin: `mt-[8px]`, `gap-3.5`, `mb-[6px]`
3. **Perilaku Ukuran Window Tauri (Win32 HWND)**:
   - Ukuran jendela Win32 `miniplayer` dibuat dan dikunci di backend Rust (`miniplayer_window.rs` baris 372 dan baris 566):
     `inner_size(440.0, 340.0)` dan `resize_miniplayer_internal(&app, 440.0, 340.0, false)`.
   - Backend Rust hanya mengalikan ukuran dengan `w.scale_factor()` (DPI layar), dan **sama sekali tidak mengalikan dengan `get_system_text_scale()`**.
   - Akibatnya: ukuran jendela tetap 440x340 piksel logis, sedangkan teks di dalamnya membesar hingga 1.5x - 2.25x.

### C. Mekanisme Terjadinya Pemotongan (Root Cause Chain)
1. Window terkunci di `440px x 340px`.
2. Di `MiniPlayerApp.tsx` (baris 581-588), shell memiliki batas tinggi animasi tetap:
   - Card Mode: `targetShellHeight = showToolbar ? 340 : 298` px.
   - Bar Mode: `targetShellHeight = showToolbar ? 130 : 88` px.
3. Kontainer `MiniPlayerCardMode.tsx` (baris 189) menggunakan:
   `className="relative box-border w-[380px] h-full text-white select-none p-[14px_18px_20px] flex flex-col justify-end overflow-hidden"`
4. Perhatikan properti `flex flex-col justify-end overflow-hidden`:
   - Karena kontainer menggunakan `justify-end`, seluruh elemen anak diposisikan menempel ke bagian bawah kontainer.
   - Total kebutuhan tinggi konten pada skala teks 100%:
     Padding atas (14px) + Header (60px) + Margin (8px) + Slot lirik (196px) + Margin (6px) + Progress bar (4px) + Padding bawah (20px) = 308px.
     Nilai 308px pas berada di dalam batas 298px-340px.
   - Saat skala teks naik ke 150%:
     Header membutuhkan ~76px, lirik membutuhkan ~270px. Total kebutuhan melonjak menjadi >390px.
   - Karena tingginya melebihi `targetShellHeight` (298px) dan kontainer berorientasi `justify-end`:
     Seluruh tumpukan konten terdorong ke atas melewati batas atas (y < 0).
   - Properti `overflow-hidden` memotong setiap piksel yang melewati batas atas:
     **Judul lagu "Stuck" yang berada di bagian paling atas langsung terpotong secara horizontal.**
   - Di bagian bawah, slot lirik yang membesar mendesak ke bawah dan menabrak elemen progress bar.

---

## 3. Daftar Dimensi Terkunci yang Menyebabkan Pemotongan

Berikut adalah inventaris seluruh dimensi tetap berbasis piksel (px) yang menjadi titik kegagalan (single points of failure) saat skala teks membesar:

### A. Level Backend Win32 / Tauri Window
1. `src-tauri/src/miniplayer_window.rs`:
   - Baris 372: `.inner_size(440.0, 340.0)`: Ukuran fisik dasar jendela mini player terkunci di 440x340 px logis tanpa memperhitungkan `TextScaleFactor`.
   - Baris 566: `resize_miniplayer_internal(&app, 440.0, 340.0, false)`: Reset ukuran kanvas terkunci di 440x340 px logis.
   - Baris 605-606: `let target_phys_w = (width * sf).round() as i32`: Hanya mengalikan dengan DPI scale `sf`, tidak mengalikan dengan `TextScaleFactor`.

### B. Level Shell MiniPlayerApp
2. `src/components/miniplayer/MiniPlayerApp.tsx`:
   - Baris 580: `const targetShellWidth = mode === "card" ? 380 : 440`: Lebar kartu terkunci 380px dan bar terkunci 440px.
   - Baris 581-588:
     ```ts
     const targetShellHeight =
       mode === "card"
         ? showToolbar ? 340 : 298
         : showToolbar ? 130 : 88;
     ```
     Ketinggian cangkang kartu terkunci mati pada 298px (idle) dan 340px (hover).
     Ketinggian cangkang bar terkunci mati pada 88px (idle) dan 130px (hover).

### C. Level Card Mode
3. `src/components/miniplayer/MiniPlayerCardMode.tsx`:
   - Baris 189: `w-[380px] p-[14px_18px_20px] flex flex-col justify-end overflow-hidden`: Lebar dan padding tetap, orientasi justify-end mendorong konten ke atas saat overflow.
   - Baris 196: `h-[36px] mb-[6px]`: Ketinggian toolbar tetap.
   - Baris 204: `h-[60px] shrink-0`: Ketinggian header terkunci di 60px.
   - Baris 208: `w-[60px] h-[60px]`: Ketinggian artwork album tetap 60px (tidak seimbang dengan teks judul dan artis yang membesar).
   - Baris 245: `h-[196px] min-h-[196px] max-h-[196px] mt-[8px] shrink-0 overflow-hidden`: Slot lirik terkunci mati di 196px.
   - Baris 74-85 (`computeCenteredTranslateY`):
     Perhitungan scrolling lirik menggunakan `listH = list.offsetHeight` (196px tetap) dan `lineCenter = activeEl.offsetTop + activeEl.offsetHeight / 2`. Saat font membesar, posisi scrolling lompat dan memotong baris teratas/terbawah.
   - Baris 389: `mt-[6px] shrink-0`: Jarak progress bar tetap.

### D. Level Bar Mode
4. `src/components/miniplayer/MiniPlayerBarMode.tsx`:
   - Baris 199: `w-[440px] p-[14px_16px_18px] flex flex-col justify-end overflow-hidden`: Lebar tetap 440px.
   - Baris 214: `h-14 shrink-0`: Ketinggian baris media terkunci di 56px (14 * 4px).
   - Baris 219: `w-14 h-14`: Ketinggian artwork album tetap 56px.
   - Baris 231: `h-14`: Kolom teks terkunci 56px.
   - Baris 234: `h-4`: Kontainer judul lagu terkunci di 16px (teks 11.5px * 1.5 = 17.25px langsung terpotong di dalam 16px).
   - Baris 26: `const BAR_WIDTH = 440`: Nilai konstanta lebar tetap.

5. `src/components/miniplayer/BarLyricSlot.tsx`:
   - Baris 90: `h-[38px] min-h-[38px] max-h-[38px]`: Ketinggian slot lirik terkunci di 38px. Dua baris lirik pada skala teks >100% membutuhkan 48px - 72px sehingga baris kedua terpotong.
   - Baris 105: `leading-[18.5px] line-clamp-2`: Line height statis.
   - Baris 121: `h-[20px]`: Ketinggian marquee statis.

6. `src/components/miniplayer/lyricsLayout.ts`:
   - Baris 166: `FONT_STEP_SIZES = [14.5, 14.0, 13.5, 13.0, 12.5, 12.0]`: Ukuran font diukur via canvas 2D tanpa memperhitungkan `TextScaleFactor`, sehingga pemecahan baris lirik (*wrapping*) salah total di DOM riil.

---

## 4. Pemeriksaan Modul Lain di Aplikasi Gili

Selain Mini Player, berikut hasil audit modul lain saat Skala Teks Windows dinaikkan:

| Modul | Letak Kode | Masalah yang Terjadi pada Skala Teks Tinggi | Tingkat Keparahan |
|---|---|---|---|
| **Notch Idle Bar** | `src/App.tsx` (baris 4504-4510)<br>`IdleLyrics.tsx` | Ketinggian idle terkunci di 32px-48px. Teks jam, persentase baterai, dan cuaca/lirik terpotong di tepi atas dan bawah pill. | Tinggi |
| **Notch Expanded (Music / Media)** | `src/App.tsx` (baris 4514)<br>`MediaExpandedPanel.tsx` | `unifiedTabHeight` terkunci mati di 292px (atau 330px di bawah). Judul lagu panjang dan daftar antrean musik meluber menabrak kontrol pemutar. | Sedang |
| **Control Center** | `src/App.tsx` (baris 4518)<br>`ControlCenterPanel.tsx` | Submenu wifi/bluetooth terkunci di 406px. Daftar perangkat wifi terpotong di bagian bawah. Slider brightness dan volume terhimpit label teks. | Sedang |
| **File Shelf (Drop Shelf)** | `src/App.tsx`<br>`DropShelfPanel.tsx` | Ketinggian 292px. Nama file dengan teks besar mendorong thumbnail file keluar dari kotak drop. | Rendah |
| **Todo & Pomodoro** | `TodoListPanel.tsx`<br>`PomodoroPanel.tsx` | Ketinggian 292px. Timer besar pomodoro (font 48px) bertabrakan dengan tombol kontrol start/reset. | Sedang |
| **Prayer Reminder** | `PrayerReminderPanel.tsx`<br>`PrayerMainView.tsx` | Hero card 146px dan 5 prayer cards 42px. Teks nama sholat dan jadwal waktu bertabrakan saat skala teks >= 150%. | Sedang |
| **Settings Window** | `SettingsWindowApp.tsx` | Ukuran window 880x600 px. Tab navigasi samping dan daftar pengaturan memerlukan scrolling vertikal yang tidak rata jika teks besar. | Rendah |

---

## 5. Kesimpulan Diagnosis T1

1. **Dugaan Terbukti Benar**:
   Penyebab utama tampilan mini player rusak adalah **ukuran window dan kontainer layout terkunci pada piksel statis (340px, 196px, 60px, dll)**, sedangkan WebView2 Chromium **secara otomatis menaikkan ukuran font dan line-height** sesuai pengaturan `TextScaleFactor` Windows.
2. **Kombinasi dengan Layout Flexbox**:
   Penggunaan `justify-end` pada kontainer yang tingginya tidak mencukupi memaksa header terdorong ke atas melewati batas kanvas `overflow-hidden`, sehingga judul lagu terpotong tepat di tepi atas.
3. **Kebutuhan Solusi (Langkah ke T2)**:
   Diperlukan arsitektur penskalaan proporsional:
   - Backend Rust harus membaca `UISettings.TextScaleFactor` dan menyesuaikan ukuran window mini player secara dinamis.
   - Frontend harus mengganti dimensi piksel mati dengan layout flex berbasis `rem` / proporsional, serta membatasi faktor skala maksimum (1.5x) agar desain tetap elegan dan tidak rusak.

---
Dokumen ini dibuat tanpa tanda pisah panjang (em dash) dan siap untuk peninjauan tahap T1.

