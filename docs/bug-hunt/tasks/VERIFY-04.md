# Laporan Verifikasi Silang Independen - Batch V04 (`VERIFY-04`)

**Verifikator Independen:** Sub-Agen `V04` (`VERIFY-04`)
**Cakupan Verifikasi:** 19 Temuan (`T11-01` s/d `T11-10`, `T12-01` s/d `T12-06`, `T13-01` s/d `T13-03`)
**Metode Verifikasi:** Inspeksi kode sumber langsung (`src/` dan `src-tauri/src/`) secara independen tanpa membaca laporan pemburu bug (`docs/bug-hunt/tasks/T*.md`), divalidasi silang dengan eksekusi skrip reproduksi Node.js (`tests/bug-hunt/T11_verify.mjs`, `tests/bug-hunt/T12_verify.mjs`, `tests/bug-hunt/T13_verify.mjs`).

---

## Tabel Ringkasan Hasil Verifikasi

| ID | Judul Singkat Temuan | Klaim Awal | Status Akhir | Keparahan Akhir | Metode Pembuktian | Status Desktop Asli |
|---|---|---|---|---|---|---|
| `T11-01` | Pengiriman otomatis riwayat clipboard, catatan, to-do, nama file, dan lokasi ke AI/proxy di setiap chat tanpa persetujuan pengguna | KRITIS | **TERKONFIRMASI** | **KRITIS** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-02` | Eksekusi aksi destruktif dan IPC sistem OS otomatis tanpa konfirmasi pengguna serta crash `TypeError` pada argumen tool LLM yang tidak tervalidasi | KRITIS | **TERKONFIRMASI** | **KRITIS** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-03` | API key Gemini dikirim melalui parameter query URL (`?key=` / `&key=`) dan berisiko bocor ke pesan error UI serta `localStorage` | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-04` | Draft API key disimpan dalam bentuk plaintext di `localStorage` dan draft custom model key tidak pernah dibersihkan setelah disimpan | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-05` | State `isStreaming` di `AiChatPanel` macet `true` permanen ketika anggaran berstatus `block` atau API key kosong | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-06` | Race condition saat menghentikan lalu memulai ulang stream serta stream terus berjalan/menulis setelah percakapan dihapus | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-07` | Error mid-stream SSE pada Anthropic/OpenAI-compatible diabaikan, event SSE multi-baris gagal di-parse, dan buffer `StreamContentFilter` terpotong saat error/abort | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-08` | Race condition `initCredentials()` saat cold start dan silent fallback ke `gili-free` saat pengguna BYOK mengirim gambar | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-09` | Eviction saat `QuotaExceededError` di `saveRawConversations` menghapus percakapan yang baru diperbarui sementara percakapan lama bertahan | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T11-10` | Toggle "Sensor data sensitif" pada Window Picker tidak menyensor screenshot (mode default), `windowTitle`, dan format token selain `sk-` | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T12-01` | Token sesi LAN prediktif (LCG berbasis waktu) dan oracle HTTP memungkinkan akses unduh/unggah tanpa otorisasi | KRITIS | **TERKONFIRMASI** | **KRITIS** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T12-02` | Pengaturan notifikasi/DND OS Windows tidak dibackup di `windows_dnd.rs` dan tidak dipulihkan saat keluar/crash, serta risiko hilangnya backup di `toast_banners.rs` | KRITIS | **TERKONFIRMASI** | **KRITIS** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T12-03` | File Shelf yang sudah dihapus bangkit kembali (resurrection) saat muat ulang dan seluruh data hilang jika JSON `localStorage` korup | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T12-04` | Loop pemanggilan IPC `get_file_preview` berulang (O(N^2) dan tak berhenti untuk gambar hilang) serta kebocoran memori base64 di `ClipboardPanel.tsx` | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T12-05` | Sinkronisasi state transfer LAN putus saat panel Shelf unmount/pindah tab & tombol Selesai/Kembali membunuh sesi upload yang sedang berjalan | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T12-06` | Server HTTP LAN tidak pernah dimatikan setelah aktif dan rentan pembekuan (Slowloris / thread-pool exhaustion) karena ketiadaan read timeout | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T13-01` | Kebocoran refcount `SharedSampler` saat `win.destroy()` & desinkronisasi refcount di `systemMetricsService.ts` | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T13-02` | Thread `backdrop_blur` membuat ulang 3 shader `CompositionEffectFactory` tiap 85ms saat burst & melakukan DWM recomposition tiap 45-650ms saat idle | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |
| `T13-03` | Empat loop polling 20-45 ms (~174 wake-up/detik) tetap berjalan saat idle/jendela tertutup dan memanggil cek snipping ~180+ kali/detik | TINGGI | **TERKONFIRMASI** | **TINGGI** | `[TERBUKTI LEWAT UJI]` & `[TERKONFIRMASI DI KODE]` | `[BELUM DIVERIFIKASI DI DESKTOP ASLI]` |

---

## Rincian Verifikasi per Temuan

### 1. `T11-01` - Pengiriman otomatis riwayat clipboard, catatan, to-do, nama file, dan lokasi ke AI/proxy di setiap chat tanpa persetujuan pengguna
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `KRITIS`
- **Bukti Verifikasi Independen:**
  - Di [aiChatService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiChatService.ts#L822-L833), fungsi `streamChatCompletion` selalu memanggil `getNotchSystemInstruction()` tanpa opsi opt-in/toggle dan menyuntikkannya ke dalam `systemInstruction` pada setiap permintaan chat (termasuk saat `useGiliFree = true` ke endpoint proxy eksternal).
  - Di [aiNotchTools.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiNotchTools.ts#L63-L255), `getNotchRealtimeContext()` secara otomatis membaca dan merangkai:
    1. Lagu yang sedang diputar (`getCurrentMedia()`, baris 86-96).
    2. Hingga 10 item tugas belum selesai beserta tenggat waktu dari `localStorage.getItem("island_todo_list")` (baris 108-133).
    3. Hingga 5 catatan dari `loadMiniNotes()` berisi judul dan potongan isi 120 karakter (baris 146-163).
    4. Lokasi geografis pengguna (`schedule.locationName`) dan jadwal sholat dari `getImmediatePrayerSchedule()` (baris 204-217).
    5. Hingga 5 nama file di Drop Shelf dari `getInitialShelfFiles()` (baris 222-230).
    6. Hingga 3 entri teks terbaru (masing-masing 80 karakter) dari `localStorage.getItem("island_clipboard_history")` (baris 234-251) yang sering berisi password, OTP, atau token yang baru disalin pengguna.
  - Uji `TEST-07` pada `tests/bug-hunt/T11_verify.mjs` membuktikan teks rahasia di `island_clipboard_history` langsung masuk ke string konteks sistem tanpa aksi lampirkan dari pengguna.

---

### 2. `T11-02` - Eksekusi aksi destruktif dan IPC sistem OS otomatis tanpa konfirmasi pengguna serta crash `TypeError` pada argumen tool LLM yang tidak tervalidasi
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `KRITIS`
- **Bukti Verifikasi Independen:**
  - **Eksekusi Otomatis & Regex Terlalu Lebar:** Di [aiBackgroundStreamService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiBackgroundStreamService.ts#L384-L386), begitu stream selesai, `parseAndExecuteGiliActions(job.accumulated)` langsung dieksekusi tanpa dialog persetujuan pengguna. Di [aiNotchTools.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiNotchTools.ts#L796-L797), `COMPLETE_ACTION_BLOCK_REGEX` mencocokkan ```` ```action ```` biasa selain `gili_action`, serta mencocokkan blok tak tertutup di akhir respons (baris 857-868). Aksi mencakup penghapusan catatan/to-do (`delete_todo`, `delete_note` dengan pencocokan `.includes(query)` yang sangat longgar di baris 468 dan 582) dan IPC sistem (`set_master_volume`, `set_brightness`, `focusMode` di baris 722-759).
  - **Crash `TypeError` & Argumen Tak Tervalidasi:** Di [aiNotchTools.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiNotchTools.ts#L370), destructuring `const { action: type, params = {} } = action;` hanya memakai default `{}` jika `params === undefined`. Jika LLM mengirim `"params": null`, maka `params.text` melempar `TypeError: Cannot read properties of null`. Selain itu, `(params.text || "").trim()` (baris 374) dan `(params.query || "").toLowerCase().trim()` (baris 419, 459, 531, 573) melempar `TypeError` jika LLM mengirim angka atau array (mis. `{ text: 123 }` atau `{ query: ["a"] }`). Karena `try` baru dimulai setelah pembacaan parameter, exception tidak tertangkap di `executeGiliAction` maupun `parseAndExecuteGiliActions`, sehingga melompat ke `catch (err)` di `aiBackgroundStreamService.ts:418` dan menandai seluruh pesan asisten sebagai gagal meskipun teks jawaban sudah penuh.
  - Di baris 665, `const amount = Number(params.amountMl) || 250;` meloloskan angka negatif (`-500`) langsung ke `logDrink(-500, false)`.
  - Seluruh skenario ini terbukti lewat eksekusi `TEST-07` di `tests/bug-hunt/T11_verify.mjs`.

---

### 3. `T11-03` - API key Gemini dikirim melalui parameter query URL (`?key=` / `&key=`) dan berisiko bocor ke pesan error UI serta `localStorage`
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Di [aiModelRegistry.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiModelRegistry.ts#L621-L624) dan [baris 643-646](file:///d:/kerjaan/projek-ndiri/island/src/services/aiModelRegistry.ts#L643-L646), `listGeminiModels` menyisipkan `?key=${encodeURIComponent(key)}` langsung di URL meskipun sudah mengirim header `{"x-goog-api-key": key}`.
  - Di [geminiApi.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/geminiApi.ts#L268-L269) dan [baris 307-312](file:///d:/kerjaan/projek-ndiri/island/src/services/geminiApi.ts#L307-L312), `runGenerateContentStream` melakukan retry dengan `useQueryKey = true` yang menambahkan `&key=${encodeURIComponent(opts.apiKey)}` ke URL ketika terjadi error HTTP 400/401/403 yang memuat kata `api key`.
  - Di backend Rust [lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L1113) dan [baris 1240](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L1240), `ureq::Error` diformat langsung dengan `format!("Network error: {}", e)` yang menyertakan URL lengkap beserta query string `?key=[REDACTED]`. Error ini kemudian diteruskan ke `reason` di `aiModelRegistry.ts:818` (`testFailReason` di UI) dan ke `message.error` yang disimpan permanen ke `localStorage` oleh `aiBackgroundStreamService.ts:428-440`. Terbukti pada `TEST-05` (`leakedInErrorReason=true`).

---

### 4. `T11-04` - Draft API key disimpan dalam bentuk plaintext di `localStorage` dan draft custom model key tidak pernah dibersihkan setelah disimpan
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Di [AiChatConnectView.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatConnectView.tsx#L92-L102) dan [baris 206-211](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatConnectView.tsx#L206-L211), setiap ketikan atau tempelan API key di input memanggil `setDraftKey`, yang menulis API key mentah (plaintext) ke `localStorage` pada key `island_ai_draft_key_<provider>` atau `island_ai_draft_model_key_<modelId>`. Hal ini bertentangan langsung dengan klaim UI di baris 769 (`t("aichat_connect_encryption_desc")`).
  - Untuk custom model key (`isModelCustomKey === true`), saat pengguna menekan Simpan (`persistKey` -> `saveModelKey` -> `saveSecureModelKey` di [aiCredentialService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiCredentialService.ts#L75-L92)), tidak ada pemanggilan `localStorage.removeItem("island_ai_draft_model_key_" + modelId)`. Akibatnya, API key model kustom tertinggal selamanya dalam bentuk plaintext di `localStorage`.
  - Selain itu, jika pengguna mengetik API key lalu menutup panel tanpa menekan Simpan, `island_ai_draft_key_<provider>` juga tetap tersimpan dalam bentuk plaintext di `localStorage`.

---

### 5. `T11-05` - State `isStreaming` di `AiChatPanel` macet `true` permanen ketika anggaran berstatus `block` atau API key kosong
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Di [AiChatPanel.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatPanel.tsx#L641-L643), `handleSendPrompt` menyetel `isSendingRef.current = true;` dan `setIsStreaming(true);` sebelum blok `try`.
  - Pada cabang `!keyToUse` di [baris 797-799](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatPanel.tsx#L797-L799), kode hanya memanggil `setActiveView("connect"); return;` tanpa mereset `setIsStreaming(false)`.
  - Pada cabang `budgetEval.isExceeded && budgetEval.action === "block"` di [baris 802-845](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatPanel.tsx#L802-L845), kode menambahkan pesan error anggaran ke daftar pesan lalu melakukan `return;` di baris 844 tanpa memanggil `setIsStreaming(false)`.
  - Blok `finally` di [baris 958-960](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatPanel.tsx#L958-L960) hanya mereset `isSendingRef.current = false;` dan tidak mereset `isStreaming`. Karena tidak ada stream latar belakang yang dimulai untuk memicu listener `subscribeAiBackgroundStreams`, state `isStreaming` di `AiChatPanel` terkunci `true` dan memblokir seluruh pengiriman pesan berikutnya (guard `if (... || isStreaming || ...)` di baris 624).

---

### 6. `T11-06` - Race condition saat menghentikan lalu memulai ulang stream serta stream terus berjalan/menulis setelah percakapan dihapus
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **Race Stop + Restart:** Di [aiBackgroundStreamService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiBackgroundStreamService.ts#L221-L235), `stopBackgroundAiStream(conversationId)` memanggil `job.controller.abort()` dan langsung menghapus `activeJobs.delete(conversationId)`. Jika pengguna segera mengirim pesan baru pada `conversationId` yang sama, `startBackgroundAiChatStream` (baris 268) melihat `activeJobs.has(conversationId) === false` dan memulai Job 2. Namun ketika promise `streamChatCompletion` milik Job 1 yang di-abort akhirnya selesai unwind dan masuk ke blok `if (controller.signal.aborted)` (baris 368-375) atau `catch` (baris 419-425), Job 1 memanggil `cacheConversationMessages(conversationId, partialMessages)` dan `updateConversationMessages(conversationId, partialMessages)` tanpa memeriksa apakah `activeJobs.get(conversationId) === job`, sehingga menimpa pesan baru milik Job 2.
  - **Stream Berlanjut Setelah Delete:** Di [aiConversationService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiConversationService.ts#L275-L289) dan [AiChatHistoryModal.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatHistoryModal.tsx#L96-L109), baik `deleteConversation(id)` maupun `clearAllConversations()` tidak memanggil `stopBackgroundAiStream`. Stream latar belakang terus berjalan, memanggil `parseAndExecuteGiliActions` (mengeksekusi aksi Notch dari percakapan yang sudah dihapus), mencatat penggunaan token, dan meninggalkan pesan yatim di `completedMessagesCache`.
  - Kedua skenario ini terbukti secara deterministik pada `TEST-08` di `tests/bug-hunt/T11_verify.mjs`.

---

### 7. `T11-07` - Error mid-stream SSE pada Anthropic/OpenAI-compatible diabaikan, event SSE multi-baris gagal di-parse, dan buffer `StreamContentFilter` terpotong saat error/abort
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **(a) Error Mid-Stream Diabaikan:** Di [aiChatService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiChatService.ts#L941-L974) (Anthropic) dan [baris 1133-1164](file:///d:/kerjaan/projek-ndiri/island/src/services/aiChatService.ts#L1133-L1164) (OpenAI-compatible), `onChunk` sama sekali tidak memeriksa `parsed.type === "error"` atau `parsed.error`. Jika server mengirim error setelah HTTP 200 dibuka, stream selesai normal dengan teks kosong atau terpotong tanpa pesan error.
  - **(b) Event SSE Multi-Baris:** Baik `ai_http_stream` di [lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L1212-L1218) maupun `createSseLineConsumer` di [aiHttp.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiHttp.ts#L42-L68) memproses per baris tunggal, dan `onChunk` langsung memanggil `JSON.parse(dataStr)` pada tiap baris `data:`. Event SSE yang terpecah menjadi beberapa baris `data:` selalu gagal `JSON.parse` dan ditelan oleh `catch {}`.
  - **(c) Buffer `StreamContentFilter` Hilang Saat Error/Abort:** Di [aiChatService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiChatService.ts#L758-L767), `StreamContentFilter` menahan akhiran yang cocok dengan `["<", "<t", "<th", "<thi", "<thin", "<think"]` (serta hingga 8 karakter di dalam `<think>`). Karena `filter.flush()` (baris 975, 1008, 1166) tidak berada di dalam blok `finally`, setiap kali `streamAiRequest` melempar error atau di-abort, karakter di dalam `this.buffer` hilang.
  - **(d) Kontaminasi Fallback Gemini:** Di [geminiApi.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/geminiApi.ts#L337-L376), jika model pertama sempat memanggil `opts.onText` sebelum melempar error yang memicu fallback ke model pengganti, chunk dari model pertama sudah terlanjur ditambahkan ke `job.accumulated` dan digabung dengan respons model kedua (`"Draft1Final2"`).
  - Keempat sub-masalah terbukti lewat `TEST-06` di `tests/bug-hunt/T11_verify.mjs`.

---

### 8. `T11-08` - Race condition `initCredentials()` saat cold start dan silent fallback ke `gili-free` saat pengguna BYOK mengirim gambar
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **(a) Race Cold Start `initCredentials()`:** Di [aiCredentialService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiCredentialService.ts#L71-L73), `getEffectiveApiKeySync` hanya membaca `credentialCache` di memori yang baru terisi setelah `initCredentials()` (async IPC ke Windows Credential Manager) selesai. Namun di [AiChatPanel.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatPanel.tsx#L141-L159), inisialisasi `activeView` berjalan sinkron saat mount sebelum `useEffect` `initCredentials()` (baris 118-126) selesai. Jika `isGiliFreeEnabled()` bernilai `false` (atau pengguna segera mengirim di `QuickAiChatNotchCard.tsx:192` sebelum promise selesai), `getEffectiveApiKey` mengembalikan `""` sehingga pengguna BYOK dilempar ke tampilan `"connect"` atau gagal mengirim.
  - **(b) Silent Fallback ke `gili-free` Saat Kirim Gambar:** Di [AiChatPanel.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatPanel.tsx#L742-L750) dan [QuickAiChatNotchCard.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/QuickAiChatNotchCard.tsx#L473-L485), ketika pengguna BYOK yang hanya mendaftarkan provider non-vision (mis. DeepSeek) mengirim gambar dalam mode `Auto`, `visionCandidates` menjadi kosong (`length === 0`). Kode langsung masuk ke `if (visionCandidates.length === 0 && isGiliFreeEnabled())` yang mengganti `modelToUse = getGiliFreeModel()` dan `useGiliFree = true` secara diam-diam tanpa peringatan, sehingga gambar dan konteks pengguna dikirim ke server proxy Gili Free.

---

### 9. `T11-09` - Eviction saat `QuotaExceededError` di `saveRawConversations` menghapus percakapan yang baru diperbarui sementara percakapan lama bertahan
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Di [aiConversationService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiConversationService.ts#L244-L273), `updateConversationMessages` memutasi objek `conv` di tempat di dalam array `list` tanpa mengurutkan ulang `list` berdasarkan `updatedAt` terbaru (`list.sort((a, b) => b.updatedAt - a.updatedAt)` hanya dilakukan di `getConversations()`, bukan di `updateConversationMessages` atau `saveRawConversations`).
  - Di [aiConversationService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/aiConversationService.ts#L101-L113), ketika `localStorage.setItem` melempar `QuotaExceededError`, loop fallback melakukan `sanitized.slice(0, limit)` yang memotong elemen dari bagian akhir array (`index` besar). Jika pengguna memperbarui percakapan yang berada di urutan belakang array (atau jika urutan array di storage adalah `[oldConv, newerConv]`), maka `sanitized.slice(0, limit)` justru membuang percakapan yang sedang aktif diperbarui oleh pengguna dan mempertahankan percakapan lama di indeks awal.
  - Terbukti secara langsung pada `TEST-09` di `tests/bug-hunt/T11_verify.mjs`.

---

### 10. `T11-10` - Toggle "Sensor data sensitif" pada Window Picker tidak menyensor screenshot (mode default), `windowTitle`, dan format token selain `sk-`
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Di [AiChatWindowPickerModal.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatWindowPickerModal.tsx#L32-L38), `readMode` secara default bernilai `"screenshot"`, sementara toggle `censorSensitive` secara default bernilai `true` (baris 46) dan tetap ditampilkan aktif di UI pada kedua mode.
  - Di [baris 99-115](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/aichat/AiChatWindowPickerModal.tsx#L99-L115):
    1. Saat `readMode === "screenshot"`, gambar bitmap `imgUrl` (`res.imageDataUrl`) dilampirkan mentah-mentah tanpa sensor atau peringatan bahwa gambar tidak disensor.
    2. `title` (`${selectedWin.appName} · ${title}`) dan fallback di baris 125-131 (`let fallbackText = selectedWin.windowTitle;`) sama sekali tidak melewati regex sensor `censorSensitive`, padahal judul jendela sering memuat alamat email atau token.
    3. Regex sensor di baris 100-102 hanya mengganti pola email dan `/sk-[a-zA-Z0-9_-]+/g`, sehingga kunci API umum lain seperti `AIza...` (Google/Gemini), `ghp_...` / `github_pat_...` (GitHub), `xai-...` (Grok), `Bearer ...`, atau `eyJ...` (JWT) sama sekali tidak disensor.

---

### 11. `T12-01` - Token sesi LAN prediktif (LCG berbasis waktu) dan oracle HTTP memungkinkan akses unduh/unggah tanpa otorisasi
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `KRITIS`
- **Bukti Verifikasi Independen:**
  - Di [shelf_server.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L557-L568), server HTTP diikat ke `0.0.0.0:8731` (seluruh antarmuka jaringan).
  - Di [shelf_server.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L446-L457), `generate_token()` tidak memakai CSPRNG, melainkan hanya mengambil `now_millis()`, mereduksinya ke `u32` via `(now ^ (now >> 7)) as u32`, lalu menjalankan LCG deterministik `rand_val.wrapping_mul(1103515245).wrapping_add(12345)` sebanyak 7 putaran.
  - Di [shelf_server.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L643-L703) dan [baris 848-856](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L848-L856), ketika belum ada sesi aktif (`session_opt == None`), request ke `/d/apa_saja` atau `/u/apa_saja` mengembalikan HTTP `404` (`"Sesi transfer belum aktif atau telah berakhir."`). Begitu sesi dimulai oleh pengguna, request dengan token salah mengembalikan HTTP `403` (`"Token download tidak valid."` / `"Token upload tidak valid."`).
  - Perbedaan status `404` vs `403` ini menjadi oracle waktu: klien mana pun di LAN yang melakukan polling setiap 1 detik tahu persis jendela 1.000 ms saat sesi dibuat, yang hanya menghasilkan maksimal 1.000 kandidat token (terbukti di `tests/bug-hunt/T12_verify.mjs` `testWeakTokenPrediction()`), dan dapat ditembus dalam hitungan kurang dari 1 detik karena tidak ada rate limiting.

---

### 12. `T12-02` - Pengaturan notifikasi/DND OS Windows tidak dibackup di `windows_dnd.rs` dan tidak dipulihkan saat keluar/crash, serta risiko hilangnya backup di `toast_banners.rs`
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `KRITIS`
- **Bukti Verifikasi Independen:**
  - **(a) `windows_dnd.rs` Tanpa Backup & Tanpa Restore on Exit:** Di [windows_dnd.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_dnd.rs#L35-L65), `set_windows_dnd(enabled)` langsung menimpa WNF `WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED`, registry `NOC_GLOBAL_SETTING_TOASTS_ENABLED` (`0` atau `1`), serta `QuietHoursActive` dan `QuietHoursEnabled` tanpa pernah membackup nilai awal milik pengguna. Saat `set_windows_dnd(false)` dipanggil, nilai dipaksa ke `0`/`1` meskipun sebelumnya pengguna memakai mode Alarms Only (`2`) atau menonaktifkan toast secara manual. Lebih parah lagi, di [lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L4445-L4449), [baris 4492-4496](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L4492-L4496), dan [baris 4784-4788](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L4784-L4788), saat aplikasi keluar (`quit`), `restart_app`, atau panic, Gili hanya memanggil `taskbar_manager::restore_taskbar_on_exit()` dan sama sekali tidak memulihkan `windows_dnd` maupun `toast_banners`. Jika Gili ditutup saat mode DND atau Pomodoro Focus aktif, seluruh notifikasi toast Windows pengguna mati permanen di tingkat OS.
  - **(b) Inversi Logika `get_windows_dnd()`:** Di [windows_dnd.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/windows_dnd.rs#L69-L98), jika `NtQueryWnfStateData` berhasil (`status == 0`) tetapi mengembalikan `buffer[0] == 0` (Focus Assist mati di WNF), kode tidak melakukan `return false`, melainkan lanjut ke fallback registry dan mengembalikan `true` jika `NOC_GLOBAL_SETTING_TOASTS_ENABLED == 0`.
  - **(c) Kehilangan Backup di `toast_banners.rs`:** Di [toast_banners.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/toast_banners.rs#L29-L31), hasil `let _ = backup.set_value(&app_id, &previous);` diabaikan sebelum `app_key.set_value("ShowBanner", &0u32)` dijalankan. Di `restore_banners` (baris 37-62), `let _ = hkcu.delete_subkey_all(BACKUP_PATH);` selalu dihapus di akhir loop meskipun pembukaan atau pemulihan sebagian `app_key` gagal.

---

### 13. `T12-03` - File Shelf yang sudah dihapus bangkit kembali (resurrection) saat muat ulang dan seluruh data hilang jika JSON `localStorage` korup
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **Resurrection File yang Dihapus:** Di [shelfService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/shelfService.ts#L317-L349), `persistShelfFiles` menulis ke `localStorage` secara sinkron tetapi menunda penulisan ke `shelf.json` (`store.save()`) dengan debounce 300ms (kecuali `immediate = true`, sedangkan penghapusan satu/beberapa file tidak mengirim `immediate = true` dan menyisakan `localData.length > 0`). Di [baris 290-305](file:///d:/kerjaan/projek-ndiri/island/src/services/shelfService.ts#L290-L305), `loadPersistedShelfFiles()` memilih sumber data dengan membandingkan `Math.max(...arr.map(f => f.addedAt || 0))` lewat kondisi `if (storeNewest >= 0 && storeNewest >= localNewest) { result = storeData!; }`.
    - Jika pengguna menghapus file paling baru (`fileB`, `addedAt: 2000`), maka `storeNewest` (`2000` di `shelf.json` yang belum ter-flush) > `localNewest` (`1000` di `localStorage`), sehingga `storeData` menang dan `fileB` hidup kembali.
    - Bahkan jika pengguna menghapus file lama (`fileA`, `addedAt: 1000`), `storeNewest` (`2000`) === `localNewest` (`2000`), dan karena operatornya `>=`, `storeData` tetap menang sehingga `fileA` juga hidup kembali! Terbukti di `tests/bug-hunt/T12_verify.mjs` (`testShelfResurrection`).
  - **Hilangnya Data Saat `localStorage` Korup:** Di [shelfService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/shelfService.ts#L275-L279), `JSON.parse(local)` berada di dalam blok `try` utama tanpa `try/catch` lokal. Jika string di `localStorage` korup, exception melompat ke `catch` di baris 311 dan mengembalikan `[]` (baris 314), mengabaikan `storeData` yang sudah berhasil dibaca dengan valid dari `shelf.json` pada baris 265, lalu pemanggil di `App.tsx` menimpa state dengan array kosong.

---

### 14. `T12-04` - Loop pemanggilan IPC `get_file_preview` berulang (O(N^2) dan tak berhenti untuk gambar hilang) serta kebocoran memori base64 di `ClipboardPanel.tsx`
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Di [ClipboardPanel.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/ClipboardPanel.tsx#L57-L79), `useEffect` memiliki dependensi `[items, loadedThumbnails, onUpdateItem]`:
    1. Setiap kali satu panggilan `invoke("get_file_preview")` berhasil untuk satu item gambar tanpa `thumbnail`, callback `.then` memanggil `setLoadedThumbnails(...)` DAN `onUpdateItem?.(item.id, { thumbnail: res.thumbnail })` (yang memutasi state `clipboardHistory` odnosno `items` di `App.tsx:914-924`).
    2. Perubahan `loadedThumbnails` dan `items` memicu ulang `useEffect` untuk sisa item yang masih in-flight (belum selesai IPC-nya), sehingga memicu N+(N-1)+... panggilan IPC `get_file_preview` duplikat.
    3. Jika file gambar di `item.imagePath` sudah dihapus dari disk atau gagal dibaca (`res?.thumbnail` bernilai `undefined` atau promise reject ke `.catch(() => {})`), `loadedThumbnails[item.id]` tidak pernah diisi dan tidak ada pencatatan ID yang gagal. Akibatnya, setiap kali `items` atau `loadedThumbnails` berubah, `get_file_preview` terus dipanggil ulang tanpa henti untuk item yang hilang tersebut.
    4. `loadedThumbnails` menyimpan string data URL base64 di memori komponen tetapi tidak pernah menghapus kunci ID ketika item dihapus (`onDeleteItem`) atau dibersihkan (`onClearAll`), dan `onUpdateItem` menyuntikkan base64 `thumbnail` kembali ke `localStorage` (`island_clipboard_history`).

---

### 15. `T12-05` - Sinkronisasi state transfer LAN putus saat panel Shelf unmount/pindah tab & tombol Selesai/Kembali membunuh sesi upload yang sedang berjalan
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **(a) Unmount / Pindah Tab Memutus Listener & Mereset State:** Di [DropShelfPanel.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/DropShelfPanel.tsx#L198-L273), state `transferMode`, `sessionInfo`, dan `incomingProgress` beserta listener Tauri (`onShelfTransferProgress`, `onShelfFileReceived`, `onShelfTransferCompleted`) hanya hidup selama `DropShelfPanel` ter-mount. Saat pengguna berpindah tab Notch atau Notch menyusut ke mode idle, `DropShelfPanel` unmount dan melepas ketiga listener tersebut. File yang diunggah dari HP während panel tertutup tidak pernah masuk ke daftar rak (`onAddFilesRef`), dan saat pengguna kembali ke tab Drop Shelf, komponen diinisialisasi ulang ke `transferMode = "idle"` tanpa memanggil `get_shelf_transfer_status` ([shelf_server.rs:2333](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L2333) tidak pernah dipanggil di `src/`).
  - **(b) Tombol Back & Selesai Mematikan Sesi:** Di [DropShelfPanel.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/DropShelfPanel.tsx#L345-L354) dan [baris 1032-1033](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/DropShelfPanel.tsx#L1032-L1033), baik prop `onClose` (dipakai tombol Back di `DropShelfTransferModal.tsx:132` dan tombol `Selesai` di baris 257) maupun `onCancel` sama-sama dihubungkan ke `handleCloseTransfer`, yang langsung memanggil `stopShelfTransfer()` (`*session_guard = None` di backend) sehingga menggagalkan pengiriman file berikutnya dari HP dengan HTTP 404.
  - **(c) Timer Habis & Endpoint `/complete`:** Di [DropShelfTransferModal.tsx](file:///d:/kerjaan/projek-ndiri/island/src/components/ui/shelf/DropShelfTransferModal.tsx#L56-L68), ketika `secondsRemaining` mencapai `0`, modal tidak menutup diri atau memberi tahu pengguna bahwa QR sudah kadaluarsa. Selain itu, di [shelf_server.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L1106-L1129), `/u/<token>/complete` mempercayai mentah-mentah parameter query `count`, `bytes`, dan `device` untuk di-emit ke UI tanpa memverifikasi jumlah file yang benar-benar berhasil disimpan di server.

---

### 16. `T12-06` - Server HTTP LAN tidak pernah dimatikan setelah aktif dan rentan pembekuan (Slowloris / thread-pool exhaustion) karena ketiadaan read timeout
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **Server Tidak Pernah Dimatikan:** Di [shelf_server.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L380-L386), field `is_running: Arc<AtomicBool>` pada `ServerManager` bahkan diberi atribut `#[allow(dead_code)]` karena tidak pernah diubah menjadi `false`. Fungsi `stop_shelf_transfer()` di [baris 2322-2330](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L2322-L2330) hanya menyetel `*session_guard = None;` tanpa menghentikan thread penerima koneksi ataupun menutup socket `0.0.0.0:8731`.
  - **Thread-Pool Exhaustion / Tanpa Read Timeout:** Di [shelf_server.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L580-L596), server membuat tepat 8 worker thread tetap yang membaca dari `sync_channel(64)`. Di [baris 942-950](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shelf_server.rs#L942-L950), saat menangani `POST /u/<token>/upload`, worker memanggil `reader.read(&mut buffer)?` secara blocking tanpa batas waktu baca (read timeout) pada socket `tiny_http`. Jika koneksi Wi-Fi HP terputus di tengah upload tanpa paket TCP FIN/RST (atau ada 8 koneksi menggantung di LAN), kedelapan worker thread akan memblokir selamanya di `reader.read(...)`, melumpuhkan seluruh fitur transfer file LAN hingga aplikasi Gili di-restart.

---

### 17. `T13-01` - Kebocoran refcount `SharedSampler` saat `win.destroy()` & desinkronisasi refcount di `systemMetricsService.ts`
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **(a) Kebocoran Refcount Backend saat `win.destroy()`:** Di [shared_sampler.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/shared_sampler.rs#L129-L153), `SamplerState.subscriptions` menyimpan `HashMap<String, u32>` global per nama topik (`"metrics"`), bukan per label jendela WebView2, dan tidak ada kait (hook) pada `WindowEvent::Destroyed` untuk mengurangi counter. Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1742-L1754), `hide_navbar_window` menghancurkan jendela navbar secara paksa dengan `win.destroy()` setelah 40ms. Jika komponen modul di dalam navbar atau jendela sekunder sedang berlangganan `"metrics"`, `win.destroy()` mematikan konteks JS sebelum cleanup async `invoke("unsubscribe_system_metrics")` terpanggil. Akibatnya, counter `subscriptions["metrics"]` di Rust tidak pernah kembali ke `0`, sehingga thread `gili-shared-sampler` (baris 69-79) tidak pernah masuk ke `condvar.wait_while` (tidur 0% CPU) dan terus melakukan sampling CPU/RAM/GPU/Wi-Fi seumur hidup aplikasi.
  - **(b) Desinkronisasi Refcount di `systemMetricsService.ts`:** Di [systemMetricsService.ts](file:///d:/kerjaan/projek-ndiri/island/src/services/systemMetricsService.ts#L87-L104), `subscribeToSystemMetrics` menyimpan callback di dalam `Set` (`listeners.add(callback)`), tetapi mengelola counter terpisah `activeSubscribers++` dan mengembalikan fungsi cleanup tanpa guard idempoten (`let called = false`).
    - Jika fungsi cleanup yang sama dipanggil dua kali, `activeSubscribers` berkurang dua kali hingga mencapai `0` dan mematikan langganan backend meskipun subscriber lain masih aktif di dalam `listeners`.
    - Jika referensi fungsi callback yang sama didaftarkan dua kali, `listeners.size` hanya `1` sementara `activeSubscribers` menjadi `2`; saat salah satu melakukan unsubscribe, `listeners.delete(callback)` menghapus callback tersebut sehingga subscriber kedua berhenti menerima data sementara backend tetap berjalan.
  - Ketiga skenario terbukti melalui simulasi di `tests/bug-hunt/T13_verify.mjs` (`Skenario A, B, C -> bug_terbukti=true`).

---

### 18. `T13-02` - Thread `backdrop_blur` membuat ulang 3 shader `CompositionEffectFactory` tiap 85ms saat burst & melakukan DWM recomposition tiap 45-650ms saat idle
- **Status Akhir:** `TERKONFIRMASI` (`[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - **Siklus Idle 45ms & Recomposition 650ms:** Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L630-L643), selama ada minimal satu slot underlay yang visible (`any_visible == true`, yang selalu benar selama Notch/Island tampil di layar), thread `gili-native-dwm-acrylic` bangun setiap `wait_ms = 45` ms (~22,2 kali/detik) untuk memanggil `GetWindowRect` pada parent HWND. Lalu setiap `650ms` (baris 804), `refresh_due` bernilai `true` dan memanggil `refresh_backdrop(..., force_revalidate = false)` diikuti `commit_composition` (`RequestCommitAsync`), yang secara sengaja mengubah opasitas visual (`0.996` vs `1.0`), menggeser offset/size geometris sebesar `0.25px`, dan membuat objek COM baru `comp.CreateHostBackdropBrush()` (baris 247) terus-menerus walaupun layar sedang benar-benar diam.
  - **Pembuatan Ulang 3 Shader Tiap 85ms Saat Burst:** Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L446-L530), hook WinEvent global (`WINEVENT_OUTOFCONTEXT_SKIPOWN` pada seluruh proses desktop) mengirim `AcrylicCommand::InvalidateBackdrop` setiap kali ada jendela apa pun di Windows yang bergerak (`EVENT_OBJECT_LOCATIONCHANGE`, di-throttle 60ms), berpindah fokus, muncul, disembunyikan, atau berubah urutan Z. Setiap sinyal menyetel `burst_until = Instant::now() + 950ms` (baris 691). Selama `burst_active`, setiap `85ms` (baris 803) kode memanggil `refresh_backdrop` dengan `force_revalidate = true` (baris 812-813). Di dalam blok `if force_revalidate` ([baris 356-398](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L356-L398)), kode:
    1. Mematikan lalu menyalakan ulang `DwmSetWindowAttribute(..., DWMWA_USE_HOSTBACKDROPBRUSH)` (2 syscall DWM).
    2. Memanggil `SetWindowPos(..., SWP_FRAMECHANGED)`.
    3. Mencopot dan memasang ulang root visual (`target.SetRoot(None)` lalu `target.SetRoot(&self.visual)`).
    4. Memanggil `create_gaussian_backdrop_brush_with_sigma` (1 kali) ditambah `BackdropBrushPair::new` (yang memanggil `create_gaussian_backdrop_brush_with_sigma` 2 kali lagi di baris 232-233). Artinya setiap 85ms per jendela underlay, Gili membuat ulang **3 buah** `CompositionEffectFactory`, `CompositionEffectBrush`, dan `HostBackdropBrush` baru, padahal `fresh_brush` pertama langsung menimpa brush di visual dan membuat alokasi `BackdropBrushPair::new` mubazir hingga siklus non-force berikutnya.

---

### 19. `T13-03` - Empat loop polling 20-45 ms (~174 wake-up/detik) tetap berjalan saat idle/jendela tertutup dan memanggil cek snipping ~180+ kali/detik
- **Status Akhir:** `TERKONFIRMASI` (`[TERBUKTI LEWAT UJI]`, `[TERKONFIRMASI DI KODE]`, `[BELUM DIVERIFIKASI DI DESKTOP ASLI]`)
- **Keparahan Akhir:** `TINGGI`
- **Bukti Verifikasi Independen:**
  - Pembacaan langsung kode sumber Rust mengonfirmasi keempat thread loop latar belakang berikut terus bangun saat desktop idle:
    1. **Loop Kursor & Foreground Utama (`50 Hz` / tiap `20ms`):** Di [lib.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/lib.rs#L4899-L5227), thread melakukan `std::thread::sleep(Duration::from_millis(20))` tanpa backoff saat idle dan memanggil `GetCursorPos` serta `navbar_window::is_snipping_shortcut_or_overlay_active()` (baris 5046) sebanyak **50 kali/detik**.
    2. **Loop Tracker Miniplayer (`50 Hz` / tiap `20ms`):** Di [miniplayer_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/miniplayer_window.rs#L355-L396), thread melakukan `std::thread::sleep(Duration::from_millis(20))` tanpa henti. Bahkan ketika miniplayer sedang **tertutup** (`!is_open || !is_visible` di baris 379), loop tetap tidur hanya `20ms` (50 wake-up/detik), mengunci mutex `get_open_state()`, mencari window `"miniplayer"` di Tauri, dan setiap 22 iterasi (~440ms) membaca skala teks sistem dari registry Windows (`get_system_text_scale()`).
    3. **Loop Watcher Navbar (`40 Hz` / tiap `25ms`):** Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L1215-L1247), saat navbar aktif, thread tidur `25ms` (40 wake-up/detik) dan di setiap tick memanggil `GetForegroundWindow()`, `GetCursorPos()`, serta `is_snipping_shortcut_or_overlay_active()` (baris 1247) sebanyak **40 kali/detik**.
    4. **Loop Acrylic Worker (`~22,2 Hz` / tiap `45ms`):** Di [backdrop_blur.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/backdrop_blur.rs#L635-L643), thread bangun tiap `45ms` saat idle.
  - **Biaya `is_snipping_shortcut_or_overlay_active()` (~90 panggilan/detik, ratusan syscall Win32/detik):** Di [navbar_window.rs](file:///d:/kerjaan/projek-ndiri/island/src-tauri/src/navbar_window.rs#L452-L485), fungsi ini dipanggil gabungan **90 kali/detik** (50 Hz dari `lib.rs:5046` + 40 Hz dari `navbar_window.rs:1247`; catatan: angka ~180+/detik pada judul mengasumsikan jumlah syscall di dalamnya, sedangkan jumlah pemanggilan fungsi itu sendiri adalah 90 kali/detik). Pada setiap pemanggilan ketika ada jendela foreground, fungsi ini menjalankan 4x `GetAsyncKeyState`, `GetForegroundWindow`, `GetClassNameW`, `GetWindowThreadProcessId`, lalu `query_process_image(pid)` yang memanggil `OpenProcess`, `QueryFullProcessImageNameW`, dan `CloseHandle` sebanyak 90 kali setiap detik tanpa memeriksa apakah HWND foreground berubah.
  - Kalkulasi frekuensi gabungan bersama loop 100ms di `lib.rs:5365` terbukti menghasilkan ~174,46 wake-up/detik saat desktop idle (`tests/bug-hunt/T13_verify.mjs`).
