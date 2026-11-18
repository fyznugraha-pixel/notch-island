# Laporan Verifikasi Silang Independen: V05 (Temuan T14)

Laporan ini merangkum hasil verifikasi independen terhadap klaim temuan **T14-01** dan **T14-02** menggunakan pemeriksaan langsung berkas sumber serta eksekusi skrip uji mandiri `tests/bug-hunt/V05_check.mjs`.

## Ringkasan Tabel Verifikasi

| ID Temuan | Lokasi Berkas | Status Verifikasi | Keparahan Awal | Keparahan Akhir Rekomendasi | Ringkasan Hasil |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T14-01** | `AppxManifest.xml:9, 18, 25-26` | `TERKONFIRMASI [TERBUKTI LEWAT UJI] [BELUM DIVERIFIKASI DI DESKTOP ASLI]` | TINGGI | **TINGGI** (untuk ketidakcocokan path `Assets\` pada pemaketan MSIX) / **RENDAH** (untuk `MaxVersionTested`) | `AppxManifest.xml` merujuk ke 6 berkas logo di bawah `Assets\`, tetapi direktori `Assets/` tidak ada di repositori (ikon yang tersedia berada di `src-tauri/icons/` dengan nama tanpa prefiks `GILI-`, dan `Wide310x150Logo` tidak ada). |
| **T14-02** | `tsconfig.json:23-24` & `src/components/navbar/popovers/` | `TERKONFIRMASI [TERBUKTI LEWAT UJI] [BELUM DIVERIFIKASI DI DESKTOP ASLI]` | TINGGI | **SEDANG** | `tsconfig.json:24` memiliki `"exclude": ["src/components/navbar"]`. Sebanyak 13 berkas aktif di `src/components/navbar/` tetap ikut diperiksa oleh `tsc` karena diimpor secara transitif dari `src/main.tsx` dan `src/modules/components/NavbarPopoverShell.tsx`, namun 4 berkas di `src/components/navbar/popovers/` (`NavbarCalendarFlyout.tsx`, `NavbarControlCenterFlyout.tsx`, `NavbarNotificationsFlyout.tsx`, `NavbarStartLauncherFlyout.tsx`, total 1.463 baris) adalah kode mati yang tidak pernah diimpor di mana pun dan sepenuhnya terlewat dari `tsc`. Saat `exclude` dihapus, ke-17 berkas menghasilkan 0 galat kompilasi TypeScript. |

---

## Rincian Verifikasi Per Temuan

### 1. T14-01 (`AppxManifest.xml:9, 18, 25-26`)

- **Status Verifikasi**: `TERKONFIRMASI [TERBUKTI LEWAT UJI] [BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan Akhir Rekomendasi**: **TINGGI** (terkait kegagalan pembuatan paket MSIX dengan `MakeAppx.exe` akibat berkas aset tidak ditemukan)
- **Bukti Independen**:
  1. Pembacaan langsung `AppxManifest.xml`:
     - Baris 9: `<Logo>Assets\StoreLogo.png</Logo>`
     - Baris 18: `<TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22000.1" />`
     - Baris 25: `<uap:VisualElements BackgroundColor="transparent" DisplayName="Gili Notch" Square150x150Logo="Assets\GILI-Square150x150Logo.png" Square44x44Logo="Assets\GILI-Square44x44Logo.png" Description="Gili Notch">`
     - Baris 26: `<uap:DefaultTile Wide310x150Logo="Assets\GILI-Wide310x150Logo.png" Square310x310Logo="Assets\GILI-Square310x310Logo.png" Square71x71Logo="Assets\GILI-Square71x71Logo.png" />`
  2. Hasil keluaran `node tests/bug-hunt/V05_check.mjs`:
     - `assetsDirExists`: `false` (direktori `Assets/` tidak ada di akar repositori).
     - Pencarian seluruh repositori untuk nama berkas logo yang cocok hanya menemukan berkas tanpa prefiks `GILI-` di `src-tauri/icons/`:
       - `src-tauri\icons\StoreLogo.png`
       - `src-tauri\icons\Square150x150Logo.png`
       - `src-tauri\icons\Square44x44Logo.png`
       - `src-tauri\icons\Square310x310Logo.png`
       - `src-tauri\icons\Square71x71Logo.png`
     - Berkas `GILI-Wide310x150Logo.png` (maupun `Wide310x150Logo.png`) tidak ditemukan di mana pun di repositori.
- **Catatan Koreksi**:
  - Klaim awal menyebut baris 9 merujuk ke `Assets\GILI-StoreLogo.png`. Pada kode aktual baris 9, nilai sebenarnya adalah `<Logo>Assets\StoreLogo.png</Logo>` (tanpa prefiks `GILI-`).
  - Selain 3 berkas yang disebut di klaim awal, baris 26 juga merujuk 3 berkas tambahan di `Assets\` (`Assets\GILI-Wide310x150Logo.png`, `Assets\GILI-Square310x310Logo.png`, dan `Assets\GILI-Square71x71Logo.png`) yang semuanya tidak ada di path `Assets\`.
  - Nilai `MaxVersionTested="10.0.22000.1"` (Windows 11 21H2 build 22000) memang tertinggal dibanding target Windows 11 22H2/23H2/24H2 (`10.0.22621.0` atau `10.0.26100.0`), namun atribut ini bersifat deklaratif kompatibilitas OS dan tidak menyebabkan kegagalan kompilasi paket secara langsung.

---

### 2. T14-02 (`tsconfig.json:23-24` & `src/components/navbar/popovers/`)

- **Status Verifikasi**: `TERKONFIRMASI [TERBUKTI LEWAT UJI] [BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Keparahan Akhir Rekomendasi**: **SEDANG** (diturunkan dari TINGGI karena berkas navbar yang aktif dipakai produksi tetap diperiksa oleh TypeScript melalui impor transitif, dan ke-4 berkas popover yang tidak terpakai tidak menimbulkan error tipe maupun bug runtime)
- **Bukti Independen**:
  1. Pembacaan langsung `tsconfig.json` baris 23 sampai 25:
     ```json
     "include": ["src"],
     "exclude": ["src/components/navbar"],
     "references": [{ "path": "./tsconfig.node.json" }]
     ```
  2. Pemeriksaan isi direktori `src/components/navbar/popovers/` dan penggunaannya lewat `node tests/bug-hunt/V05_check.mjs`:
     - Terdapat 4 berkas komponen di `src/components/navbar/popovers/` dengan total **1.463 baris** (1.467 baris bila menghitung newline akhir):
       - `src/components/navbar/popovers/NavbarCalendarFlyout.tsx` (291 baris, `importers: []`)
       - `src/components/navbar/popovers/NavbarControlCenterFlyout.tsx` (678 baris, `importers: []`)
       - `src/components/navbar/popovers/NavbarNotificationsFlyout.tsx` (190 baris, `importers: []`)
       - `src/components/navbar/popovers/NavbarStartLauncherFlyout.tsx` (304 baris, `importers: []`)
     - Keempat berkas di `src/components/navbar/popovers/` tersebut **tidak pernah diimpor** oleh berkas mana pun di `src/` (fungsi flyout taskbar saat ini sudah dipindahkan ke jendela khusus di `src/components/taskbarFlyout/`).
  3. Pengujian programatik TypeScript Compiler API di `tests/bug-hunt/V05_check.mjs`:
     - Dengan konfigurasi bawaan (`"exclude": ["src/components/navbar"]`), `ts.parseJsonConfigFileContent` mengecualikan seluruh 17 berkas di `src/components/navbar/` dari daftar `fileNames` awal.
     - Namun karena `src/main.tsx:19` mengimpor `./components/navbar/NavbarApp` dan `src/modules/components/NavbarPopoverShell.tsx:11` mengimpor `../../components/navbar/navbarThemeUtils`, sebanyak 13 dari 17 berkas aktif di `src/components/navbar/` tetap dimuat dan diperiksa tipenya oleh `tsc` melalui resolusi modul transitif.
     - Sebaliknya, 4 berkas di `src/components/navbar/popovers/` tidak diimpor oleh siapa pun sehingga benar-benar dilewati oleh `tsc --noEmit`.
     - Ketika `"exclude": ["src/components/navbar"]` dihapus pada pengujian `V05_check.mjs` (`typecheckDiagnosticsInNavbarWhenIncluded`), seluruh 17 berkas di `src/components/navbar/` (termasuk 4 berkas `popovers/`) menghasilkan **0 error TypeScript** (`[]`).
- **Catatan Koreksi**:
  - Nama 4 berkas pada brief awal (`BatteryDetailPopover.tsx`, `CalendarModal.tsx`, `DeviceCard.tsx`, `WeatherPopover.tsx`, ~890 baris) tidak pernah ada di repositori; sesuai koreksi brief, 4 berkas aktual di `src/components/navbar/popovers/` adalah `NavbarCalendarFlyout.tsx`, `NavbarControlCenterFlyout.tsx`, `NavbarNotificationsFlyout.tsx`, dan `NavbarStartLauncherFlyout.tsx` (total 1.463 baris).
  - Klaim bahwa keempat berkas tersebut merujuk ke tipe yang sudah tidak ada di `src/types/navbar.ts` **tidak terbukti**: keempat berkas tersebut bahkan tidak mengimpor `src/types/navbar.ts` (mereka mengimpor `DockPosition` dari `src/services/taskbarI18n.ts`), dan saat `exclude` dicabut, `tsc` melaporkan 0 error tipe pada seluruh `src/components/navbar/`.
  - Oleh karena itu, dampak nyata dari temuan ini adalah: (a) adanya `"exclude": ["src/components/navbar"]` yang tidak lagi diperlukan di `tsconfig.json:24` dan berisiko menyembunyikan error tipe pada berkas baru di `src/components/navbar/` yang belum diimpor, serta (b) keberadaan 1.463 baris kode mati (dead code) di `src/components/navbar/popovers/`. Keparahan direkomendasikan turun dari **TINGGI** menjadi **SEDANG**.

---

## Lampiran Keluaran `node tests/bug-hunt/V05_check.mjs`

```json
{
  "T14_01": {
    "manifestAssetRefs": [
      "Assets\\StoreLogo.png",
      "Assets\\GILI-Square150x150Logo.png",
      "Assets\\GILI-Square44x44Logo.png",
      "Assets\\GILI-Wide310x150Logo.png",
      "Assets\\GILI-Square310x310Logo.png",
      "Assets\\GILI-Square71x71Logo.png"
    ],
    "assetsDirExists": false,
    "maxVersionTested": "10.0.22000.1",
    "matchingLogoFilesInRepo": [
      "src-tauri\\icons\\Square150x150Logo.png",
      "src-tauri\\icons\\Square310x310Logo.png",
      "src-tauri\\icons\\Square44x44Logo.png",
      "src-tauri\\icons\\Square71x71Logo.png",
      "src-tauri\\icons\\StoreLogo.png"
    ]
  },
  "T14_02": {
    "tsconfigInclude": [
      "src"
    ],
    "tsconfigExclude": [
      "src/components/navbar"
    ],
    "filesExcludedCount": 17,
    "actualPopoverFilesInNavbarPopovers": {
      "src\\components\\navbar\\popovers\\NavbarCalendarFlyout.tsx": {
        "baseName": "NavbarCalendarFlyout",
        "linesCount": 292,
        "importers": []
      },
      "src\\components\\navbar\\popovers\\NavbarControlCenterFlyout.tsx": {
        "baseName": "NavbarControlCenterFlyout",
        "linesCount": 679,
        "importers": []
      },
      "src\\components\\navbar\\popovers\\NavbarNotificationsFlyout.tsx": {
        "baseName": "NavbarNotificationsFlyout",
        "linesCount": 191,
        "importers": []
      },
      "src\\components\\navbar\\popovers\\NavbarStartLauncherFlyout.tsx": {
        "baseName": "NavbarStartLauncherFlyout",
        "linesCount": 305,
        "importers": []
      }
    },
    "typecheckDiagnosticsInNavbarWhenIncluded": []
  }
}
```
