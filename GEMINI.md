# ATURAN KETAT PENGEMBANGAN GILI (PROJECT RULES)

> **PERINGATAN SISTEM WAJIB**: Aturan ini mengikat secara absolut dalam setiap instruksi, eksekusi kode, maupun aksi git di repository ini.

---

## 1. DILARANG KERAS MENGHAPUS / MENONAKTIFKAN FITUR TANPA IZIN EKSPLISIT
- **Tidak boleh menghapus, membuang, meng-comment-out, atau menyembunyikan** fitur, opsi pengaturan, komponen UI, atau logic yang sudah ada sebelumnya.
- Jika menemukan fitur yang dirasa redundant, berpotensi konflik, atau perlu penyesuaian: **WAJIB BERTANYA dan meminta izin user terlebih dahulu secara eksplisit**, dilarang mengambil inisiatif sendiri untuk menghilangkannya.
- Semua sub-fitur atau opsi sekunder (seperti segmented control, trigger mode, filter, dll) harus tetap dipertahankan dan terhubung (wired up) secara utuh.

---

## 2. DILARANG BERTINDAK SENDIRI (NO UNILATERAL ACTION)
- **Git Push & Git Tag**: DILARANG melakukan `git push` atau `git tag` kecuali jika ada instruksi tertulis yang sangat jelas dan eksplisit dari user ("push", "git tag push", dll).
- **Kata ambigu**: Jangan pernah mengasumsikan kata-kata seperti "lanjut", "lnjut", "oke", atau "next" sebagai perintah untuk melakukan `git push` atau modifikasi di luar scope yang diminta.
- **Konfirmasi sebelum eksekusi**: Setiap perubahan besar pada arsitektur, flow aplikasi, atau behaviour default wajib dikonfirmasikan ke user terlebih dahulu.

---

## 3. INTEGRITAS KODE & STANDAR ANTI-SLOP
- Patuhi seluruh standar di `ANTIGRAVITY.md`:
  - **Modular > Monolith**: Pisahkan UI, hooks/services, dan types.
  - **Human-readable code**: Hindari AI-slop, komentar berlebihan, dan over-abstraction.
  - **Konsistensi Codebase**: Ikuti konvensi penamaan dan pattern yang sudah ada di repository.

