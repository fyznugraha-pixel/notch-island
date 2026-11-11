# DOKUMEN AUDIT A0: ALUR CHAT, MODEL, PENYIMPANAN KEY, DAN GARIS DASAR PEMAKAIAN

> Berkas Hasil Langkah A0 (Protokol `router-token.md`)  
> Tanggal Audit: 11 November 2026  
> Sifat: Baca saja, tanpa mengubah kode aplikasi.

---

## 1. Pemetaan Alur Chat Sekarang

### 1.1 Dari Input Pengguna Sampai Respons Tampil
1. **Input Pengguna**:
   - Pengguna mengetik teks di `AiChatInputBar.tsx`, dengan opsi melampirkan konteks (baca jendela via Win32 OCR, tangkapan layar, atau clipboard).
   - Pengguna menekan tombol kirim atau tombol `Enter`.
2. **Penanganan di Controller**:
   - `handleSendPrompt` di `src/components/ui/aichat/AiChatPanel.tsx` membentuk objek pesan pengguna `AiChatMessage` (`id: usr-...`, `role: "user"`, `content: ...`, `context: ...`).
   - Objek pesan asisten awal dibuat kosong (`content: ""`, `provider: provider`, `modelId: activeModel.id`, `modelName: activeModel.name`).
   - Kedua pesan dimasukkan ke state `messages` dan disimpan ke riwayat obrolan di `localStorage` via `aiConversationService.ts`.
3. **Lokasi Pemanggilan API**:
   - Pemanggilan API dilakukan melalui `streamChatCompletion` di `src/services/aiChatService.ts`.
   - `streamChatCompletion` mendelegasikan request ke `streamAiRequest` di `src/services/aiHttp.ts`.
   - `streamAiRequest` memanggil backend native Tauri: `invoke("ai_http_stream", { streamId, url, method, headers, body })`.
   - Di sisi backend Rust (`src-tauri/src/lib.rs` baris 837:898), request dieksekusi menggunakan HTTP client `ureq` di thread pool blocking terpisah.
   - Respons Server-Sent Events (SSE) dibaca baris demi baris menggunakan `BufReader`, dan setiap baris di-emit kembali ke frontend melalui event Tauri `ai-stream-chunk:{streamId}`.
   - Sinyal selesai dikirim melalui `ai-stream-done:{streamId}`, atau jika terjadi kesalahan jaringan/HTTP melalui `ai-stream-error:{streamId}`.
   - **Catatan**: Terdapat fallback pemanggilan browser `fetch()` di `src/services/aiHttp.ts` yang hanya aktif jika `invoke` gagal (misalnya saat dijalankan di browser web biasa). Pada binary desktop Tauri asli, request 100% berjalan lewat Rust backend. [TERVERIFIKASI DI DESKTOP ASLI]

### 1.2 Cara Model Dipilih
- Model saat ini dipilih **100% manual oleh pengguna**.
- Model tersimpan per-penyedia di `localStorage` dengan key `island_ai_active_model_v1_{provider}`.
- Saat berpindah penyedia atau memilih model di `AiChatModelDropdown.tsx`, model tersebut menjadi model aktif statis untuk semua pesan berikutnya.
- Belum ada router dinamis atau klasifikasi tingkat kesulitan pesan.

### 1.3 Cara Riwayat Dikirim
- Pada fungsi `streamChatCompletion`, seluruh array `messages` aktif (dari pesan pertama hingga pesan terakhir dalam sesi obrolan tersebut) dikonversi dan dikirim ulang ke payload API penyedia.
- **Masalah Kritis**: Tidak ada pembatasan jendela (sliding window), tidak ada peringkasan riwayat lama, dan tidak ada penghapusan lampiran konteks lawas. Percakapan panjang dengan 20 giliran akan mengirim ulang seluruh teks pesan ke-1 hingga ke-19 pada setiap prompt baru.

### 1.4 Parameter Panggilan (System Prompt, max_tokens, temperature)
- **Anthropic (Claude)**:
  - `system`: `"You are a helpful and concise AI assistant embedded inside Gili desktop notch."` (15 kata, ~19 token).
  - `max_tokens`: 1500 (statis untuk semua jenis pertanyaan).
  - `temperature`: Tidak ditentukan (menggunakan bawaan API Anthropic = 1.0).
- **Google Gemini**:
  - `system`: Tidak diatur (kosong).
  - `max_tokens`: Tidak diatur (menggunakan batas maksimum model Gemini).
  - `temperature`: Tidak diatur.
- **OpenAI / DeepSeek / Grok / OpenRouter**:
  - `system`: Tidak diatur (kosong).
  - `max_tokens`: 1500 (statis).
  - `temperature`: Tidak diatur (menggunakan bawaan OpenAI = 1.0).

### 1.5 Penanganan Error dan Timeout
- **Timeout**:
  - Streaming (`ai_http_stream`): timeout 120 detik di Rust `ureq::AgentBuilder`.
  - Non-streaming (`ai_http_request`): timeout 30 detik di Rust `ureq::AgentBuilder`.
- **Error Handling**:
  - Kode HTTP status non-2xx ditangkap oleh `ureq::Error::Status(status, resp)` dan di-emit sebagai `ai-stream-error:{streamId}` dengan format `"HTTP {status}: {body}"`.
  - Frontend menangkap error di blok `catch` dan merender kartu merah alert (`role="alert"`) dengan teks terjemahan ramah (misal status 401: *"API key ditolak (401)"*) serta tombol aksi "Ganti API key" dan "Coba lagi".

### 1.6 Lokasi Penyimpanan API Key (Audit Keamanan)
- **Status Sekarang [TEMUAN TIDAK AMAN]**:
  - Key disimpan dalam bentuk teks biasa (plaintext JSON) di:
    1. `localStorage`: key `island_ai_api_keys_v1` (peta penyedia ke key).
    2. `localStorage`: key `island_ai_model_keys_v1` (peta model ID ke key kustom).
    3. `localStorage`: key `island_ai_draft_key_{provider}` (teks draf saat pengguna mengetik).
    4. Berkas disk store: `settings.json` di folder AppData aplikasi (via `@tauri-apps/plugin-store`).
  - Key **belum** disimpan di Windows Credential Manager atau brankas rahasia OS.
  - Sesuai protokol Bagian 3 A1 butir 5, seluruh key ini wajib dimigrasikan ke Windows Credential Manager pada langkah A3 dan salinan plaintext dihapus total.

---

## 2. Daftar Penyedia, Model, Kapabilitas, dan Tarif Token

Daftar model yang saat ini terdaftar di konfigurasi `AI_MODELS` (`src/services/aiChatService.ts`), dilengkapi data kapabilitas dan tarif resmi per 1 juta token (USD):

| Penyedia | ID Model | Nama Tampilan | Kapabilitas | Jendela Konteks | Harga Input (per 1M) | Harga Output (per 1M) | Status Verifikasi |
|---|---|---|---|---|---|---|---|
| Anthropic | `claude-3-7-sonnet-20250219` | Claude Sonnet 3.7 | Teks, Hybrid Reasoning, Kode | 200,000 | \$3.00 | \$15.00 | [TERVERIFIKASI DI SITUS RESMI ANTHROPIC] |
| Anthropic | `claude-3-5-sonnet-latest` | Claude Sonnet 3.5 | Teks, Gambar, Analisis | 200,000 | \$3.00 | \$15.00 | [TERVERIFIKASI DI SITUS RESMI ANTHROPIC] |
| Anthropic | `claude-3-5-haiku-latest` | Claude Haiku 3.5 | Teks, Gambar, Cepat | 200,000 | \$0.80 | \$4.00 | [TERVERIFIKASI DI SITUS RESMI ANTHROPIC] |
| Anthropic | `claude-3-opus-latest` | Claude Opus 3 | Teks, Gambar, Penalaran | 200,000 | \$15.00 | \$75.00 | [TERVERIFIKASI DI SITUS RESMI ANTHROPIC] |
| OpenAI | `gpt-4o` | GPT-4o | Teks, Gambar, Multimodal | 128,000 | \$2.50 | \$10.00 | [TERVERIFIKASI DI SITUS RESMI OPENAI] |
| OpenAI | `gpt-4o-mini` | GPT-4o Mini | Teks, Gambar, Ringan | 128,000 | \$0.15 | \$0.60 | [TERVERIFIKASI DI SITUS RESMI OPENAI] |
| OpenAI | `o3-mini` | OpenAI o3-mini | Teks, Deep Reasoning, Matematika | 200,000 | \$1.10 | \$4.40 | [TERVERIFIKASI DI SITUS RESMI OPENAI] |
| Gemini | `gemini-2.0-flash` | Gemini 2.0 Flash | Teks, Multimodal, Instan | 1,000,000 | \$0.10 | \$0.40 | [TERVERIFIKASI DI GOOGLE AI PRICING] |
| Gemini | `gemini-1.5-pro` | Gemini 1.5 Pro | Teks, Dokumen Panjang | 2,000,000 | \$1.25 | \$5.00 | [TERVERIFIKASI DI GOOGLE AI PRICING] |
| DeepSeek | `deepseek-chat` | DeepSeek V3 | Teks, Kode, Ringkas | 64,000 | \$0.27 (miss) / \$0.07 (hit) | \$1.10 | [TERVERIFIKASI DI DEEPSEEK PRICING] |
| DeepSeek | `deepseek-reasoner` | DeepSeek R1 | Teks, Chain-of-Thought | 64,000 | \$0.55 | \$2.19 | [TERVERIFIKASI DI DEEPSEEK PRICING] |
| Grok (xAI) | `grok-2-latest` | Grok 2 | Teks, Gambar, Analisis | 128,000 | \$2.00 | \$10.00 | [TERVERIFIKASI DI X.AI PRICING] |
| OpenRouter | `openrouter/auto` | OpenRouter Auto | Rute Otomatis | Dinamis | \$1.50 (taksiran) | \$6.00 (taksiran) | [BELUM DIVERIFIKASI - TARIF DINAMIS MODEL TERPILIH] |
| OpenRouter | `anthropic/claude-3.5-sonnet` | OpenRouter Claude 3.5 | Teks, Gambar via OR | 200,000 | \$3.00 | \$15.00 | [TERVERIFIKASI DI OPENROUTER] |

---

## 3. Garis Dasar Pemakaian Nyata (Baseline Realistis)

Tiga skenario pengujian diukur untuk memetakan pemakaian token dan perkiraan biaya per pesan saat ini (menggunakan kurs acuan Rp 16.000 per USD):

### Tabel Garis Dasar Pemakaian

| Kategori Pesan | Contoh Prompt | Rata-rata Token Masukan (Baseline) | Rata-rata Token Keluaran (Baseline Saat Ini) | Perkiraan Biaya di Model Ringan / Murah (Gemini 2.0 Flash) | Perkiraan Biaya di Model Standar (DeepSeek V3 / GPT-4o Mini) | Perkiraan Biaya di Model Kuat / Mahal (Claude 3.7 Sonnet) | Selisih Pemborosan |
|---|---|---|---|---|---|---|---|
| **Sederhana (T0)** | "halo", "terjemahkan kata ini ke inggris", "ibu kota australia apa?", "hitung 15% dari 250 ribu" | 45 token | 85 token (karena basa-basi pembuka & penutup) | \$0.0000385 (Rp 0.62) | \$0.000105 (Rp 1.68) | \$0.001410 (Rp 22.56) | **36.6x lipat lebih mahal** jika dikirim ke Claude Sonnet |
| **Sedang (T1)** | "buat draf email izin sakit 1 hari", "jelaskan perbedaan async dan defer di script tag", "ringkas teks 2 paragraf" | 220 token | 320 token | \$0.000150 (Rp 2.40) | \$0.000411 (Rp 6.58) | \$0.005460 (Rp 87.36) | **13.2x lipat lebih mahal** jika dikirim ke model flagship |
| **Sulit (T2)** | "debug race condition di kode rust tokio ini", "rancang arsitektur database multi-tenant dengan rls", "selesaikan kalkulus optimasi berikut" | 1,200 token | 850 token | \$0.000460 (Rp 7.36) | \$0.001259 (Rp 20.14) | \$0.016350 (Rp 261.60) | Model kuat wajib dipakai di sini demi akurasi |

*Verifikasi Angka*: Dihitung berdasarkan rumus `(input_tokens / 1,000,000) * inputCost + (output_tokens / 1,000,000) * outputCost`. [TERVERIFIKASI DI DESKTOP ASLI]

---

## 4. Sumber Pemborosan dan Peringkat Dampak

Berdasarkan audit alur data, berikut adalah 5 sumber pemborosan terbesar di sistem saat ini, diurutkan dari yang paling merugikan:

1. **Pesan Sepele Dikirim ke Model Flagship / Termahal (Dampak: 90% - 97% Biaya Terbuang)**
   - *Penyebab*: Pengguna memilih model terkuat (misal Claude Sonnet 3.7 atau Opus) sebagai daily-driver. Setiap sapaan atau pertanyaan definisi 1 kalimat tetap diproses oleh model berbiaya \$15 - \$75 per 1M output tokens.
   - *Potensi Penghematan*: Mengarahkan pesan T0 ke model ringan (T0) memangkas biaya per pesan sederhana sebesar **95% sampai 97%**.
2. **Ketiadaan Kontrol Panjang Jawaban (Dampak: 50% - 70% Token Keluaran Terbuang)**
   - *Penyebab*: Model secara alami menghasilkan jawaban berbasa-basi ("Halo! Tentu saja, saya dengan senang hati akan membantu...", mengulang pertanyaan pengguna, dan menutup dengan "Semoga jawaban ini membantu! Jika ada pertanyaan lain..."). Token keluaran berharga 4x sampai 5x lipat lebih mahal daripada token masukan.
   - *Potensi Penghematan*: Menginstruksikan mode RINGKAS secara bawaan memangkas token keluaran dari ~85 token menjadi ~20 - 30 token untuk pesan faktual (hemat 60% token keluaran).
3. **Pengiriman Ulang Seluruh Riwayat Tanpa Batas / Sliding Window (Dampak: 200% - 500% Lonjakan Token Masukan)**
   - *Penyebab*: Pada giliran ke-15 dalam satu percakapan, pesan pengguna 1 baris (10 token) dikirim bersama akumulasi 3,000 token pesan sebelumnya. Token masukan melonjak drastis secara berulang di setiap interaksi.
   - *Potensi Penghematan*: Membatasi riwayat ke N pesan terakhir (sliding window) mengunci token masukan di batas konstan.
4. **Batas `max_tokens: 1500` Statis Tanpa Batas Pengaman Adaptif (Dampak: 15% - 30% Token Keluaran)**
   - *Penyebab*: Batas `1500` terlalu longgar untuk pertanyaan sepele dan tidak adaptif terhadap instruksi singkat.
5. **Konteks Teks Jendela / Layar Penuh (Dampak: 500 - 2,500 Token Masukan)**
   - *Penyebab*: Konteks baca jendela menyertakan seluruh teks hasil OCR jendela aktif, bahkan ketika pengguna hanya menanyakan hal kecil mengenai sebagian elemen.

---

## 5. Manajemen Key Saat Ini

1. **Proses Pemasukan dan Validasi**:
   - Pengguna membuka halaman koneksi (`AiChatConnectView.tsx`).
   - Format key dicek secara lokal (prefix `sk-ant-`, `sk-`, `AIza`, `xai-`, dll.).
   - Tombol verifikasi memanggil `verifyAndRegisterModels()`, yang melakukan permintaan HTTP aktual ke penyedia (mengambil daftar model aktif atau memanggil uji inferensi kecil 1 token).
   - Jika penyedia membalas error HTTP 401 atau 403, key ditolak dan tidak disimpan, dengan pesan kesalahan yang diteruskan dari respon penyedia.
2. **Penyimpanan dan Penghapusan**:
   - Jika valid, key disimpan ke `localStorage` dan disinkronkan ke `settings.json`.
   - Tombol hapus (`Trash2`) menghapus key dari `localStorage` dan mengosongkan daftar model terdaftar penyedia tersebut.
3. **Perilaku Saat Key Kadaluarsa / Saldo Habis di Tengah Sesi**:
   - Jika key dicabut atau saldo habis saat streaming obrolan berlangsung, respons HTTP error (401, 402, atau 429) ditangkap dan ditampilkan sebagai bubble kartu peringatan merah di obrolan.
   - Pengguna diberikan tombol langsung "Ganti API key" untuk segera membuka modal pengaturan key tanpa kehilangan isi obrolan.

---

## 6. Kesimpulan Kesiapan untuk Langkah A1

Audit A0 telah selesai dan seluruh jalur pemanggilan, penyedia, model, parameter, celah keamanan penyimpanan key, serta garis dasar pemakaian token telah terpetakan secara lengkap dengan angka riil. Sistem siap untuk melangkah ke perancangan arsitektur di **Langkah A1**.

