# Laporan Verifikasi Silang Independen - Batch 01 (`VERIFY-01`)

Verifikator: Sub-agen Verifikator Independen (`V01`)
Skrip uji mandiri: [`tests/bug-hunt/V01_check.mjs`](file:///d:/kerjaan/projek-ndiri/island/tests/bug-hunt/V01_check.mjs) (11/11 skenario `PASS` pada Node `v24.15.0`)
Cakupan lingkungan: Pembacaan langsung kode sumber aplikasi dan eksekusi skrip Node mandiri terhadap modul TS/konfigurasi serta logika yang diekstrak dari sumber asli. Tidak ada pengujian langsung di runtime desktop Windows/Tauri GUI asli (`[BELUM DIVERIFIKASI DI DESKTOP ASLI]`), dan tidak ada berkas kode aplikasi yang dimodifikasi.

---

## Ringkasan Verifikasi 17 Temuan

| ID | Ringkasan Judul | Status Akhir | Label Pembuktian | Evaluasi Keparahan |
| --- | --- | --- | --- | --- |
| `T01-01` | Panic UTF-8 non-char-boundary pada pemisahan `" • "` di thread polling SMTC | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (KRITIS - panic pasti + proses abort di rilis) |
| `T01-02` | Potensi self-deadlock `PillSize` Mutex pada `update_pill_size` saat memanggil `position_notch_window` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - pola mutex tidak konsisten dengan command saudara; bergantung sinkronisitas `tao` Windows) |
| `T01-03` | Cacat lifecycle `ACTIVE_AI_STREAMS`: tabrakan `stream_id`, cancel tidak memutus koneksi blocking, stream tanpa batas ukuran | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - terutama OOM dari `reader.lines()` tanpa batas dan thread/socket terblokir 120 detik) |
| `T01-04` | Alokasi memori tanpa batas / integer overflow pada `pick_audio_file_dialog`, `capture_hwnd_to_rgba`, `copy_image_to_clipboard`, `extract_image_text`, `read_clipboard_image` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (KRITIS/TINGGI - `std::fs::read` sebelum cek 15MB & overflow `i32` pada `capture_hwnd_to_rgba` hingga zero-byte alloc sebelum `GetDIBits`) |
| `T01-05` | Ketiadaan validasi SSRF pada `ai_http_request`/`ai_http_stream` dan bypass redirect HTTP pada `fetch_external_lyrics_api` | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - redirect default `ureq` mem-bypass allowlist host lirik) |
| `T01-06` | `assetProtocol.scope` wildcard `["**"]` + CSP `connect-src` mengizinkan `http:` + capability seragam lintas 16 pola window | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` | Perlu pertimbangan turun ke SEDANG (konfigurasi defense-in-depth, `script-src` tetap `'self'`) |
| `T02-01` | Bypass kuota dan tidak adanya autentikasi klien pada `gili-free-proxy` serta `giliFreeService.ts` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - catatan khusus untuk `CF-Connecting-IP` hanya terjadi di non-CF/dev lokal sebagai bucket bersama) |
| `T02-02` | Kebijakan CORS wildcard (`*`) membuka proxy gratis untuk situs web pihak ketiga | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` | Wajar (TINGGI bila dikombinasikan dengan `T02-01`) |
| `T02-05` | Cache lisensi `store_pro_cache.json` plaintext tanpa integritas kriptografis dan fail-open saat sinkronisasi gagal | `TERKONFIRMASI` | `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - bypass paywall MSIX saat offline/Store API error) |
| `T02-07` | Kegagalan `CredWriteW` ditelan diam-diam dan migrasi tetap menghapus kunci lama secara permanen | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - kehilangan permanen API key pengguna) |
| `T02-10` | `aiHttp.ts` tidak memvalidasi skema HTTPS/target SSRF sebelum jembatan HTTP native dan meneruskan error tanpa redaksi URL | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI/SEDANG - parameter `?key=` Gemini bocor hingga chat history saat error jaringan) |
| `T06-01` | Listener `Escape` global di `TaskbarFlyoutApp` menutup seluruh flyout sebelum submenu `QuickSettingsView` menanganinya | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Disarankan turun ke SEDANG (cacat UX navigasi keyboard, tidak merusak data) |
| `T06-02` | State Focus Session tidak persisten saat `NotificationsCalendarView` ditutup (DND tertinggal aktif) + side-effect ganda di updater timer | `TERKONFIRMASI` (sebagian; StrictMode `DUGAAN` laten) | `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar TINGGI untuk DND tertinggal aktif; bagian StrictMode tidak aktif di `src/main.tsx` saat ini |
| `T06-04` | Kebocoran listener `window` & state drag terkunci pada `SoundOutputMixerView` saat `pointercancel`/unmount serta unmute IPC terlewat | `TERKONFIRMASI` (sebagian; unmute IPC terbantahkan) | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Disarankan turun ke SEDANG (listener leak + drag ref lock terbukti, tetapi unmute ditangani backend Rust `set_master_volume`) |
| `T07-01` | Kolisi alias `systemIcons` dan `clockDate` di `MODULE_ID_ALIASES` memblokir penambahan modul `output_audio` dan `jam_dunia` | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI - 2 modul katalog gagal ditambahkan dan merusak state view modul bawaan) |
| `T07-02` | Ketidakcocokan tipe payload event `master-volume-changed` membuat volume utama di `MixerNavbarModule` & `AudioOutputNavbarModule` tidak tersinkronisasi | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Wajar (TINGGI/SEDANG - sinkronisasi real-time gagal total) |
| `T07-04` | Stale closure pada interval 30 menit menimpa ulang kota pilihan pengguna pada modul Cuaca dan Kualitas Udara | `TERKONFIRMASI` | `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` | Disarankan SEDANG-TINGGI (bug logika pasti tiap 30 menit, dampak fungsional lokal pada dua modul) |

---

## Rincian Verifikasi per Temuan

### 1. `T01-01` | Panic UTF-8 non-char-boundary pada pemisahan `" • "` di thread polling SMTC
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - Pada `src-tauri/src/lib.rs:5840`, percabangan masuk saat `is_generic_artist || artist.trim().is_empty()`.
  - Pada `src-tauri/src/lib.rs:5900-5902`:
    ```rust
    } else if let Some(idx) = title.rfind(" • ") {
        artist = title[idx + 3..].trim().to_string();
        title = title[..idx].trim().to_string();
    }
    ```
  - Karakter `'•'` (U+2022) berukuran **3 byte** dalam UTF-8 (`0xE2 0x80 0xA2`), sehingga pemisah `" • "` berukuran **5 byte** (`1 + 3 + 1`). Mengiris `title[idx + 3..]` menempatkan indeks tepat pada byte ke-2 (`0xA2`, continuation byte) dari karakter `'•'`, yang selalu bukan UTF-8 char boundary.
  - Catatan prasyarat: bila sesi berasal dari browser (`is_browser_session == true`) dan `artist` termasuk daftar generic di baris `5806-5811`, blok `5801-5820` (`split_once(" • ")`) memisahkan `" • "` pertama lebih dulu. Namun untuk sesi non-browser (`is_browser_session == false`) dengan artist kosong/generik dan tanpa `" - "` atau `" | "`, eksekusi langsung mencapai `5900-5902`.
  - Panic terjadi di thread polling background utama (`lib.rs:5310-6000`). Global panic hook di `lib.rs:4491-4496` menjalankan `restore_taskbar_on_exit()`, dan `src-tauri/Cargo.toml:52` mengatur `panic = "abort"` untuk `[profile.release]`, sehingga seluruh proses Gili langsung crash di build release.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T01-01`) memverifikasi `Buffer.from(" • ", "utf8").length === 5` dan byte pada `idx + 3` adalah `0xa2` (`continuation byte`).
- **Keparahan**: Wajar (KRITIS).

---

### 2. `T01-02` | Potensi self-deadlock `PillSize` Mutex pada `update_pill_size` saat memanggil `position_notch_window`
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src-tauri/src/lib.rs:2307-2328`: `update_pill_size` (command Tauri sinkron, bukan `async fn`) mengunci `state.0.lock()` dengan variabel `size` hingga akhir blok `if let Ok(mut size) = state.0.lock() { ... }` pada baris `2328`.
  - Ketika `should_reposition == true` (`2308-2311`), baris `2326` memanggil `position_notch_window(&window, pos, phys_offset, size.target_monitor.as_deref())` **selagi guard mutex `size` masih dipegang**.
  - `position_notch_window` (`1913-1922`) memanggil `position_notch_window_on_monitor` (`1900-1911`) yang mengeksekusi `window.set_position(...)`, `window.set_size(...)`, `window.set_position(...)`.
  - Di `window.on_window_event` (`4830-4864`), `WindowEvent::ScaleFactorChanged` (`4834-4838`) dan `WindowEvent::Resized` (`4853-4857`) masing-masing mengunci `app_for_events.state::<PillSize>().0.lock()`.
  - Berbeda dari `set_target_monitor` (`2221-2231`) dan `set_window_position` (`2259-2274`) yang melepaskan lock `PillSize` sebelum memanggil `position_notch_window`, `update_pill_size` tidak melepaskan locknya terlebih dahulu.
  - Pada Windows, panggilan `SetWindowPos` di `set_size`/`set_position` memicu `WM_SIZE`/`WM_DPICHANGED` secara sinkron ke `WndProc`. Jika `tauri 2.12.1` + `tao 0.37.1` mengeksekusi handler `on_window_event` langsung dalam stack yang sama pada thread UI, `std::sync::Mutex` non-reentrant akan mengalami self-deadlock. (Kepastian apakah `tao` men-dispatch sinkron vs antrean pada versi tepat di `Cargo.lock` memerlukan verifikasi di desktop Windows asli).
- **Keparahan**: Wajar (TINGGI).

---

### 3. `T01-03` | Cacat lifecycle `ACTIVE_AI_STREAMS`: tabrakan `stream_id`, cancel tidak memutus koneksi blocking, stream tanpa batas ukuran
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - **(a) Tabrakan `stream_id`**: `ACTIVE_AI_STREAMS` (`src-tauri/src/lib.rs:1120-1128`) adalah `HashMap<String, Arc<AtomicBool>>`. `ai_http_stream` (`1165-1167`) langsung melakukan `map.insert(stream_id.clone(), Arc::clone(&cancel_flag))` yang menimpa entry aktif dengan `stream_id` sama. Saat stream pertama selesai, `AiStreamRegistryGuard::drop` (`1132-1137`) memanggil `map.remove(&self.0)` tanpa pengecekan identitas `Arc::ptr_eq`, sehingga menghapus `cancel_flag` milik stream kedua. Setelah itu `cancel_ai_http_stream("s1")` (`1141-1148`) tidak menemukan entry `"s1"`. (Catatan: caller JS `src/services/aiHttp.ts:132` membuat ID acak, namun batas keamanan di command Rust tidak memvalidasi keunikan `stream_id`).
  - **(b) Cancel tidak memutus koneksi blocking**: `cancel_ai_http_stream` hanya mengubah `AtomicBool` (`1144`). Sementara itu `ai_http_stream` memakai `ureq::AgentBuilder` dengan `.timeout(Duration::from_secs(120))` (`1180`) dan memanggil operasi blocking sinkron `request.send_string`/`request.call()` (`1199-1203`) serta `reader.lines()` (`1212`). Flag `flag_clone` baru dicek setelah panggilan jaringan selesai atau setelah satu baris utuh diterima, sehingga thread `spawn_blocking` dan socket tetap tergantung hingga 120 detik bila upstream diam.
  - **(c) Stream tanpa batas ukuran**: `BufReader::new(resp.into_reader()).lines()` (`1211-1212`) membaca byte hingga `\n` tanpa batas panjang (tidak memakai `.take(...)`), sehingga respons sangat besar tanpa newline mengalokasikan `String` tanpa batas hingga OOM. (Catatan pembanding: `ai_http_request` memakai `resp.into_string()` dari `ureq 2.12.1` yang memiliki batas default internal, berbeda dari `resp.into_reader()` di `ai_http_stream`).
- **Keparahan**: Wajar (TINGGI).

---

### 4. `T01-04` | Alokasi memori tanpa batas / integer overflow pada `pick_audio_file_dialog`, `capture_hwnd_to_rgba`, `copy_image_to_clipboard`, `extract_image_text`, `read_clipboard_image`
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `pick_audio_file_dialog` (`src-tauri/src/lib.rs:3711-3713, 3736-3752`): Menyediakan filter `"All Files (*.*)"`, lalu membaca seluruh file ke memori lewat `std::fs::read(path)` (`3736`) **sebelum** memeriksa `bytes.len() > 15 * 1024 * 1024` (`3747`), tanpa memeriksa `metadata().len()` terlebih dahulu. File >2 GB langsung mencoba dimuat utuh ke RAM.
  - `capture_hwnd_to_rgba` (`lib.rs:1295-1321, 1387-1388`): `width` dan `height` bertipe `i32`. Baris `1321` dan `1387` menghitung `(width * height * 4) as usize` dengan aritmetika `i32` tanpa `checked_mul`. Jika `width = 32768, height = 16384`, hasil `i32` wrap menjadi `-2147483648` yang di-sign-extend menjadi `usize` raksasa lalu panic/abort saat alokasi `vec!`. Jika `width = 32768, height = 32768`, hasil `i32` di build release wrap menjadi `0`, mengalokasikan `bgra_data` 0 byte sebelum `GetDIBits` (`1325-1333`) menulis pixel ke pointer buffer tersebut (heap buffer overflow / UB di blok `unsafe`).
  - `read_clipboard_image` (`lib.rs:523`): `width` dan `height` bertipe `u32`; `(width * height * 4) as usize` melakukan perkalian `u32` yang dapat panic overflow di debug atau wrap di release (mis. `65536 * 16384 * 4 = 0`).
  - `copy_image_to_clipboard` (`lib.rs:575`) dan `extract_image_text` (`lib.rs:599-603`): `image::open` pada `image 0.25.10` memang memiliki `Limits::default()` bawaan crate (~512 MiB per decode), bukan tak terbatas mutlak, namun aplikasi tidak memvalidasi dimensi atau ukuran file sebelum decode penuh (gambar valid di bawah 512 MiB tetap memicu alokasi berlipat pada `.to_rgba8()`, `Image::new`, atau `.resize()`). Selain itu, di `extract_image_text`, file dengan ekstensi salah menyebabkan `ImageReader::open(p).into_dimensions()` gagal menebak dari ekstensi sehingga langsung jatuh ke `BitmapDecoder` Windows tanpa pra-resize.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T01-04`) mengonfirmasi hasil aritmetika `i32`/`u32` wrap serta keberadaan pola kode terkait di `lib.rs`.
- **Keparahan**: Wajar (KRITIS/TINGGI).

---

### 5. `T01-05` | Ketiadaan validasi SSRF pada `ai_http_request`/`ai_http_stream` dan bypass redirect HTTP pada `fetch_external_lyrics_api`
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `ai_http_request` (`src-tauri/src/lib.rs:1060-1118`) dan `ai_http_stream` (`1151-1247`) langsung meneruskan `url` dari IPC ke `ureq` tanpa validasi loopback, RFC1918, maupun link-local metadata `169.254.169.254`. (Catatan konteks: meski `customBase` pada fitur AI memang mendukung server lokal seperti Ollama, tidak ada pagar terhadap IP link-local metadata atau validasi asal panggilan).
  - `fetch_external_lyrics_api` (`lib.rs:972-1036`) memanggil `validate_lyrics_url(&url)` (`972-1004`) untuk membatasi host awal ke `ALLOWED_LYRICS_HOSTS` (dengan tetap menerima `http://` cleartext pada baris `978`), namun `LYRICS_HTTP_AGENT` (`1009-1014`) dibangun tanpa `.redirects(0)`. Pada `ureq 2.12.1`, agent default mengikuti redirect `301`/`302`/`303`/`307`/`308` hingga 5 kali ke host/IP mana pun (termasuk `http://127.0.0.1:...` atau `http://169.254.169.254/...`) tanpa memanggil `validate_lyrics_url` pada target redirect.
- **Keparahan**: Wajar (TINGGI).

---

### 6. `T01-06` | `assetProtocol.scope` wildcard `["**"]` + CSP `connect-src` mengizinkan `http:` + capability seragam lintas 16 pola window
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]`
- **Bukti Kode Sumber**:
  - `src-tauri/tauri.conf.json:32-36`: `assetProtocol.enable` = `true`, `assetProtocol.scope` = `["**"]`.
  - `src-tauri/tauri.conf.json:38-50`: `connect-src`, `img-src`, dan `media-src` mengizinkan `http:`.
  - `src-tauri/capabilities/default.json:5-53`: 16 pola window (`main`, `settings`, `miniplayer`, `lyrics_share`, `notch_secondary_*`, `notch_secondary_1..4`, `navbar`, `navbar_secondary_*`, `navbar_secondary_1..4`, `taskbar_flyout`) berbagi 29 izin yang sama tanpa pemisahan hak istimewa minimal.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T01-06`) memverifikasi seluruh konfigurasi JSON tersebut secara langsung.
- **Keparahan**: Disarankan diturunkan ke SEDANG (temuan audit hardening/defense-in-depth yang terbukti secara konfigurasi; `script-src` masih ketat `'self'` sehingga tidak membuka eksekusi skrip sewenang-wenang secara langsung).

---

### 7. `T02-01` | Bypass kuota dan tidak adanya autentikasi klien pada `gili-free-proxy` serta `giliFreeService.ts`
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src/services/giliFreeService.ts:4, 37-43`: `getInstallId()` menghasilkan UUID baru melalui `crypto.randomUUID()` setiap kali key `gili_install_id_v1` tidak ditemukan di `localStorage`.
  - `gili-free-proxy/src/index.ts:13, 102-138`: Tidak ada autentikasi klien atau token bertanda tangan. Regex `INSTALL_ID_PATTERN = /^[a-f0-9-]{16,64}$/i` (`13`) menerima `"----------------"` (16 tanda hubung). Saat jatah 15 (`DAILY_LIMIT_PER_INSTALL` di `wrangler.toml:7`) habis, penggantian `X-Gili-Install-Id` berhasil melewati batas 15 hingga batas IP 60 (`DAILY_LIMIT_PER_IP` di `wrangler.toml:9`), atau tanpa batas bila IP dirotasi.
  - Catatan nuansa untuk prasyarat *"atau tanpa `CF-Connecting-IP`"*: pada `index.ts:123`, ketiadaan header tersebut membuat `ipKey = "ip:unknown"`. Di jaringan produksi Cloudflare Workers, Cloudflare menyuntikkan dan menimpa `CF-Connecting-IP` secara otomatis sehingga klien publik tidak bisa memalsukannya; pada lingkungan lokal/non-CF tanpa header tersebut, seluruh klien jatuh ke bucket `"ip:unknown"` bersama (limit 60 total, memicu DoS bersama alih-alih bypass tak terbatas). Meski begitu, inti temuan (tiadanya autentikasi klien, penerimaan ID palsu seperti `"----------------"`, dan reset kuota via `localStorage`) tetap terbukti penuh.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T02-01_T02-02`) menjalankan kode asli `giliFreeService.ts` dan `gili-free-proxy/src/index.ts`: regenerasi ID melewati blokir `429` pada ID lama dan `X-Gili-Install-Id: "----------------"` mendapat `200 OK`.
- **Keparahan**: Wajar (TINGGI).

---

### 8. `T02-02` | Kebijakan CORS wildcard (`*`) membuka proxy gratis untuk situs web pihak ketiga
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]`
- **Bukti Kode Sumber**:
  - `gili-free-proxy/src/index.ts:17-22, 167-184`: `CORS_HEADERS` menetapkan `"Access-Control-Allow-Origin": "*"` dan disertakan pada preflight `OPTIONS` (`179`), respons streaming `POST` (`171`), dan respons error (`29`).
  - Klien desktop Gili sebenarnya memanggil endpoint melalui bridge Rust (`ai_http_stream` di `src/services/aiHttp.ts:213`), yang tidak memerlukan header CORS browser.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T02-01_T02-02`) mengirim `OPTIONS` dan `POST` ke `gili-free-proxy/src/index.ts` dengan header `Origin: https://evil-third-party.example` dan menerima `Access-Control-Allow-Origin: *`.
- **Keparahan**: Wajar (TINGGI bersama `T02-01`, karena halaman web eksternal dapat langsung mengonsumsi kuota Gemini API developer).

---

### 9. `T02-05` | Cache lisensi `store_pro_cache.json` plaintext tanpa integritas kriptografis dan fail-open saat sinkronisasi gagal
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src-tauri/src/store_license.rs:75-115`: `store_pro_cache_path()` menunjuk `%LOCALAPPDATA%\Gili\store_pro_cache.json`, dengan format JSON plaintext `{"cached_store_pro_active":true}` tanpa enkripsi DPAPI, HMAC/signature, maupun timestamp kedaluwarsa. `init_cached_license_from_disk()` (`99-115`, dipanggil di `lib.rs:6197`) langsung menetapkan `STORE_PRO_ACTIVE = true` pada build MSIX.
  - `store_license.rs:349-364, 445-468`: Dalam `apply_license_result`, hanya `Ok(has_pro)` yang memperbarui `STORE_PRO_ACTIVE` dan cache disk; bila `query_license_active_blocking()` mengembalikan `Err(...)` (offline atau gagal menghubungi Microsoft Store), status aktif dari cache tidak direset sehingga `can_use_taskbar()` tetap mengembalikan `true` (`lib.rs:6203-6217`, `store_license.rs:452-461`).
  - Prasyarat penting sesuai langkah reproduksi: skenario eksploitasi memang memerlukan kondisi offline atau gagalnya verifikasi Store (`Err`), karena bila online dan Store mengembalikan `Ok(false)`, cache akan ditimpa `false`.
- **Keparahan**: Wajar (TINGGI).

---

### 10. `T02-07` | Kegagalan `CredWriteW` ditelan diam-diam dan migrasi tetap menghapus kunci lama secara permanen
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src-tauri/src/ai_credentials.rs:100-108, 128-136, 165-176`: `save_secure_ai_key` dan `save_secure_ai_model_key` mengembalikan `Err(...)` ketika `CredWriteW` gagal.
  - `src/services/aiCredentialService.ts:43-49`: `saveSecureApiKey` menangkap reject Promise dengan `console.warn`, tidak melempar ulang, dan tetap menjalankan `cleanLegacyKeyStorage(provider)`.
  - `src/services/aiCredentialService.ts:87-91`: `saveSecureModelKey` juga menelan error dengan `console.warn`.
  - `src/services/aiCredentialService.ts:201-294`: `migrateLegacyPlaintextKeys()` memanggil `saveSecureApiKey`/`saveSecureModelKey`, menambah `migratedCount`, lalu tanpa syarat menghapus `island_ai_api_keys_v1` (`218-220`), `_sec_k_*` (`238-240`), `island_ai_model_keys_v1` (`254-256`), serta `ai_provider_keys` & `ai_model_keys` di `settings.json` (`284-286`).
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T02-07`) memanggil langsung `migrateLegacyPlaintextKeys()` dari `aiCredentialService.ts` saat `invoke("save_secure_ai_key")` dan `invoke("save_secure_ai_model_key")` selalu reject: fungsi tetap melaporkan `migratedCount = 5` dan seluruh key di `localStorage` dan `settings.json` terhapus permanen.
- **Keparahan**: Wajar (TINGGI).

---

### 11. `T02-10` | `aiHttp.ts` tidak memvalidasi skema HTTPS/target SSRF sebelum jembatan HTTP native dan meneruskan error tanpa redaksi URL
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src/services/aiHttp.ts:70-122, 124-247`: Baik `aiFetch` maupun `streamAiRequest` tidak memvalidasi skema `https://` ataupun IP metadata/internal sebelum memanggil `invoke("ai_http_request", ...)` dan `invoke("ai_http_stream", ...)`.
  - `src/services/geminiApi.ts:268-269` (serta `src/services/aiModelRegistry.ts:622, 644`) benar mengirim URL dengan query parameter `?alt=sse&key=...` atau `?key=...` saat fallback query key aktif.
  - `src-tauri/src/lib.rs:1240` mengirim `format!("Network error: {}", e)` (di mana pesan `ureq::Error::Transport` menyertakan URL request), lalu `src/services/aiHttp.ts:204-206` meneruskannya mentah ke `new Error(event.payload)` tanpa redaksi. Selanjutnya `formatStreamError` di `src/services/aiBackgroundStreamService.ts:144-158` juga meneruskan pesan `Network error: ...` tanpa redaksi ke history pesan chat.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T02-10`) menjalankan kode asli `aiHttp.ts`: `aiFetch("http://169.254.169.254/latest/meta-data/", ...)` diteruskan ke `ai_http_request`, dan `streamAiRequest` menolak Promise dengan pesan error yang masih memuat parameter `?key=...` secara utuh.
- **Keparahan**: Wajar (TINGGI/SEDANG).

---

### 12. `T06-01` | Listener `Escape` global di `TaskbarFlyoutApp` menutup seluruh flyout sebelum submenu `QuickSettingsView` menanganinya
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src/components/taskbarFlyout/TaskbarFlyoutApp.tsx:402-425`: Saat komponen root flyout mount, ia mendaftarkan `window.addEventListener("keydown", handleKeyDown)` pada fase bubbling; tombol `Escape` langsung memanggil `invoke("close_taskbar_flyout")`.
  - `src/components/taskbarFlyout/views/QuickSettingsView.tsx:396-410`: Child `QuickSettingsView` baru di-mount ketika `target === "quickSettings"`, lalu mendaftarkan `window.addEventListener("keydown", handleKeyDown)` pada fase bubbling yang sama pada target `window` yang sama.
  - Sesuai aturan urutan eksekusi listener DOM pada `EventTarget` dan fase yang sama, listener induk `TaskbarFlyoutApp` dipanggil lebih dahulu dan sudah mengirim perintah tutup flyout sebelum listener `QuickSettingsView` sempat menjalankan `setActiveSubmenu(null)`.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T06-01`) mereplikasi urutan pendaftaran kedua listener di `window` dan membuktikan urutan eksekusi: `invoke:close_taskbar_flyout -> setActiveSubmenu(null)`.
- **Keparahan**: Disarankan turun ke SEDANG (cacat fungsional UX keyboard navigation).

---

### 13. `T06-02` | State Focus Session tidak persisten saat `NotificationsCalendarView` ditutup (DND tertinggal aktif) + side-effect ganda di updater timer
- **Status**: `TERKONFIRMASI` (bagian utama terkonfirmasi; bagian StrictMode `DUGAAN` laten)
- **Label**: `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - **Bagian terkonfirmasi (state hilang & DND tertinggal aktif)**:
    - `src/components/taskbarFlyout/TaskbarFlyoutApp.tsx:533-535` mengembalikan div kosong ketika `!isOpen || !target`. Pada saat flyout ditutup (`src-tauri/src/taskbar_flyout.rs:1038-1045`), backend memanggil `window.__resetTaskbarFlyoutState()` dan emit `isOpen: false`, yang membuat `<NotificationsCalendarView />` unmount.
    - Di `src/components/taskbarFlyout/views/NotificationsCalendarView.tsx:86-88`, `isFocusRunning`, `focusMinutes`, dan `focusSecondsLeft` hanya disimpan di `useState` lokal tanpa persistensi ke `localStorage` atau backend.
    - `handleToggleFocusSession` (`188-194`) mengaktifkan DND (`invoke("set_windows_dnd", { enabled: true })` dan `setDndStatus(true)`). Saat flyout ditutup, cleanup `useEffect` (`164`) menghentikan `setInterval`, state Focus Session musnah, DND tetap aktif di Windows, dan saat flyout dibuka kembali tampilan timer kembali ke `30:00` tidak berjalan.
  - **Bagian StrictMode (tidak aktif di entrypoint saat ini)**:
    - Di `NotificationsCalendarView.tsx:152-162`, callback updater `setFocusSecondsLeft((prev) => ...)` memang secara tidak aman memanggil `setIsFocusRunning(false)`, `recordCompletedFocusSession(focusMinutes)`, `setIsDndActive(false)`, `setDndStatus(false)`, dan `invoke("set_windows_dnd", { enabled: false })`.
    - Namun pemeriksaan di `src/main.tsx:273-291` dan pencarian di seluruh `src/` menunjukkan bahwa `<React.StrictMode>` **tidak terpasang** pada aplikasi Gili saat ini. Oleh karena itu, pemicu ganda StrictMode tidak terjadi dalam build/dev Gili saat ini (tetap cacat laten bila StrictMode diaktifkan nanti).
- **Keparahan**: Wajar TINGGI untuk dampak state timer hilang dan DND tertinggal aktif.

---

### 14. `T06-04` | Kebocoran listener `window` & state drag terkunci pada `SoundOutputMixerView` saat `pointercancel`/unmount serta unmute IPC terlewat
- **Status**: `TERKONFIRMASI` pada kebocoran listener `window` & state drag terkunci; **bagian unmute IPC terlewat TIDAK TERBUKTI**
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - **Bagian terkonfirmasi**:
    - `SoundOutputMixerView.tsx:154-173` (`handleMasterPointerDown`) dan `241-264` (`handleAppPointerDown`) mendaftarkan `pointermove` dan `pointerup` di `window` tanpa listener `pointercancel` dan tanpa cleanup saat komponen unmount.
    - Jika `pointercancel` terjadi atau flyout tertutup saat drag aktif, `window` menyimpan listener yang bocor (jendela `taskbar_flyout` tetap ada sampai idle destroy), `isDraggingMasterRef.current` tetap `true` (memblokir update event `master-volume-changed` di baris `106`), dan `draggingAppPidRef.current` tetap non-null (memblokir pembaruan polling `get_audio_sessions` di baris `95`).
  - **Bagian terbantahkan oleh guard Rust (`unmute IPC terlewat`)**:
    - Di `SoundOutputMixerView.tsx:148-151` dan `512-517`, frontend memang hanya memanggil `setIsMasterMuted(false)` di state lokal dan `invoke("set_master_volume", { level })` tanpa memanggil `set_master_mute`.
    - Namun di backend Rust `src-tauri/src/lib.rs:2896-2916` (`set_master_volume`), baris `2908-2910` memiliki guard eksplisit:
      ```rust
      if level > 0.0 {
          let _ = volume_ctrl.SetMute(windows::Win32::Foundation::BOOL::from(false), std::ptr::null());
      }
      ```
      Karena geser ke nilai `> 0` maupun `ArrowRight` (`next >= 0.05 > 0.0`) mengirim `level > 0.0`, backend Rust sudah otomatis meng-unmute audio sistem Windows dan thread polling (`lib.rs:5396-5405`) akan menyinkronkan status `muted: false`.
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T06-04`) mengonfirmasi bahwa saat `pointercancel` dipicu, `isDraggingMaster === true`, `draggingAppPid === 1234`, dan 2 listener `pointermove` + 2 listener `pointerup` tetap tertinggal di `window`.
- **Keparahan**: Disarankan diturunkan ke SEDANG (karena klaim unmute IPC gagal terbantahkan oleh backend Rust, sehingga hanya tersisa edge case `pointercancel`/unmount saat drag).

---

### 15. `T07-01` | Kolisi alias `systemIcons` dan `clockDate` di `MODULE_ID_ALIASES` memblokir penambahan modul `output_audio` dan `jam_dunia`
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src/modules/moduleAliases.ts:31, 33`: memetakan `systemIcons: "output_audio"` dan `clockDate: "jam_dunia"`.
  - `src/types/navbar.ts:79-87`: `DEFAULT_NAVBAR_MODULES` menyertakan `"systemIcons"` dan `"clockDate"`.
  - `src/components/settingsWindow/navbar/AddModuleDialog.tsx:366-377` melewatkan `BUILTIN_IDS` sehingga `output_audio` dan `jam_dunia` tampak tersedia dengan tombol `+ Tambah`, tetapi `handleAddModule` di `src/components/settingsWindow/navbar/NavbarSettingsTab.tsx:88-113` mengecek `MODULE_ID_ALIASES[m.id] || m.id` tanpa mengecualikan `BUILTIN_IDS`. Akibatnya `existingIndex !== -1`, ia mengubah `view` milik `systemIcons`/`clockDate` lalu `return` tanpa menambahkan `output_audio` atau `jam_dunia`.
  - `src/modules/components/NavbarPopoverShell.tsx:276-300`: `currentModuleEntry` dan `handleSwitchView` menyamakan alias yang sama, mencampuradukkan `view` modul bawaan dengan modul katalog.
  - `src/modules/registry.ts:47-55` (`getNavbarModuleById`) dan `src/modules/moduleComponents.ts:150-157` (`getNavbarModuleComponent`) juga meresolusi `"systemIcons"` ke `output_audio` (`AudioOutputNavbarModule`) dan `"clockDate"` ke `jam_dunia` (`JamDuniaNavbarModule`). (Di `NavbarDock.tsx:905-929`, render dock tertolong oleh blok `if` modul bawaan sebelum `getNavbarModuleComponent`).
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T07-01`) mengimpor `src/modules/moduleAliases.ts` dan `src/modules/modules.catalog.json` asli, membuktikan kedua modul gagal ditambahkan pada konfigurasi default serta memutasi `view` milik `systemIcons` dan `clockDate`.
- **Keparahan**: Wajar (TINGGI).

---

### 16. `T07-02` | Ketidakcocokan tipe payload event `master-volume-changed` membuat volume utama di `MixerNavbarModule` & `AudioOutputNavbarModule` tidak tersinkronisasi
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src-tauri/src/lib.rs:5397-5405`: Satu-satunya emitter `"master-volume-changed"` mengirim struct `VolumeUpdatePayload { volume: f32, muted: bool }` (objek JSON `{ volume, muted }`).
  - `src/modules/components/MixerNavbarModule.tsx:67-73` (`MixerNavbarModule`) dan `296-302` (`AudioOutputNavbarModule`) mendengarkan `listen<number>("master-volume-changed", ...)` dengan guard `if (typeof ev.payload === "number")`, yang selalu bernilai `false` saat menerima objek `{ volume, muted }`. (Bandingkan dengan `QuickSettingsView.tsx:336-343` dan `SoundOutputMixerView.tsx:103-110` yang sudah membaca `event.payload.volume`).
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T07-02`) memverifikasi payload `{ volume: 0.72, muted: false }` diabaikan oleh logika kedua listener tersebut.
- **Keparahan**: Wajar (TINGGI/SEDANG).

---

### 17. `T07-04` | Stale closure pada interval 30 menit menimpa ulang kota pilihan pengguna pada modul Cuaca dan Kualitas Udara
- **Status**: `TERKONFIRMASI`
- **Label**: `[TERBUKTI LEWAT UJI]` `[TERKONFIRMASI DI KODE]` `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`
- **Bukti Kode Sumber**:
  - `src/modules/components/WeatherNavbarModule.tsx:80-87`: `useEffect(() => { loadWeather(weather?.city || "Bandung"); const id = setInterval(() => loadWeather(weather?.city || "Bandung"), 30 * 60000); return () => clearInterval(id); }, []);`. Karena dependensi array kosong `[]`, closure interval menangkap `weather?.city` dari render awal (`"Bandung"`), sehingga setelah user mengganti kota ke `"Tokyo"`, interval 30 menit kemudian memanggil `loadWeather("Bandung")` dan menimpa state `weather`, `cityInput`, dan `localStorage` (`WEATHER_KEY`).
  - `src/modules/components/MediaLifestyleExtraModules.tsx:205-209`: `AirQualityNavbarModule` memiliki pola `useEffect(..., [])` identik dengan `setInterval(() => refreshAqi(aq?.city || "Bandung"), 30 * 60000)`, yang menimpa state `aq`, `cityInput`, dan `localStorage` (`AQI_CACHE_KEY`).
- **Bukti Uji Mandiri**: `V01_check.mjs` (`T07-04`) mensimulasikan closure hook tersebut dan mengonfirmasi kota `"Tokyo"` tertimpa kembali menjadi `"Bandung"` saat callback interval berjalan.
- **Keparahan**: Wajar (TINGGI/SEDANG).
