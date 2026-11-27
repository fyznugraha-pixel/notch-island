import React, { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp, Repeat, ScanText, Maximize2, Bug, Zap, MessageSquare, CheckSquare, SlidersHorizontal, Music, Eye, Cpu, LayoutGrid, Monitor, Smartphone, Palette, Layers, Minimize2, Smile, Bell, FolderDown, Gamepad2, MousePointerClick, Moon, MapPin, BellOff, AppWindow, Bot, BarChart2, Volume2, ShieldCheck, History } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Language } from "../../services/i18n";

interface ChangelogEntry {
  version: string;
  date: string;
  highlights: {
    icon: React.ReactNode;
    titleId: string;
    titleEn: string;
    descId: string;
    descEn: string;
    badge?: "new" | "fix" | "improve";
  }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "5.2.3",
    date: "27 Nov 2026",
    highlights: [
      {
        icon: <Bell size={14} />,
        titleId: "Perbaikan Lonjakan Disk I/O Notifikasi Windows (wpndatabase.db-wal)",
        titleEn: "Zero-Idle-I/O Windows Notification Watcher (wpndatabase.db-wal)",
        descId: "Mengganti polling notifikasi Windows setiap 1 detik menjadi pemantau berbasis event (NotificationChanged + GetNotification) dengan fallback pasif sehingga penulisan disk ke wpndatabase.db-wal saat idle turun ke nol dan melindungi usia SSD.",
        descEn: "Replaces the 1-second Windows notification polling loop with an event-driven watcher (NotificationChanged + GetNotification) and passive fallback, eliminating idle wpndatabase.db-wal disk writes to protect SSD health.",
        badge: "fix",
      },
      {
        icon: <MessageSquare size={14} />,
        titleId: "Widget Sticky Note Kertas Native dengan Ketik Langsung & Multi-Catatan",
        titleEn: "Native Paper Sticky Note Widget with Direct In-Paper Typing & Multi-Note",
        descId: "Menambahkan widget Sticky Note kertas native Direct2D dengan ketik judul dan isi langsung di dalam kertas tanpa jendela tambahan, tombol cepat + untuk membuat banyak catatan, ukuran persegi proporsional (S / M / L), pilihan warna bebas dengan kontras tinta otomatis, serta gaya tempelan Selotip (default), Sudut Lipat, dan Pin.",
        descEn: "Adds a native Direct2D Paper Sticky Note widget supporting direct in-paper title and body typing without extra popup windows, a quick + button for spawning multiple notes, proportional square S / M / L sizing, free custom paper colors with automatic ink contrast, and Tape (default), Curled, and Pin attachment styles.",
        badge: "new",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Dukungan Multi-Monitor Widget Desktop & Sakelar Satuan Suhu (°C / °F)",
        titleEn: "Multi-Monitor Desktop Widgets & Global Temperature Unit Switch (°C / °F)",
        descId: "Mendukung pemilihan dan pemindahan widget desktop lintas monitor serta menambahkan pengaturan satuan suhu global Celcius (°C) / Fahrenheit (°F) yang tersinkron di Notch, Taskbar, StandBy, Monitor Sistem, dan Widget Desktop.",
        descEn: "Supports placing and moving desktop widgets across multiple monitors and introduces a global Celsius (°C) / Fahrenheit (°F) temperature unit toggle synchronized across Notch, Taskbar, StandBy, System Monitor, and Desktop Widgets.",
        badge: "new",
      },
      {
        icon: <ShieldCheck size={14} />,
        titleId: "Pemisahan Pembaruan Microsoft Store (MSIX) & Pengamanan Lisensi",
        titleEn: "Microsoft Store (MSIX) Update Isolation & License Hardening",
        descId: "Menonaktifkan auto-updater NSIS GitHub pada instalasi Microsoft Store agar pembaruan diarahkan langsung ke Microsoft Store serta mengamankan fallback pengecekan lisensi Gili Pro agar tidak pernah membuka akses secara keliru.",
        descEn: "Disables the GitHub NSIS self-updater on Microsoft Store MSIX installs so updates route exclusively through Microsoft Store, and hardens Gili Pro license IPC fallback handling to fail closed.",
        badge: "fix",
      },
    ],
  },
  {
    version: "5.2.2",
    date: "26 Nov 2026",
    highlights: [
      {
        icon: <Cpu size={14} />,
        titleId: "Optimasi CPU StandBy Media & Lirik serta Perataan Kontrol",
        titleEn: "StandBy Media & Lyrics CPU Optimization and Centered Controls",
        descId: "Menghilangkan lonjakan CPU pada layar StandBy Media dengan menghapus fallback blur CSS layar penuh saat cover art terkena CORS, mengganti loop rAF lirik per-kata menjadi timer ringan mode hemat daya, mememoisasi baris lirik non-aktif, mengubah progress bar ke GPU scaleX, menonaktifkan blur permanen HUD Auto-Idle, serta menengahkan tombol Prev, Play/Pause, dan Next.",
        descEn: "Eliminates intermittent CPU spikes on StandBy Media by removing the live fullscreen CSS blur fallback on CORS-blocked artwork, replacing the word-by-word rAF loop with a low-power interval timer, memoizing inactive lyric rows, switching the progress bar to GPU scaleX, disabling persistent Auto-Idle HUD blur, and centering transport controls.",
        badge: "fix",
      },
      {
        icon: <Volume2 size={14} />,
        titleId: "Volume Mixer dengan Ikon Aplikasi, Nama Bersih & Anti-Duplikat",
        titleEn: "Volume Mixer App Icons, Clean Names & Deduplication",
        descId: "Menggabungkan sesi audio duplikat dari beberapa PID per aplikasi, menyaring sesi yang sudah berakhir, menampilkan nama aplikasi bersih tanpa akhiran .exe, dan menambahkan ikon aplikasi asli di seluruh panel Volume Mixer (Taskbar, Flyout, dan Notch).",
        descEn: "Merges duplicate multi-PID audio sessions per app, filters out expired sessions, formats clean app names without .exe suffixes, and displays native app icons across all Volume Mixer panels (Taskbar, Flyout, and Notch).",
        badge: "improve",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Mempertahankan Auto-Hide Taskbar Windows Saat Gili Taskbar Dimatikan",
        titleEn: "Preserve Windows Taskbar Auto-Hide When Disabling Gili Taskbar",
        descId: "Memperbaiki bug di mana pengaturan Auto-Hide taskbar bawaan Windows ikut mati ketika Gili Taskbar dinonaktifkan, sehingga preferensi auto-hide pengguna tetap terjaga saat kembali ke taskbar Windows.",
        descEn: "Fixes a bug where Windows' native taskbar Auto-Hide setting was turned off when disabling Gili Taskbar, ensuring the user's original Auto-Hide preference is preserved upon restore.",
        badge: "fix",
      },
      {
        icon: <ShieldCheck size={14} />,
        titleId: "Peningkatan Alur Checkout & Panduan Pembayaran Gili Pro",
        titleEn: "Improved Gili Pro Checkout Flow & Payment Guidance",
        descId: "Memperjelas panduan metode pembayaran langsung Microsoft Store dan penukaran kode redeem pada banner Gili Pro serta meningkatkan keandalan fokus jendela dan penanganan error saat memproses pembelian.",
        descEn: "Clarifies Microsoft Store direct purchase and redeem code guidance in the Gili Pro banner while hardening Store checkout window focus and error handling.",
        badge: "improve",
      },
    ],
  },
  {
    version: "5.2.1",
    date: "22 Nov 2026",
    highlights: [
      {
        icon: <Cpu size={14} />,
        titleId: "Optimasi CPU WebView2 & Hemat Daya Mode StandBy",
        titleEn: "StandBy Mode WebView2 CPU & Overnight Power Optimization",
        descId: "Memperbaiki lonjakan pemakaian CPU WebView2 (~25%) dan kenaikan suhu saat mode StandBy aktif atau idle semalaman dengan mengganti loop rAF 60-144Hz dan drop-shadow SVG Jam Analog menjadi dial statis ter-memoisasi, melepas WS_EX_LAYERED setelah animasi masuk selesai, menghapus filter CSS layar penuh saat layar diredupkan, memanggang blur backdrop Media sekali per lagu, serta menjeda poller latar belakang Taskbar dan Notch saat Deep Eco aktif.",
        descEn: "Fixes sustained WebView2 CPU spikes (~25%) and heat buildup while StandBy mode runs idle overnight by replacing the 60-144Hz Analog Clock rAF loop and SVG drop-shadow with a memoized static dial and 1Hz hand, clearing WS_EX_LAYERED after fade-in completes, removing fullscreen dim CSS filters, pre-blurring Media backdrops once per track, and pausing background Taskbar and Notch pollers during Deep Eco.",
        badge: "fix",
      },
      {
        icon: <BarChart2 size={14} />,
        titleId: "Audio Visualizer Taskbar Realtime via WASAPI Loopback",
        titleEn: "Realtime Taskbar Audio Visualizer via WASAPI Loopback",
        descId: "Menggerakkan modul Audio Visualizer di Gili Taskbar dengan spektrum FFT realtime dari WASAPI loopback sehingga batang equalizer langsung merespons audio sistem yang sedang diputar.",
        descEn: "Drives the Gili Taskbar Audio Visualizer module with realtime WASAPI loopback FFT spectrum bands so equalizer bars react live to active system audio.",
        badge: "improve",
      },
      {
        icon: <LayoutGrid size={14} />,
        titleId: "Perbaikan Skala Teks Windows & Batas Widget Frameless",
        titleEn: "Windows Text-Scale Clipping Fix & Tighter Frameless Widget Bounds",
        descId: "Memperbaiki teks yang terpotong ketika pengaturan Windows Text Scale diperbesar serta merapikan batas tampilan widget desktop mode frameless agar tetap proporsional di berbagai DPI.",
        descEn: "Fixes clipped text under elevated Windows Text Scale settings and tightens frameless desktop widget bounds for clean proportions across DPI configurations.",
        badge: "fix",
      },
    ],
  },
  {
    version: "5.2.0",
    date: "21 Nov 2026",
    highlights: [
      {
        icon: <LayoutGrid size={14} />,
        titleId: "34 Widget Desktop Native Direct2D",
        titleEn: "34 Native Direct2D Desktop Widgets",
        descId: "Widget desktop native dengan rendering Direct2D langsung di wallpaper: jam 8 gaya, kalender & sinkron iCal (Google/Outlook/iCloud), cuaca & AQI, kurs mata uang + spot emas publik, performa CPU/RAM/GPU, proses teratas, audio visualizer WASAPI, Now Playing & lirik, Polaroid berbasis folder, jadwal sholat, dan Mini Note tersinkron dengan Notch.",
        descEn: "Native Direct2D widgets rendered directly on the Windows desktop: 8-style clocks, calendar with read-only iCal sync (Google/Outlook/iCloud), weather & AQI, currency and public spot gold rates, CPU/RAM/GPU performance, top processes, WASAPI audio visualizer, Now Playing lyrics, folder-based Polaroid frame, prayer times, and Mini Note synced with the Notch.",
        badge: "new",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Mode StandBy Layar Penuh untuk PC",
        titleEn: "Full-Screen StandBy Mode for Windows",
        descId: "Mengubah layar Windows saat idle atau charging menjadi tampilan jam dan dashboard widget layar penuh dengan pilihan tema jam, perlindungan burn-in, dan bundling dalam paket Gili Pro bersama Taskbar dan Widget Desktop.",
        descEn: "Turns an idle or charging Windows display into a full-screen desk clock and widget view with clock styles, burn-in pixel shift, and bundled access in Gili Pro alongside Taskbar and Desktop Widgets.",
        badge: "new",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Anti-Tumpuk Widget, Routing Klik Cerdas & Pratinjau Aktif",
        titleEn: "Anti-Overlap Collision Resolver, Smart Click Routing & Live Previews",
        descId: "Mencegah widget saling menindih saat digeser, diubah ukuran, atau ditambah; mengarahkan klik widget berbasis input langsung ke bagian pengaturan terkait, menutup Notch saat klik di luar setelah dibuka dari widget, serta menampilkan pratinjau visual langsung di daftar Widget Aktif.",
        descEn: "Prevents desktop widgets from overlapping when dragged, resized, or added; routes data-driven widget clicks directly to their matching settings section, restores click-outside Notch dismissal after widget triggers, and shows visual thumbnails in the Active Widgets list.",
        badge: "improve",
      },
      {
        icon: <Cpu size={14} />,
        titleId: "Optimasi CPU & GPU Direct2D (Per-Slot Cache & Audio Fast Path)",
        titleEn: "Direct2D CPU & GPU Optimization (Per-Slot Cache & Audio Fast Path)",
        descId: "Menambahkan cache bitmap GPU per slot untuk widget statis, hashing scene tanpa alokasi, fast path audio 64-byte pada 30 FPS adaptif, serta memangkas polling WinRT, disk, dan NVML agar pemakaian CPU dan RAM tetap rendah saat banyak widget aktif.",
        descEn: "Adds per-slot GPU offscreen bitmap caching for static widgets, zero-allocation scene hashing, a 64-byte audio fast path at adaptive 30 FPS, and throttled WinRT, disk, and NVML polling to keep CPU and memory low with multiple active widgets.",
        badge: "improve",
      },
    ],
  },
  {
    version: "5.1.2",
    date: "19 Nov 2026",
    highlights: [
      {
        icon: <Palette size={14} />,
        titleId: "Bagikan & Impor Style Taskbar + Susunan Modul",
        titleEn: "Share & Import Taskbar Styles + Optional Module Layout",
        descId: "Bagikan tampilan Gili Taskbar lewat kode ringkas GILI-STYLE1 atau file .gilistyle (bentuk, ukuran, warna, transparansi, efek visual, tema ikon, serta opsi menyertakan susunan modul) tanpa mengubah posisi layar atau setting sistem penerima.",
        descEn: "Share Gili Taskbar looks via compact GILI-STYLE1 codes or .gilistyle files (shape, sizing, colors, translucency, visual effects, icon theme, and optional module layout checkbox) while keeping the recipient's monitor and system settings untouched.",
        badge: "new",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Interaksi Notch Lebih Halus, Buka Ulang Instan & Tab Pre-Warming",
        titleEn: "Smoother Notch Interactions, Instant Re-Open & Tab Pre-Warming",
        descId: "Menghilangkan jeda blokir saat klik ulang setelah menutup Notch, mengganti transisi tab agar masuk serentak tanpa menunggu animasi keluar, memangkas overhead sync DWM Acrylic dan tekstur frosted grain di NotchSurface, serta memulihkan budget GPU dan shader cache WebView2.",
        descEn: "Removes re-open blocking on explicit clicks after collapsing the Notch, switches tab transitions to parallel cross-slide without blocking delays, throttles NotchSurface DWM Acrylic IPC and caches frosted grain noise, and restores native WebView2 GPU memory and shader caching.",
        badge: "improve",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Preservasi Taskbar Show Desktop, Topologi Multi-Monitor & Audit Keamanan",
        titleEn: "Show Desktop Dock Preservation, Multi-Monitor Topology & Security Hardening",
        descId: "Menjaga Gili Taskbar tetap terlihat saat Win+D, sinkronisasi otomatis saat monitor dipasang atau dilepas, memangkas footprint memori WebView2 saat idle, reset otomatis tab Notch setelah 5 menit, serta perbaikan stabilitas di Shelf, SMTC media, hotkey, dan System Tray.",
        descEn: "Preserves Gili Taskbar visibility during Win+D Show Desktop, dynamically reconciles monitor attach/detach topology, reduces idle WebView2 memory footprint, resets Notch tab focus after 5 minutes idle, and hardens Shelf transfers, SMTC media sizing, hotkeys, and System Tray handling.",
        badge: "fix",
      },
      {
        icon: <ShieldCheck size={14} />,
        titleId: "Pemulihan Taskbar Windows saat Quit & End Task",
        titleEn: "Reliable Windows Taskbar Restore on Quit & End Task",
        descId: "Memperbaiki race condition saat keluar aplikasi maupun penghentian paksa (End Task) agar taskbar bawaan Windows langsung tampil kembali normal, membersihkan bit autohide dan layer transparan yang tertinggal, serta menjalankan watchdog terpisah lewat Explorer dengan recovery cadangan.",
        descEn: "Fixes exit and force-termination (End Task) race conditions so the native Windows taskbar reliably returns, clears lingering autohide and layered-window flags, and launches a decoupled Explorer-hosted watchdog with orphan recovery fallback.",
        badge: "fix",
      },
      {
        icon: <Cpu size={14} />,
        titleId: "Pembersihan Memori Awal & Idle Flyout Lebih Cepat (60 Detik)",
        titleEn: "Faster Startup Memory Trimming & 60s Idle Flyout Cleanup",
        descId: "Mempercepat pemangkasan working set memori WebView2 pertama menjadi 60 detik setelah startup (sebelumnya menunggu 5 menit / guard 90 detik) serta mempersingkat batas tunggu penghancuran window flyout Taskbar yang menganggur dari 90 detik menjadi 60 detik.",
        descEn: "Accelerates the initial WebView2 working-set trim to 60 seconds after startup (down from a 5-minute delay and 90-second guard) and reduces the idle destroy timeout for closed Taskbar flyout windows from 90 seconds to 60 seconds.",
        badge: "improve",
      },
      {
        icon: <SlidersHorizontal size={14} />,
        titleId: "Tombol Next AI Chat, Tombol Settings File Shelf & Label Modul Taskbar",
        titleEn: "AI Chat Next Button, File Shelf Settings Routing & Taskbar Module Filter",
        descId: "Menambahkan tombol Next di header Gili AI Chat untuk berpindah ke tab berikutnya, memperbaiki tombol Settings kanan atas pada tab File Shelf agar membuka Settings utama Gili (tidak ganda membuka Settings File Shelf), dan memperbaiki label kategori modul Taskbar dari 'Semua' menjadi 'All' pada mode bahasa Inggris.",
        descEn: "Adds a Next button to the Gili AI Chat header to advance to the next tab, fixes the top-right Settings button on the File Shelf tab to open global Gili Settings instead of duplicating File Shelf Settings, and updates the 'All' category filter label in the Taskbar module picker for English.",
        badge: "fix",
      },
    ],
  },
  {
    version: "5.1.1",
    date: "18 Nov 2026",
    highlights: [
      {
        icon: <Music size={14} />,
        titleId: "Studio Share Lyrics (Spotify & Apple Music)",
        titleEn: "Share Lyrics Card Studio (Spotify & Apple Music)",
        descId: "Bagikan 1 hingga 5 baris lirik dari Notch Lirik maupun Mini Player lewat jendela studio khusus. Tersedia gaya Spotify dan Apple Music dengan latar cover album buram atau unggah gambar kustom (opsi blur Mati/Halus/Kuat), rasio 1:1, 4:5, dan 9:16, Color Mood, warna font dengan pemilih Hex gelap mengarah ke atas, watermark Gili, salin atau simpan PNG, dan kirim ke HP lewat QR.",
        descEn: "Share 1 to 5 lyric lines from Notch Lyrics or Mini Player in a dedicated studio window. Includes Spotify and Apple Music card styles with blurred album art or custom uploaded backgrounds (Sharp/Soft/Deep blur), 1:1, 4:5, and 9:16 ratios, Color Mood palettes, font colors with a custom dark upward Hex picker, Gili watermark, Copy/Save PNG, and QR transfer to phone.",
        badge: "new",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Akses System Tray Windows 11 Asli & Tutup Aplikasi Tray",
        titleEn: "Native Windows 11 System Tray & Tray App Close Action",
        descId: "Flyout Tray Sistem kini membaca ikon tray Windows 11 secara langsung lengkap dengan klik kiri, klik kanan menu konteks, tombol cepat ke overflow Windows (^), dan deteksi proses elevated, ditambah tombol tutup aplikasi langsung dari daftar tray serta cache pembuka instan.",
        descEn: "System Tray flyout now surfaces native Windows 11 tray icons with left-click activation, right-click context menus, quick access to the Windows overflow menu (^), and elevated-process detection, plus a close button to quit tray apps directly and prewarmed cache for instant opening.",
        badge: "new",
      },
      {
        icon: <Bot size={14} />,
        titleId: "Streaming AI Latar Belakang & Dukungan Gemini Baru",
        titleEn: "Background AI Streaming & Updated Gemini Interactions API",
        descId: "Proses balasan AI Chat tetap berjalan dan tersimpan saat Notch mengecil atau kehilangan fokus, disertai indikator aktif di pill Notch serta opsi agar tab Media tidak otomatis menimpa tab terakhir saat musik diputar. Provider Gemini juga diperbarui mendukung Interactions API (dengan fallback generateContent) dan input ID model manual.",
        descEn: "AI Chat responses continue streaming and saving when the Notch collapses or loses focus, showing an active indicator on the collapsed Notch pill alongside a setting to keep your last active tab instead of auto-opening Media while music plays. Gemini provider now supports the Interactions API (with generateContent fallback) and manual model ID entry.",
        badge: "improve",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Perbaikan Autostart & Respons Startup / Flyout Taskbar",
        titleEn: "Autostart Sync & Faster Startup / Taskbar Flyout Opening",
        descId: "Menghapus flag pembatas WebView2 saat startup, memindahkan sinkronisasi autostart NSIS/MSIX dan perbaikan shortcut ke thread latar dengan jeda trim memori 90 detik, serta menunda tampilnya flyout Start, Search, Tray, dan Notifikasi sampai WebView siap agar muncul lebih cepat dan tidak langsung tertutup.",
        descEn: "Removes startup WebView2 throttling flags, moves NSIS/MSIX autostart sync and shortcut repair off the main thread with a 90-second memory trim grace period, and synchronizes Start, Search, Tray, and Notification flyout readiness so panels open faster without closing prematurely.",
        badge: "fix",
      },
      {
        icon: <Smartphone size={14} />,
        titleId: "Halaman Unduh QR LAN ke HP Lebih Cepat",
        titleEn: "Faster Mobile LAN QR Download Page",
        descId: "Menghapus muatan Google Fonts eksternal yang memblokir render pada server LAN lokal, memakai thumbnail JPEG 240px pada daftar pratinjau di HP sebelum tombol unduh penuh ditekan, membalas cepat /favicon.ico (204), serta menggunakan buffer stream 256 KB.",
        descEn: "Removes render-blocking external Google Fonts links from the local LAN server, serves lightweight 240px JPEG thumbnails for mobile list previews before full download, responds immediately to /favicon.ico (204), and streams files through a 256 KB buffer.",
        badge: "fix",
      },
      {
        icon: <Palette size={14} />,
        titleId: "Kontras Progress Bar Modul Media di Light Mode",
        titleEn: "Light Mode Progress Bar Contrast in Media Module",
        descId: "Menambahkan warna track dan gradien bar progres yang lebih kontras saat Taskbar menggunakan Light Mode agar indikator durasi lagu pada modul Media tetap terlihat jelas.",
        descEn: "Refines track background and gradient fill colors when the Taskbar uses Light Mode so the playback progress indicator remains clearly visible in the Media module.",
        badge: "fix",
      },
    ],
  },
  {
    version: "5.1.0",
    date: "17 Nov 2026",
    highlights: [
      {
        icon: <Palette size={14} />,
        titleId: "11 Tema Ikon Aplikasi Baru di Taskbar (Total 14 Gaya)",
        titleEn: "11 New Dock App Icon Themes (14 Styles Total)",
        descId: "Menambahkan 11 gaya visual baru untuk ikon aplikasi di Gili Taskbar: Liquid Glass, Monokrom, Accent Tinted, Sirkular, Retro Klasik, Neon Edge, Soft Clay, Wireframe, Pastel Aurora, Sticker Card, dan Kontras Tinggi — adaptif terhadap mode gelap/terang serta warna aksen.",
        descEn: "Adds 11 new visual icon themes for the Gili Taskbar dock: Liquid Glass, Monochrome, Accent Tinted, Circular, Retro Classic, Neon Edge, Soft Clay, Wireframe, Pastel Aurora, Sticker Card, and High Contrast — adapting cleanly to light/dark surfaces and accent colors.",
        badge: "new",
      },
      {
        icon: <SlidersHorizontal size={14} />,
        titleId: "Slider Terpisah: Tinggi Taskbar & Ukuran Ikon Aplikasi",
        titleEn: "Separate Controls: Taskbar Height & App Icon Size",
        descId: "Memisahkan slider Tinggi Taskbar (36–64px) dari Ukuran Ikon Aplikasi (24–56px) agar memperbesar ikon app tidak ikut membesarkan seluruh bar dan modul, dengan pembatasan proporsional agar ikon tetap rapi dan kalibrasi hitbox untuk bar tipis.",
        descEn: "Separates the Taskbar Height slider (36–64px) from App Icon Size (24–56px) so enlarging app icons no longer inflates the bar or modules, with proportional artwork bounds and accurate slim-bar hit-testing.",
        badge: "improve",
      },
      {
        icon: <LayoutGrid size={14} />,
        titleId: "Penyeragaman Tinggi 40+ Modul Taskbar & System Tray",
        titleEn: "Unified Height Constraints Across 40+ Taskbar Modules",
        descId: "Menyelaraskan ukuran tinggi seluruh 40+ modul taskbar (tampilan ringkas, pill penuh, maupun System Tray) agar selalu mengikuti ketebalan Taskbar dan tidak pernah meluber keluar dari bingkai bar.",
        descEn: "Aligns container heights across all 40+ taskbar modules (compact, full pill, and System Tray groups) to match the active Taskbar thickness and stay cleanly inside the dock bounds.",
        badge: "fix",
      },
      {
        icon: <MousePointerClick size={14} />,
        titleId: "Perbaikan Klik Layar Tengah & Bunyi Peringatan Windows",
        titleEn: "Center-Screen Click Block & Windows Alert Beep Fix",
        descId: "Memperbaiki state click-through dan flag jendela overlay/efek kaca Native Windows (WS_DISABLED, WS_EX_LAYERED & WS_EX_TRANSPARENT) agar tidak lagi menahan klik di layar atau memicu bunyi peringatan Windows saat Taskbar aktif.",
        descEn: "Fixes overlay click-through window flags and native backdrop surfaces (WS_DISABLED, WS_EX_LAYERED & WS_EX_TRANSPARENT) so invisible Gili windows never intercept clicks or trigger Windows alert beeps.",
        badge: "fix",
      },
      {
        icon: <Bell size={14} />,
        titleId: "Perbaikan Klik Notifikasi Explorer Documents & Shortcut Tray App",
        titleEn: "Notification Click & Tray-Closed App Launch Fixes (Telegram)",
        descId: "Mengaktifkan aplikasi notifikasi lewat COM IApplicationActivationManager dan fallback proses/protokol yang tepat agar klik notifikasi tidak lagi membuka folder Documents di Explorer, serta memperbaiki peluncuran aplikasi pinned (seperti Telegram Desktop) setelah ditutup ke System Tray maupun yang di-pin langsung dari Gili.",
        descEn: "Routes notification activation through COM IApplicationActivationManager and safe process/protocol fallbacks instead of falling back to the Explorer Documents folder, and fixes launching pinned or Store shortcuts (such as Telegram Desktop) after closing to the System Tray.",
        badge: "fix",
      },
      {
        icon: <Maximize2 size={14} />,
        titleId: "Efek Animasi Genie & Pilihan Mode Animasi Jendela",
        titleEn: "Genie Window Suction Animation & Selectable Animation Mode",
        descId: "Menambahkan efek animasi hisap bergaya macOS Genie yang mulus saat membuka dan menutup jendela aplikasi dari Taskbar, 40+ modul popover, serta flyout sistem, lengkap dengan opsi pemilihan mode Genie atau Normal di pengaturan Taskbar.",
        descEn: "Adds smooth macOS-style Genie suction animations when opening and minimizing app windows from the Taskbar, 40+ module popovers, and system flyouts, complete with a Genie or Normal animation mode selector in Taskbar settings.",
        badge: "new",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Dukungan Dual & Multi-Monitor Penuh pada Gili Taskbar",
        titleEn: "Full Dual & Multi-Monitor Support on Gili Taskbar",
        descId: "Menampilkan Gili Taskbar di semua monitor secara simultan saat mode Semua Monitor aktif dengan pengelolaan hit-test, auto-hide, blur latar belakang, dan penempatan flyout independen per layar, serta kalibrasi perpindahan antar-monitor beda DPI dan penyembunyian taskbar Windows selektif per monitor.",
        descEn: "Renders Gili Taskbar across all connected displays simultaneously in All Monitors mode with independent per-screen hit-testing, auto-hide, backdrop blur, and flyout anchoring, alongside cross-DPI monitor positioning and per-monitor Windows taskbar hiding.",
        badge: "fix",
      },
      {
        icon: <ScanText size={14} />,
        titleId: "Perbaikan Screenshot Window Snip (Win + Shift + S)",
        titleEn: "Windows Snipping Tool (Win + Shift + S) Window Snip Fix",
        descId: "Mencegah kanvas transparan Notch, Taskbar, Mini Player, dan layer efek kaca terdeteksi sebagai pembagi layar oleh Snipping Tool sehingga tangkapan layar mode jendela dapat langsung diklik utuh tanpa terbelah menjadi empat bagian.",
        descEn: "Prevents the transparent Notch, Taskbar, Mini Player, and glass underlay windows from intercepting Windows Snipping Tool window detection so full application windows can be snipped in a single click without splitting into four regions.",
        badge: "fix",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Tombol Hidden System Tray (^) di Gili Dock",
        titleEn: "Hidden System Tray Overflow (^) Button on Gili Dock",
        descId: "Menambahkan tombol panah tray tersembunyi di sebelah ikon sistem pada Gili Dock untuk membuka daftar aplikasi latar belakang Gili atau overflow tray Windows (termasuk pintasan Win+B saat mode Gili Tray aktif).",
        descEn: "Adds the hidden system tray chevron button next to the Dock system icons to open Gili's background apps flyout or the native Windows tray overflow (with Win+B shortcut support when Gili Tray is active).",
        badge: "new",
      },
      {
        icon: <Smartphone size={14} />,
        titleId: "Perbaikan Transfer File Shelf (Kirim & Terima dari HP)",
        titleEn: "File Shelf Transfer Fixes (Send & Receive with Phone)",
        descId: "Menyelesaikan ukuran 0 B saat kirim ke HP dengan validasi berkas di disk, penanda file hilang, pratinjau media inline, dan dukungan HTTP Range 206. Unggahan dari HP kini menyaring karakter terlarang Windows, memberi nomor otomatis untuk nama kembar, menayangkan batch multi-file cepat beserta thumbnail, dan melaporkan status gagal dengan tepat.",
        descEn: "Fixes 0 B downloads when sharing to phones via pre-session disk validation, missing-file badges, inline media previews, and HTTP 206 byte-range support. Phone uploads now sanitize Windows filenames, auto-rename duplicates instead of overwriting, show rapid multi-file batches with thumbnails, and report failed transfers accurately.",
        badge: "fix",
      },
      {
        icon: <MousePointerClick size={14} />,
        titleId: "Presisi Hitbox Reveal & Jeda Auto-Hide Taskbar",
        titleEn: "Taskbar Auto-Hide Timing & Reveal Hitbox Precision",
        descId: "Membatasi area pemicu saat Dock tersembunyi ke strip tepi bawah selebar panjang Dock agar tidak terbuka sebelum kursor menyentuh batas bawah, serta mengatur jeda auto-hide idle menjadi 1 detik.",
        descEn: "Restricts the hidden Dock reveal zone to the bottom edge strip matching the Dock width so it stays closed until the cursor reaches the edge, and sets the idle auto-hide delay to 1 second.",
        badge: "fix",
      },
      {
        icon: <LayoutGrid size={14} />,
        titleId: "Perbaikan Tata Letak Kartu Mini Note",
        titleEn: "Mini Note Card Spacing & Layout Fix",
        descId: "Merapikan posisi tombol panah geser agar tidak menimpa isi catatan, menaikkan posisi daftar kartu, dan menyesuaikan tinggi kartu agar bagian bawah tidak terpotong.",
        descEn: "Fixes Mini Note scroll chevron positioning so arrows no longer cover note content, lifts the card row upward, and adjusts card height to prevent bottom clipping.",
        badge: "fix",
      },
    ],
  },
  {
    version: "5.0.0",
    date: "14 Nov 2026",
    highlights: [
      {
        icon: <AppWindow size={14} />,
        titleId: "Taskbar Kustom Gili Dock & 40+ Modul Utilitas",
        titleEn: "Gili Custom Taskbar Dock & 40+ Utility Modules",
        descId: "Hadirkan Taskbar / Dock mengambang di bagian bawah layar dengan reservasi ruang AppBar otomatis, daftar aplikasi aktif beserta pratinjau jendela langsung, dan lebih dari 40 modul cepat seperti monitor sistem, media, cuaca, kalender, serta catatan cepat.",
        descEn: "Introduces a customizable bottom Taskbar Dock with automatic AppBar workarea reservation, running app switcher with live window previews, and over 40 modular widgets including system monitor, media, weather, calendar, and quick notes.",
        badge: "new",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Flyout Kustom Start Menu, Pencarian, Pengaturan Cepat & Tray",
        titleEn: "Custom Start Menu, Search, Quick Settings & Tray Flyouts",
        descId: "Panel flyout terintegrasi di atas Dock untuk Start Menu, Pencarian, Pengaturan Cepat (Wi-Fi, Bluetooth, Volume, Output Audio, kecerahan, dan baterai), Notification Center, serta Hidden Tray dengan tema Solid dan Liquid Glass.",
        descEn: "Integrated Dock flyout panels for Start Menu, Search, Quick Settings (Wi-Fi, Bluetooth, Volume, Audio Output, brightness, and battery), Notification Center, and Hidden Tray supporting both Solid and Liquid Glass themes.",
        badge: "new",
      },
      {
        icon: <Palette size={14} />,
        titleId: "Tema Ikon macOS Sequoia 3D & Kustomisasi Tampilan Dock",
        titleEn: "macOS Sequoia 3D Icon Theme & Dock Theme Engine",
        descId: "Pilihan tema ikon gaya macOS Sequoia beresolusi tinggi dengan 40+ ikon aplikasi terkurasi, dukungan warna kustom penuh, pengaturan opasitas permukaan langsung, serta mode Solid dan Liquid Glass.",
        descEn: "High-resolution macOS Sequoia icon theme with 40+ curated app icons, custom color picker, live surface opacity controls, and Solid / Liquid Glass surface modes.",
        badge: "new",
      },
      {
        icon: <ShieldCheck size={14} />,
        titleId: "Intersepsi Tombol Windows Global & Pemulihan Taskbar Otomatis",
        titleEn: "Global Windows Key Interception & Taskbar Fail-Safe Recovery",
        descId: "Menekan tombol Windows pada keyboard kini langsung membuka Start Menu kustom Gili tanpa memicu ganda taskbar bawaan Windows, disertai adaptasi kontras desktop otomatis saat berpindah jendela dan watchdog pemulihan taskbar.",
        descEn: "Pressing the Windows key now opens Gili's custom Start Menu directly without triggering the native Windows taskbar alongside it, paired with automatic desktop contrast tracking and a Windows taskbar recovery watchdog.",
        badge: "improve",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Optimasi Performa & Konsumsi Memori Multi-Jendela",
        titleEn: "Multi-Window Performance & Memory Optimizations",
        descId: "Optimasi backend Rust/Win32 dan pipeline render frontend untuk perpindahan tampilan flyout tanpa flicker, pra-tangkap latar belakang instan, serta konsumsi CPU dan memori lebih efisien.",
        descEn: "Optimized Rust/Win32 backend handling and frontend rendering pipelines for flicker-free flyout switching, instant backdrop capture, and lower CPU and memory usage.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.6.2",
    date: "14 Nov 2026",
    highlights: [
      {
        icon: <Music size={14} />,
        titleId: "Animasi Lirik Jalan Per Kata (Syllable Sync)",
        titleEn: "Word-by-Word Lyrics Fill Animation",
        descId: "Teks lirik pada Notch, Idle Lyrics, dan Mini Player (mode Bar maupun Card) kini terisi halus kata demi kata mengikuti waktu pemutaran lagu, lengkap dengan dukungan aksesibilitas pengurangan gerak (Reduced Motion).",
        descEn: "Lyrics across the Notch, Idle Lyrics, and Mini Player (both Bar and Card modes) now fill smoothly word by word in real time with playback, including Reduced Motion accessibility support.",
        badge: "new",
      },
      {
        icon: <SlidersHorizontal size={14} />,
        titleId: "Prioritas Auto Lirik Per Kata & Provider Better Lyrics",
        titleEn: "Word-Timed Auto Lyrics Priority & Better Lyrics Provider",
        descId: "Menambahkan provider Better Lyrics (TTML) serta parser timing per kata untuk KuGou (KRC), NetEase (YRC), dan Enhanced LRC. Mode Auto kini mengutamakan lirik per kata lebih dulu, lalu QQ Music dan Genius, serta memakai LRCLIB sebagai opsi terakhir ketika sumber lain kosong. Cache lirik lama tanpa timing per kata juga otomatis diperbarui.",
        descEn: "Added the Better Lyrics (TTML) provider along with word-timing parsers for KuGou (KRC), NetEase (YRC), and Enhanced LRC. Auto mode now prioritizes word-timed lyrics first, followed by QQ Music and Genius, using LRCLIB only as the last fallback when other sources have no match. Legacy disk caches without word timings automatically refresh.",
        badge: "improve",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Sinkronisasi Offset Per Lagu & Anti-Race Saat Ganti Lagu",
        titleEn: "Per-Track Lyrics Offset & Track-Switch Race Protection",
        descId: "Request pencarian lirik dari lagu sebelumnya kini otomatis dibatalkan saat lagu cepat berganti dan hasilnya diverifikasi terhadap lagu yang aktif agar tidak tertukar. Pengaturan offset lirik juga disimpan terpisah untuk tiap lagu dan tidak terbawa ke lagu lain.",
        descEn: "Pending lyrics requests from previous tracks are now canceled when skipping songs rapidly and verified against the active track to prevent mismatched lyrics. Lyrics timing offsets are also isolated per track instead of leaking across other songs.",
        badge: "fix",
      },
      {
        icon: <Minimize2 size={14} />,
        titleId: "Batas Hover Mini Player Akurat & Kalibrasi DPI Multi-Monitor",
        titleEn: "Exact Mini Player Hover Bounds & Multi-Monitor DPI Calibration",
        descId: "Area luar sudut membulat Mini Player kini benar-benar tembus klik (click-through) tanpa memicu status hover saat kursor berada di luar jendela. Perhitungan DPI per-monitor untuk posisi dan drag-to-notch diperbaiki, serta toolbar Mini Player kini memuat pilihan provider per kata.",
        descEn: "Areas outside the rounded Mini Player frame now pass clicks cleanly without triggering hover states when the cursor is outside the window. Per-monitor DPI scaling for positioning and drag-to-notch has been calibrated, and the toolbar now includes word-timed lyrics providers.",
        badge: "fix",
      },
      {
        icon: <Volume2 size={14} />,
        titleId: "Perbaikan Audio Notifikasi Kustom Kembali ke Bawaan",
        titleEn: "Reliable Custom Notification Sound Playback",
        descId: "Memperbaiki decoding buffer audio kustom di Web Audio API beserta fallback pemutaran HTML Audio agar suara notifikasi unggahan pengguna tidak lagi jatuh ke suara bawaan Glass saat diputar.",
        descEn: "Fixed Web Audio buffer decoding and added an HTML Audio fallback so user-uploaded notification sounds play reliably without falling back to the default Glass chime.",
        badge: "fix",
      },
      {
        icon: <Palette size={14} />,
        titleId: "Kontras Light Mode & Reset Semua Pengaturan Lebih Bersih",
        titleEn: "Light Mode Contrast Polish & Clean Settings Reset",
        descId: "Menyesuaikan warna teks, border, track slider, dan tombol overlay untuk Light Mode pada Volume Mixer, Audio Output, Drop Shelf (beserta banner dan modal transfer LAN), dan pemilih warna kustom. Tombol Reset Semua Pengaturan kini ikut membersihkan Tauri Store dan menyinkronkan reset ke semua jendela.",
        descEn: "Refined text contrast, borders, slider tracks, and overlay buttons for Light Mode in Volume Mixer, Audio Output, Drop Shelf (including banners and LAN transfer modals), and Custom Color Picker. Reset All Settings now also clears Tauri Store keys and syncs the reset across all windows.",
        badge: "improve",
      },
      {
        icon: <Bot size={14} />,
        titleId: "Routing Vision AI, Kontrol Anggaran & Keamanan Kredensial Model",
        titleEn: "Vision-Aware AI Routing, Budget Controls & Model Credential Security",
        descId: "Quick AI dan AI Chat kini memfilter model berkemampuan vision saat melampirkan gambar, menerapkan kebijakan batas anggaran (peringatan, downgrade ke Tier cepat, atau blokir), mendukung pembatalan stream aktif, menyimpan API key per-model lewat Windows Credential Manager, membatasi ukuran dekode gambar clipboard, dan memproses kuota Free Proxy secara atomik.",
        descEn: "Quick AI and full AI Chat now filter for vision-capable models when images are attached, enforce budget threshold actions (warn, fast-tier downgrade, or block), support canceling active streams, store per-model API keys via Windows Credential Manager, enforce safe clipboard image decode limits, and process Free Proxy quotas atomically.",
        badge: "improve",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Sinkronisasi Lintas Jendela, Jadwal Pengingat & Keamanan Backend",
        titleEn: "Cross-Window Sync, Reminder Scheduling & Backend Reliability",
        descId: "Menyelaraskan perubahan Pomodoro, Pengingat Air, Catatan Mini, dan Shortcut antar jendela serta mencegah duplikasi suara alarm pada monitor kedua. Jadwal Water Reminder kini mendukung jam aktif lintas tengah malam, Pengingat Sholat otomatis memperbarui jadwal saat ganti hari, dan server LAN Drop Shelf serta manajemen COM/Wi-Fi/autostart Rust diperketat.",
        descEn: "Synchronized Pomodoro, Water, Mini Note, and Shortcut state across windows while preventing duplicate alerts on the secondary display. Water Reminder now supports overnight active hours, Prayer Reminder refreshes cleanly across midnight transitions, and the Drop Shelf LAN server plus Windows COM/Wi-Fi/autostart handling have been hardened.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.6.1",
    date: "12 Nov 2026",
    highlights: [
      {
        icon: <SlidersHorizontal size={14} />,
        titleId: "Blur Latar Belakang GPU Native Real-Time",
        titleEn: "Real-Time Native GPU Backdrop Blur",
        descId: "Efek kaca (Glass dan Clear) kini di-render langsung oleh GPU Windows secara real-time menggunakan Windows.UI.Composition dan D2D1GaussianBlur tanpa tangkapan layar, tanpa jeda, dan terpotong presisi mengikuti lengkungan sudut notch maupun floating island.",
        descEn: "Glass and Clear modes now render directly on the Windows GPU in real time via Windows.UI.Composition and D2D1GaussianBlur with zero screen capture, zero latency, and exact geometric clipping around notch and floating island corners.",
        badge: "new",
      },
      {
        icon: <LayoutGrid size={14} />,
        titleId: "Dock & Taskbar Interaktif dengan Blur Kaca Kasar Native",
        titleEn: "Interactive Dock & Taskbar with Native Frosted Glass Blur",
        descId: "Taskbar kustom lengkap dengan 40 modul interaktif, Auto-Hide cerdas, flyout Start/Search/Quick Settings, dan efek kaca buram kasar berbasis GPU Windows.UI.Composition yang selaras penuh dengan Notch.",
        descEn: "Custom interactive taskbar with 40 modules, smart Auto-Hide, Start/Search/Quick Settings flyouts, and GPU-rendered coarse frosted glass blur via Windows.UI.Composition matching the Notch.",
        badge: "new",
      },
      {
        icon: <Palette size={14} />,
        titleId: "Dukungan Tema Transparansi & Kaca di AI Chat",
        titleEn: "Full Glass & Transparency Theme Support in AI Chat",
        descId: "Tab AI Chat beserta seluruh tampilannya (percakapan, analitik penggunaan, pengaturan koneksi, riwayat sesi, dan pemilih jendela) kini mengikuti pengaturan transparansi dan efek blur kaca notch.",
        descEn: "The AI Chat tab and all of its views (conversation, usage analytics, connection settings, session history, and window picker) now follow notch transparency and glass blur settings.",
        badge: "new",
      },
      {
        icon: <BarChart2 size={14} />,
        titleId: "Akurasi Token Real-Time, Multi-Mata Uang & Batas Anggaran AI",
        titleEn: "Accurate Real-Time Token Tracking, Multi-Currency & Budget Limits",
        descId: "Perhitungan token kini membaca metadata usage asli dari API (termasuk token reasoning dan Quick AI Chat) dengan reset harian mengikuti zona waktu lokal, serta mendukung 8 mata uang (IDR, USD, EUR, GBP, JPY, SGD, MYR, AUD), opsi bawaan Tanpa Batas, preset cepat, dan input manual.",
        descEn: "Token tracking now reads native API usage metadata (including reasoning tokens and Quick AI Chat) with local-timezone daily rollovers, while supporting 8 currencies (IDR, USD, EUR, GBP, JPY, SGD, MYR, AUD), an Unlimited default, quick presets, and manual input.",
        badge: "new",
      },
      {
        icon: <Bot size={14} />,
        titleId: "Paste Gambar di Quick AI & Integrasi Penuh Fitur Notch",
        titleEn: "Quick AI Image Paste & Complete Notch Feature Integration",
        descId: "Quick AI kini mendukung tempel gambar langsung dari clipboard (Ctrl+V), drag-and-drop, maupun chip deteksi screenshot otomatis. Selain itu, Quick AI dan AI Chat kini terintegrasi penuh dengan seluruh fitur Notch: membaca isi Mini Note, seluruh To-Do, progres Water Reminder, Jadwal Sholat, Drop Shelf, dan riwayat Clipboard, serta mengeksekusi aksi hapus/edit catatan, tandai sholat, atur Mode Fokus/Volume/Kecerahan, dan membuka tab Notch secara langsung.",
        descEn: "Quick AI now supports pasting images directly from the clipboard (Ctrl+V), drag-and-drop, and automatic screenshot detection chips. Both Quick AI and AI Chat are now deeply integrated across all Notch features: reading Mini Note contents, full To-Do lists, Water Reminder progress, Prayer Schedules, Drop Shelf files, and Clipboard history, plus executing actions to edit/delete notes, mark prayers, adjust Focus Mode/Volume/Brightness, and open any Notch tab directly.",
        badge: "new",
      },
      {
        icon: <MessageSquare size={14} />,
        titleId: "Lokalisasi Penuh Indonesia & Inggris di AI Chat",
        titleEn: "Complete Indonesian & English Localization for AI Chat",
        descId: "Seluruh antarmuka AI Chat, Quick AI Chat, kartu aksi notch, pesan status eksekusi tool, hingga pemberitahuan kuota gratis kini mendukung bahasa Indonesia dan Inggris secara menyeluruh.",
        descEn: "All AI Chat interfaces, Quick AI Chat, notch action cards, tool execution status messages, and free quota notices are now fully localized in both Indonesian and English.",
        badge: "improve",
      },
      {
        icon: <ExternalLink size={14} />,
        titleId: "Pintasan Rekomendasi Penyedia API Key Hemat",
        titleEn: "Recommended Affordable API Key Provider Shortcut",
        descId: "Tambahan tombol pintasan langsung di menu Hubungkan AI bagi pengguna yang ingin mendapatkan API key dari penyedia pihak ketiga dengan harga terjangkau.",
        descEn: "Added a direct shortcut button in the Connect AI view for users looking to obtain affordable third-party API keys.",
        badge: "new",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Independensi Penuh Interaksi Notch di Dual-Monitor",
        titleEn: "Full Dual-Monitor Notch Interaction Independence",
        descId: "Notch pada monitor utama dan monitor kedua kini mengisolasi event buka/tutup tab dan hover ke jendela masing-masing sehingga kedua layar bekerja mandiri tanpa saling menutup atau membuka paksa.",
        descEn: "Primary and secondary display notches now isolate tab open/close and hover events per window so both screens operate independently without forcing each other open or closed.",
        badge: "fix",
      },
      {
        icon: <Bell size={14} />,
        titleId: "Perbaikan Aksi 'Tandai Sudah Sholat' & Pop-up Pengingat",
        titleEn: "Fixed 'Mark as Prayed' Action & Reminder Pop-up Persistence",
        descId: "Menekan tombol tandai sudah sholat pada notifikasi adzan kini langsung membuka tab Pengingat Sholat dan mencentang jadwal terkait, serta menjaga pop-up adzan, air, pomodoro, dan deadline tugas tidak tertutup saat kursor menjauh.",
        descEn: "Clicking mark as prayed on the adzan alert now properly opens the Prayer Reminder tab and checks off the prayer, while keeping adzan, water, pomodoro, and task deadline alerts from collapsing on mouse leave.",
        badge: "fix",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Tampilan Mode Anchored Lebih Bersih Tanpa Bayangan Tepi",
        titleEn: "Cleaner Anchored Mode Without Edge Drop Shadow",
        descId: "Menghilangkan bayangan luar pada mode Anchored agar lekukan notch menyatu rata dengan bezel atas layar.",
        descEn: "Removed outer drop shadows in Anchored mode so the notch blends flush against the top screen bezel.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.6.0",
    date: "12 Nov 2026",
    highlights: [
      {
        icon: <MessageSquare size={14} />,
        titleId: "Tab AI Chat Penuh di Notch",
        titleEn: "Full AI Chat Panel in Notch",
        descId: "Panel AI Chat komprehensif terintegrasi di bilah notch dengan streaming respons real-time via Rust HTTP bridge dan dukungan multi-provider (OpenAI, Claude, Gemini, DeepSeek, Grok, OpenRouter, dan Custom Proxy).",
        descEn: "Comprehensive AI Chat panel integrated directly in the notch bar with real-time streaming via Rust HTTP bridge and multi-provider support (OpenAI, Claude, Gemini, DeepSeek, Grok, OpenRouter, and Custom Proxies).",
        badge: "new",
      },
      {
        icon: <Bot size={14} />,
        titleId: "Quick AI Chat di Notch (Ctrl + Alt + A)",
        titleEn: "Quick AI Chat in Notch (Ctrl + Alt + A)",
        descId: "Akses asisten AI kilat langsung dari mana saja dengan bilah melayang di notch, fokus otomatis instan, saran cerdas dari teks clipboard, dan tombol transisi ke chat penuh.",
        descEn: "Instant floating AI assistant accessible anywhere via global shortcut, featuring auto-focus, smart clipboard snippet suggestions, and one-click transition to full chat.",
        badge: "new",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Mode AI Gratis Tanpa API Key",
        titleEn: "Free AI Tier Without API Key Setup",
        descId: "Pengguna baru dapat langsung mengobrol dengan AI cerdas Gemini Flash-Lite secara gratis (kuota 15 chat/hari) melalui server Cloudflare Workers tanpa perlu mendaftar atau memasukkan API key pribadi.",
        descEn: "New users can instantly chat with intelligent Gemini Flash-Lite for free (15 chats/day quota) via Cloudflare Workers proxy without requiring any personal API key configuration.",
        badge: "new",
      },
      {
        icon: <Cpu size={14} />,
        titleId: "Router Cerdas 'Auto (Hemat)'",
        titleEn: "'Auto (Cost Saver)' Smart Router",
        descId: "Sistem routing otomatis yang menganalisis pesan untuk mengarahkan pertanyaan ringan ke model hemat (Tier T0 Fast) dan hanya memanggil model besar (Tier T2 Max) saat menghadapi tugas pemrograman atau penalaran berat.",
        descEn: "Intelligent automatic router that analyzes prompt complexity, directing simple prompts to lightweight fast models (Tier T0 Fast) and reserving heavy models (Tier T2 Max) for coding and deep reasoning.",
        badge: "new",
      },
      {
        icon: <CheckSquare size={14} />,
        titleId: "Integrasi Aksi Nyata Notch oleh AI",
        titleEn: "AI Real Notch Action Execution",
        descId: "AI kini dapat langsung menjalankan perintah nyata di notch Gili: membuat tugas To-Do, menyalakan timer Pomodoro, mencatat Mini Note, menambah asupan air, dan berpindah tab secara otomatis.",
        descEn: "AI can now directly execute native notch actions: creating To-Dos, starting Pomodoro timers, appending Mini Notes, logging water intake, and switching notch tabs automatically.",
        badge: "new",
      },
      {
        icon: <AppWindow size={14} />,
        titleId: "Konteks Jendela Aktif & Input Multimodal",
        titleEn: "Active Window Context & Multimodal Input",
        descId: "Pilih dan lampirkan teks atau tangkapan layar dari jendela aplikasi yang sedang aktif (browser, VS Code, dokumen) langsung ke percakapan, ditambah dukungan paste gambar dari clipboard.",
        descEn: "Select and attach text or screenshots from currently active application windows directly into chat, with full support for clipboard image pasting and drag-and-drop.",
        badge: "new",
      },
      {
        icon: <Eye size={14} />,
        titleId: "Viewer Penalaran (Reasoning Chain) & Pemisah Pikiran",
        titleEn: "Reasoning Chain Viewer & Thought Filter",
        descId: "Tampilan visual khusus yang rapi untuk alur penalaran model reasoning seperti DeepSeek R1, dengan pemisah blok pemikiran <think> yang dapat dilipat agar obrolan tetap bersih.",
        descEn: "Dedicated clean visual view for reasoning models like DeepSeek R1, featuring collapsible <think> thought blocks to keep the conversation readable.",
        badge: "improve",
      },
      {
        icon: <ShieldCheck size={14} />,
        titleId: "Keamanan Kredensial Enkripsi Windows DPAPI",
        titleEn: "Windows DPAPI Secure Credential Storage",
        descId: "Penyimpanan API key aman terlindungi di level sistem operasi menggunakan Windows Data Protection API (DPAPI) sehingga key terenkripsi dan tidak tersimpan dalam bentuk teks polos.",
        descEn: "Safe API key storage protected at the OS level using Windows Data Protection API (DPAPI), ensuring keys are encrypted and never stored in plain text.",
        badge: "improve",
      },
      {
        icon: <BarChart2 size={14} />,
        titleId: "Analisis Penggunaan Token & Multi-Mata Uang",
        titleEn: "Token Usage Analytics & Multi-Currency Support",
        descId: "Pantau penggunaan token harian dan mingguan dalam grafik visual, lengkap dengan estimasi pengeluaran dalam berbagai mata uang (IDR, USD, EUR, GBP, JPY, SGD, MYR, AUD) dan pengaturan batas anggaran bulanan.",
        descEn: "Monitor daily and weekly token consumption in visual charts, complete with cost estimation in multiple currencies (IDR, USD, EUR, GBP, JPY, SGD, MYR, AUD) and customizable monthly budget thresholds.",
        badge: "new",
      },
      {
        icon: <History size={14} />,
        titleId: "Manajemen Riwayat Sesi & Pembersihan Otomatis",
        titleEn: "Session History Manager & Auto-Pruning",
        descId: "Kelola riwayat percakapan sebelumnya dengan pencarian judul instan, peralihan sesi cepat, serta opsi pembersihan otomatis sesi lama (3, 7, atau 30 hari).",
        descEn: "Manage past conversations with instant title search, fast session switching, and automatic cleanup options for older chats (3, 7, or 30 days).",
        badge: "new",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Dukungan Model AI Generasi Baru & Logo Resmi",
        titleEn: "Next-Gen AI Models & Official Provider Logos",
        descId: "Dukungan visual dan logo resmi beresolusi tinggi untuk berbagai model AI global: GLM, Qwen, Kimi, Gemma, Nemotron, Ministral, Devstral, Palmyra, Moonshot, Grok, dan DeepSeek.",
        descEn: "Official high-resolution visual logos and brand detection for next-gen models: GLM, Qwen, Kimi, Gemma, Nemotron, Ministral, Devstral, Palmyra, Moonshot, Grok, and DeepSeek.",
        badge: "improve",
      },
      {
        icon: <Volume2 size={14} />,
        titleId: "Penyegaran Audio Notifikasi Snap",
        titleEn: "Refreshed Snap Notification Audio",
        descId: "Efek suara notifikasi diperbarui dengan audio snap yang lebih renyah, bersih, dan menyenangkan didengar saat menerima alert atau timer selesai.",
        descEn: "Notification audio effects updated with a crisper, cleaner, and pleasant snap sound when receiving alerts or timer completions.",
        badge: "improve",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Stabilitas Protokol Gateway & Routing Kustom",
        titleEn: "Custom Gateway Protocol & Routing Stability",
        descId: "Perbaikan sanitasi URL kustom proxy AI, pencegahan duplikasi path endpoint, dan pelestarian header native Anthropic Claude untuk koneksi pihak ketiga yang andal.",
        descEn: "Fixed custom AI proxy URL sanitization, prevented redundant path suffix duplication, and preserved native Anthropic Claude headers for seamless third-party gateway connections.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.5.2",
    date: "8 Nov 2026",
    highlights: [
      {
        icon: <AppWindow size={14} />,
        titleId: "Ikon Asli Aplikasi di Volume Mixer",
        titleEn: "Native App Icons in Volume Mixer",
        descId: "Volume Mixer kini mengekstrak dan menampilkan ikon asli langsung dari file executable aplikasi yang aktif.",
        descEn: "Volume Mixer now extracts and displays native application icons directly from active executable files.",
        badge: "improve",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Perbaikan Dropdown Mode Control Center",
        titleEn: "Control Center Mode Dropdown Layering Fix",
        descId: "Menu dropdown Mode di Control Center kini tampil di layer teratas dan tidak lagi terpotong oleh batas panel.",
        descEn: "Mode dropdown menu in Control Center now renders on the top-most layer without being clipped by panel boundaries.",
        badge: "fix",
      },
      {
        icon: <Bell size={14} />,
        titleId: "Notifikasi Idle Instan Langsung Timpa",
        titleEn: "Instant Overwrite for Idle Notifications",
        descId: "Notifikasi baru di notch idle langsung menggantikan notifikasi aktif secara instan tanpa menunggu antrean lama.",
        descEn: "New notifications in the idle notch now immediately replace active notifications without queuing delays.",
        badge: "improve",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Multi-Monitor Independen & Terintegrasi",
        titleEn: "Independent Multi-Monitor Notch Control",
        descId: "Membuka tab notch di monitor utama tidak lagi memaksa notch monitor kedua ikut terbuka, keduanya bekerja mandiri.",
        descEn: "Opening tabs on the primary notch no longer mirrors state to secondary displays, keeping monitors independent.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.5.1",
    date: "7 Nov 2026",
    highlights: [
      {
        icon: <Music size={14} />,
        titleId: "Desktop Mini Player & Lirik Melayang Tembus (Click-Through)",
        titleEn: "Desktop Mini Player & Click-Through Floating Lyrics",
        descId: "Area lirik Mini Player sepenuhnya tembus klik ke aplikasi di belakangnya agar tidak mengganggu aktivitas desktop, dengan mode Bar & Card yang selalu aktif.",
        descEn: "Mini Player lyrics area passes clicks seamlessly through to background applications without interrupting desktop workflows, always active by default.",
        badge: "improve",
      },
      {
        icon: <Bell size={14} />,
        titleId: "Desain Baru Pengingat Sholat & Notifikasi Adzan",
        titleEn: "Redesigned Prayer Reminders & Adzan Alert",
        descId: "Tampilan Pengingat Sholat kini lebih modern dengan hero card, timeline matahari/bulan real-time, audio adzan saat waktu sholat tiba, dan notifikasi pre-reminder yang lebih ringkas.",
        descEn: "Prayer Reminder now features a modern hero card, real-time celestial sun/moon timeline indicator, adzan audio alert at prayer time, and a sleek compact pre-reminder notification.",
        badge: "new",
      },
      {
        icon: <Music size={14} />,
        titleId: "Desktop Mini Player & Lirik Melayang",
        titleEn: "Desktop Mini Player & Floating Lyrics",
        descId: "Putar dan nikmati musik langsung di desktop dengan mode Bar ringkas dan Card album. Dilengkapi lirik sinkron interaktif, drag-to-notch, dan selalu tampil di atas layar (Always on Top).",
        descEn: "Play and enjoy music directly on your desktop with compact Bar and Card album modes. Features interactive sync lyrics, drag-to-notch, and Always on Top display.",
        badge: "new",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Perbaikan Bug Lirik Tidak Muncul",
        titleEn: "Fix for Missing / Unloaded Lyrics",
        descId: "Memperbaiki masalah di mana lirik terkadang tidak muncul atau gagal termuat saat pergantian lagu, memastikan lirik langsung tersinkronisasi kembali secara otomatis.",
        descEn: "Fixed issues where lyrics occasionally failed to appear or load upon track changes, ensuring lyrics instantly synchronize automatically.",
        badge: "fix",
      },
      {
        icon: <MousePointerClick size={14} />,
        titleId: "Ganti Tab Header dengan Roda Mouse (Scroll Wheel)",
        titleEn: "Mouse Wheel Tab Switching on Header",
        descId: "Beralih antar tab notch secara cepat dan mulus cukup dengan memutar roda scroll mouse pada baris header tab.",
        descEn: "Quickly and smoothly switch between notch tabs simply by scrolling your mouse wheel over the tab header area.",
        badge: "new",
      },
      {
        icon: <SlidersHorizontal size={14} />,
        titleId: "Metode Hisab & Pengaturan Audio Interaktif",
        titleEn: "Calculation Methods & Interactive Audio Settings",
        descId: "Pilihan metode hisab Kemenag RI, MWL, dan Makkah dengan kalkulasi offline yang akurat, slider volume real-time dengan tombol pratinjau suara adzan langsung di menu.",
        descEn: "Selectable calculation methods for Kemenag RI, MWL, and Makkah with accurate offline solar calculations, real-time volume slider, and in-place adzan preview.",
        badge: "improve",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Sinkronisasi Master Pengingat & Snooze",
        titleEn: "Master Reminder Sync & Snooze Handling",
        descId: "Master switch pengingat tersinkronisasi otomatis dengan toggle per-sholat, notifikasi snooze 5 menit lebih pintar, dan cache jadwal otomatis diperbarui saat mengubah metode hisab.",
        descEn: "Master reminder switch now stays fully in sync with individual prayer toggles, smarter 5-minute snooze handling, and automatic schedule cache invalidation on method changes.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.4.6",
    date: "6 Nov 2026",
    highlights: [
      {
        icon: <Music size={14} />,
        titleId: "Pencarian Lirik Lebih Andal",
        titleEn: "More Reliable Lyrics Lookup",
        descId: "LRCLIB kini menjadi sumber utama, lalu QQ Music, NetEase, KuGou, dan Genius dicari bersamaan hanya jika tidak ditemukan. Hasil dicocokkan dengan judul dan durasi lagu agar tidak salah lirik.",
        descEn: "LRCLIB is now the primary source, with QQ Music, NetEase, KuGou, and Genius queried in parallel only when it has no match. Results are checked against track title and duration to avoid wrong lyrics.",
        badge: "improve",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Lirik Tidak Lagi Terkunci Kosong",
        titleEn: "Lyrics No Longer Stuck Empty",
        descId: "Gangguan jaringan sesaat tidak lagi membuat sebuah lagu dianggap tanpa lirik sampai aplikasi dibuka ulang, dan tiap sumber kini memiliki batas waktu agar tidak menggantung.",
        descEn: "A brief network failure no longer marks a song as lyric-less until restart, and every source now has a timeout so lookups never hang.",
        badge: "fix",
      },
      {
        icon: <AppWindow size={14} />,
        titleId: "Autostart & Shortcut Selalu Menuju Versi Terpasang",
        titleEn: "Autostart & Shortcuts Always Target the Installed Version",
        descId: "Gili memperbaiki otomatis entri autostart dan shortcut yang masih menunjuk ke file lama, sehingga setelah restart komputer tidak kembali ke versi lama.",
        descEn: "Gili now auto-repairs autostart and shortcut entries that still point to an old copy, so restarting your PC no longer brings back an older version.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.4.5",
    date: "4 Nov 2026",
    highlights: [
      {
        icon: <Monitor size={14} />,
        titleId: "Sinkronisasi & Cermin Multi-Monitor",
        titleEn: "Multi-Monitor Mirroring & Window Sync",
        descId: "Notch di semua monitor kini tersinkronisasi mulus saat dihover atau membuka tab tanpa terpotong atau terpusat di satu monitor.",
        descEn: "Notch across all connected monitors now smoothly mirrors hover and tab states without clipping or locking to a single display.",
        badge: "fix",
      },
      {
        icon: <Minimize2 size={14} />,
        titleId: "Pemulihan Auto-Compact Lebih Andal",
        titleEn: "Reliable Auto-Compact Recovery",
        descId: "Notch dapat kembali ke tampilan normal (idle) secara konsisten saat menutup jendela aplikasi maksimal atau peramban.",
        descEn: "Notch reliably returns to idle mode after closing maximized apps or browser windows.",
        badge: "fix",
      },
      {
        icon: <CheckSquare size={14} />,
        titleId: "Penyempurnaan Quick To-Do & Terjemahan",
        titleEn: "Quick To-Do Layout & Repeat Localization",
        descId: "Area aksi tombol tidak lagi terpotong saat mendeteksi tenggat waktu, dan pilihan pengulangan tugas kini mendukung bahasa Inggris.",
        descEn: "Action buttons are no longer clipped when a due time is detected, and repeat rule chips now fully support English.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.4.4",
    date: "4 Nov 2026",
    highlights: [
      {
        icon: <AppWindow size={14} />,
        titleId: "Target Auto-Compact: Peramban atau Aplikasi Dimaksimalkan",
        titleEn: "Auto-Compact Target: Browser or All Maximized Apps",
        descId: "Pilih pemicu mode ringkas otomatis antara hanya saat peramban aktif atau saat aplikasi apapun dimaksimalkan (maximized/fullscreen).",
        descEn: "Choose auto-compact trigger between active browser only or whenever any app window is maximized/fullscreen.",
        badge: "new",
      },
      {
        icon: <MapPin size={14} />,
        titleId: "Pilih Lokasi Cuaca di Pengaturan & Panel Cepat",
        titleEn: "Weather Location Selector in Settings & Quick Panel",
        descId: "Mengembalikan kontrol pencarian dan pemilihan kota cuaca kustom di Pengaturan Umum serta panel cepat notch dengan dukungan tema terang.",
        descEn: "Restored custom city search and selection for weather in General Settings and the notch quick panel with full light theme support.",
        badge: "new",
      },
      {
        icon: <BellOff size={14} />,
        titleId: "Sinkronisasi Tab Nonaktif & Penghentian Notifikasi",
        titleEn: "Disabled Tab Sync & Notification Suppression",
        descId: "Tab yang dinonaktifkan di Kelola Tab (seperti Pengingat Sholat, Pengingat Air, To-Do, dan Pomodoro) kini sepenuhnya menghentikan timer background dan tidak lagi mengirim notifikasi.",
        descEn: "Tabs disabled in Tab Manager (such as Prayer Reminder, Water Tracker, To-Do, and Pomodoro) now fully halt background timers and suppress all notifications.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.4.3",
    date: "3 Nov 2026",
    highlights: [
      {
        icon: <Layers size={14} />,
        titleId: "Perbaikan Multi-Monitor & Notch Duplikat",
        titleEn: "Multi-Monitor & Duplicate Notch Fix",
        descId: "Memperbaiki masalah notch bertumpuk dan mencegah duplikasi jendela sekunder pada monitor utama dengan positioning hardware langsung.",
        descEn: "Fixed stacked notch issue and prevented duplicate secondary windows on primary monitors via direct hardware coordinates positioning.",
        badge: "fix",
      },
      {
        icon: <Bell size={14} />,
        titleId: "Pengingat Sholat Default Nonaktif",
        titleEn: "Prayer Reminder Default Off",
        descId: "Notifikasi pop-up waktu sholat dan pengingat adzan kini default nonaktif (OFF) dan dapat diaktifkan manual sesuai kebutuhan.",
        descEn: "Prayer time pop-ups and pre-adzan reminders now default to OFF and can be manually enabled as desired.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.4.2",
    date: "3 Nov 2026",
    highlights: [
      {
        icon: <Layers size={14} />,
        titleId: "Dukungan Notch di Semua Layar (All Displays)",
        titleEn: "All Displays Notch Support",
        descId: "Fitur 'Semua Layar' kini aktif sepenuhnya! Setiap monitor eksternal yang terhubung akan menampilkan notch mandiri dengan sinkronisasi tema, idle bar, dan kontrol musik.",
        descEn: "The 'All Displays' feature is now fully active! Each connected external monitor displays an independent notch with theme sync, idle bar, and music controls.",
        badge: "new",
      },
      {
        icon: <MousePointerClick size={14} />,
        titleId: "Hit-Testing & Click-Through Multi-Monitor",
        titleEn: "Multi-Monitor Hit-Testing & Click-Through",
        descId: "Hover kursor dan interaksi klik pada notch di semua monitor berjalan mulus tanpa mengganggu jendela aplikasi lain di bawahnya.",
        descEn: "Cursor hover and click interactions on notches across all monitors run smoothly without interfering with windows underneath.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.4.1",
    date: "3 Nov 2026",
    highlights: [
      {
        icon: <Moon size={14} />,
        titleId: "Jadwal Sholat Berikutnya di Idle Bar",
        titleEn: "Next Prayer Time in Idle Bar",
        descId: "Slot Sholat kini dapat dipilih di Pengaturan Idle Layout dan menampilkan waktu sholat berikutnya langsung di idle bar.",
        descEn: "The Prayer slot can now be selected in Idle Layout settings to display the upcoming prayer time directly on the idle bar.",
        badge: "new",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Ikon Ethernet di Control Center",
        titleEn: "Ethernet Icon in Control Center",
        descId: "Saat terhubung lewat kabel LAN tanpa Wi-Fi, tile jaringan kini menampilkan ikon dan label Ethernet beserta ping, bukan lagi Wi-Fi.",
        descEn: "When connected through a LAN cable without Wi-Fi, the network tile now shows an Ethernet icon and label with ping instead of Wi-Fi.",
        badge: "new",
      },
      {
        icon: <Music size={14} />,
        titleId: "Deteksi Tab Musik dan Lirik Lebih Andal",
        titleEn: "More Reliable Music and Lyrics Tab Detection",
        descId: "Memperbaiki tab musik dan lirik yang kadang tidak muncul walau pemutar sudah menyala, termasuk saat musik sudah berjalan sebelum Gili dibuka.",
        descEn: "Fixed the music and lyrics tabs sometimes not appearing even though a player is running, including when music was already playing before Gili started.",
        badge: "fix",
      },
      {
        icon: <Repeat size={14} />,
        titleId: "Tugas Berulang Muncul Sesuai Jadwal",
        titleEn: "Recurring Tasks Follow Their Schedule",
        descId: "Tugas Daily, Weekday, Weekly, dan Monthly yang sudah diceklis tidak lagi muncul kembali di hari yang sama, melainkan baru aktif pada jadwal berikutnya.",
        descEn: "Checked-off Daily, Weekday, Weekly, and Monthly tasks no longer reappear the same day and only return on their next scheduled date.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.4.0",
    date: "3 Nov 2026",
    highlights: [
      {
        icon: <Smartphone size={14} />,
        titleId: "Transfer File Shelf ke Ponsel & HP",
        titleEn: "Phone File Shelf Transfer",
        descId: "Kirim dan terima file antara PC dan ponsel via QR code secara instan melalui jaringan Wi-Fi lokal tanpa internet.",
        descEn: "Instantly send and receive files between PC and mobile phones via QR code over local Wi-Fi without internet.",
        badge: "new",
      },
      {
        icon: <Smile size={14} />,
        titleId: "Animasi Maskot Idle Saat Notch Kosong",
        titleEn: "Idle Mascot Peek Animation for Empty Notch",
        descId: "Saat seluruh slot Idle Bar dikosongkan, maskot Gili yang lucu akan muncul mengintip setiap 5 menit sekali lengkap dengan animasi interaktif dan pratinjau langsung di Pengaturan.",
        descEn: "When all Idle Bar slots are set to empty, the adorable Gili mascot peeks out every 5 minutes with interactive animations and live preview in Settings.",
        badge: "new",
      },
      {
        icon: <Maximize2 size={14} />,
        titleId: "Bentuk Kapsul Proporsional Saat Idle Kosong",
        titleEn: "Proportional Capsule Pill for Empty Idle",
        descId: "Notch idle saat kosong kini tetap mempertahankan bentuk kapsul memanjang yang rapi dan elegan, konsisten dengan ukuran saat berisi indikator.",
        descEn: "The empty idle notch now retains a sleek, proportional elongated capsule shape consistent with active indicator pill dimensions.",
        badge: "improve",
      },
      {
        icon: <MousePointerClick size={14} />,
        titleId: "Tooltip Kustom Desain Elegan di Seluruh Aplikasi",
        titleEn: "Custom Modern Tooltip Across App",
        descId: "Mengganti seluruh tooltip native browser bawaan OS dengan komponen Tooltip kustom bergaya minimalis, halus, dan serasi dengan estetika Gili.",
        descEn: "Replaced all default OS native browser tooltips with custom minimalist, smooth tooltips matching Gili's design language.",
        badge: "improve",
      },
      {
        icon: <Bell size={14} />,
        titleId: "Slot Idle Baru: Notifikasi & File Shelf",
        titleEn: "New Idle Slots: Notifications & File Shelf",
        descId: "Layout Idle Bar kini mendukung indikator jumlah notifikasi belum dibaca, jumlah berkas di File Shelf, serta opsi untuk mengosongkan slot manapun.",
        descEn: "Idle Bar layout now supports unread notification count, File Shelf stash counter, and the ability to empty any slot.",
        badge: "new",
      },
      {
        icon: <FolderDown size={14} />,
        titleId: "Proteksi Drag File Shelf & Tab Pengaturan Khusus",
        titleEn: "File Shelf Drag Protection & Dedicated Settings Tab",
        descId: "Berkas di File Shelf kini tetap tersimpan aman saat di-drag keluar tanpa target drop. Tombol pengaturan di shelf kini langsung mengarah ke tab pengaturan khusus Shelf.",
        descEn: "Files in File Shelf remain safely stored when dragged out without a drop target. Shelf gear button now directly opens the dedicated Shelf settings tab.",
        badge: "new",
      },
      {
        icon: <Gamepad2 size={14} />,
        titleId: "Kestabilan Mode Gaming & Focus Assist",
        titleEn: "Gaming Mode & Focus Assist Stability",
        descId: "Mencegah mode Gaming berganti otomatis ke Do Not Disturb (DND) akibat sinkronisasi Windows Focus Assist. Mode tetap normal kecuali diganti sendiri oleh pengguna.",
        descEn: "Prevents Gaming Mode from unexpectedly flipping to DND due to Windows Focus Assist sync. Default mode remains normal unless manually switched.",
        badge: "fix",
      },
      {
        icon: <Palette size={14} />,
        titleId: "Kustomisasi Warna Notch & Teks Idle",
        titleEn: "Custom Idle Notch & Text Colors",
        descId: "Bebas kustomisasi warna latar notch idle (termasuk palet preset Taskbar Windows) serta warna teks dan angka indikator secara terpisah dengan pratinjau langsung.",
        descEn: "Freely customize idle notch background color (including Windows Taskbar preset palettes) and separately style text and metric numbers with live preview.",
        badge: "new",
      },
      {
        icon: <Minimize2 size={14} />,
        titleId: "Auto-Compact Mode: Pilihan Semua App Max",
        titleEn: "Auto-Compact Mode: All Max Apps Option",
        descId: "Mode ringkas otomatis kini dilengkapi pilihan Semua App Max sehingga notch akan otomatis mengecil saat ada jendela aplikasi yang dimaksimalkan agar pandangan layar tetap lapang.",
        descEn: "Auto-compact mode now features an All Max Apps trigger so the notch automatically shrinks whenever any application window is maximized to keep your view unobstructed.",
        badge: "new",
      },
      {
        icon: <Layers size={14} />,
        titleId: "Dukungan Dual Monitor di Semua Layar",
        titleEn: "Dual Monitor Support on All Displays",
        descId: "Gili Notch kini dapat aktif dan berjalan di semua layar monitor yang terhubung secara bersamaan lewat opsi Semua Layar (Notch Ganda) pada Pengaturan Monitor.",
        descEn: "Gili Notch can now run seamlessly across all connected monitors simultaneously via the All Displays (Dual Notch) option in Monitor Settings.",
        badge: "new",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Perbaikan Menu Dropdown Mode Notch",
        titleEn: "Notch Mode Dropdown Fix",
        descId: "Memperbaiki menu dropdown Mode di Control Center Notch agar tidak tenggelam atau terpotong di tepi bawah notch.",
        descEn: "Fixed the Mode dropdown menu in Notch Control Center so it stays fully visible and no longer gets clipped.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.3.2",
    date: "1 Nov 2026",
    highlights: [
      {
        icon: <Bug size={14} />,
        titleId: "Perbaikan Stabilitas Jendela Pengaturan",
        titleEn: "Settings Window Stability Fix",
        descId: "Memulihkan sepenuhnya kestabilan jendela Pengaturan dengan menghapus pembatasan proses WebView2 dan mengembalikan siklus hidup sinkron bebas crash.",
        descEn: "Completely restored Settings window stability by eliminating WebView2 process limits and restoring synchronous crash-free lifecycle.",
        badge: "fix",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Dukungan Dual Monitor & Pintasan Layar",
        titleEn: "Dual Monitor Support & Display Shortcut",
        descId: "Pindai otomatis seluruh layar yang terhubung dan pindahkan posisi Gili Notch antar monitor secara instan, baik melalui pemilih di menu Pengaturan Tampilan maupun pintasan keyboard global (Control+Alt+M) dengan notifikasi HUD nama & resolusi monitor.",
        descEn: "Automatically detects all connected displays and moves Gili Notch between screens instantly, via the Appearance settings selector or the new global shortcut (Control+Alt+M) with resolution HUD feedback.",
        badge: "new",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Pencegahan Notch Terbuka Kembali Saat Menutup",
        titleEn: "Prevent Re-opening During Collapse Animation",
        descId: "Memperbaiki interaksi kursor di mana gerakan mouse yang melintasi area bekas tab saat notch sedang dalam proses animasi menutup tidak akan membuka kembali notch secara tidak sengaja.",
        descEn: "Fixed cursor interaction where moving the mouse across former tab bounds during the collapse animation no longer accidentally re-triggers opening.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.3.0",
    date: "31 Okt 2026",
    highlights: [
      {
        icon: <SlidersHorizontal size={14} />,
        titleId: "Custom Transparansi & Slider Blur Terpisah",
        titleEn: "Custom Transparency & Independent Blur Slider",
        descId: "Atur tingkat transparansi dan keburaman latar secara mandiri dengan difusi kaca optik yang halus tanpa kabut susu atau bintik kasar.",
        descEn: "Independently adjust transparency and background blur with smooth optical glass diffusion free from milky fog or coarse grain.",
        badge: "new",
      },
      {
        icon: <Music size={14} />,
        titleId: "Dukungan Transparansi pada Tab Musik",
        titleEn: "Transparency Support on Music Tab",
        descId: "Tab musik kini ikut mengikuti pengaturan transparansi dan blur dengan efek pendaran cover album native SVG beresolusi penuh.",
        descEn: "Music tab now follows custom transparency and blur settings while preserving rich, full-resolution native SVG ambient glow.",
        badge: "new",
      },
      {
        icon: <Eye size={14} />,
        titleId: "Toolbar Pratinjau Tab Langsung di Pengaturan",
        titleEn: "Live Tab Preview Toolbar in Settings",
        descId: "Buka dan intip tab Control Center, Monitor Sistem, dan Pemutar Musik secara langsung di Notch saat sedang menyesuaikan tampilan.",
        descEn: "Directly open and preview Control Center, System Monitor, and Music player tabs on the Notch while fine-tuning appearance.",
        badge: "new",
      },
      {
        icon: <Monitor size={14} />,
        titleId: "Dukungan Multi-Monitor & Pemilih Layar",
        titleEn: "Multi-Monitor Support & Display Selector",
        descId: "Pindai otomatis seluruh layar yang terhubung dan pilih dengan bebas monitor mana yang ingin digunakan untuk menampilkan Gili Notch.",
        descEn: "Automatically scans all connected displays and allows you to freely select which monitor hosts Gili Notch.",
        badge: "new",
      },
      {
        icon: <LayoutGrid size={14} />,
        titleId: "8 Pilihan Posisi Fleksibel Notch di Layar",
        titleEn: "8 Flexible Notch Screen Positions",
        descId: "Pilih posisi Notch di 8 titik layar (Atas Tengah, Bawah Tengah, Kiri, Kanan, serta 4 Sudut Layar) lengkap dengan selector pratinjau visual interaktif.",
        descEn: "Position the Notch across 8 screen locations (Top Center, Bottom Center, Left, Right, and all 4 corners) with an interactive visual preview selector.",
        badge: "new",
      },
      {
        icon: <Maximize2 size={14} />,
        titleId: "Ukuran Tab Konsisten & Terpadu",
        titleEn: "Consistent & Unified Tab Sizing",
        descId: "Setiap tab kini memiliki dimensi lebar dan tinggi yang seragam serta proporsional saat berpindah, menciptakan transisi antar widget yang jauh lebih mulus tanpa lonjakan ukuran.",
        descEn: "All tabs now share standardized, uniform dimensions when switching, creating far smoother transitions without jarring size jumps.",
        badge: "improve",
      },
      {
        icon: <Cpu size={14} />,
        titleId: "Pengurangan Penggunaan CPU, GPU & RAM",
        titleEn: "Reduced CPU, GPU & Memory Usage",
        descId: "Efisiensi rendering tinggi dengan interpolasi vektor GPU native, pembersihan otomatis working set memori, dan zero-overhead saat notch dalam keadaan idle.",
        descEn: "High rendering efficiency via native GPU vector interpolation, automatic memory working set trimming, and zero overhead when the notch is idle.",
        badge: "improve",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Inner Card Blur & Optimalisasi Kaca",
        titleEn: "Inner Card Blur & Glass Optimizations",
        descId: "Kartu-kartu interior di dalam tab kini me-blur lapisan gradien di bawahnya untuk keterbacaan teks dan angka yang maksimal.",
        descEn: "Interior cards inside tabs now blur underlying gradients for maximum text and metric legibility.",
        badge: "improve",
      },
    ],
  },
  {
    version: "4.2.5",
    date: "30 Okt 2026",
    highlights: [
      {
        icon: <Repeat size={14} />,
        titleId: "Repeat Task di Quick Todo",
        titleEn: "Repeat Task in Quick Todo",
        descId: "Pilih aturan pengulangan (Harian, Hari Kerja, Mingguan, Bulanan) langsung dari jendela tambah cepat.",
        descEn: "Set repeat rules (Daily, Weekdays, Weekly, Monthly) directly from the quick-add window.",
        badge: "new",
      },
      {
        icon: <CheckSquare size={14} />,
        titleId: "Fix: Bagian Repeat Kepotong di Detail Todo",
        titleEn: "Fix: Repeat Section Cut Off in Todo Detail",
        descId: "Section Repeat di form detail todo tidak lagi terpotong di bagian bawah dan sekarang bisa di-scroll dengan leluasa.",
        descEn: "The Repeat section in the todo detail form is no longer clipped at the bottom and is now fully scrollable.",
        badge: "fix",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Halaman Tentang & Perubahan",
        titleEn: "About & Changelog Page",
        descId: "Info lengkap aplikasi dan riwayat pembaruan yang terbuka otomatis saat instalasi baru atau setelah update.",
        descEn: "Complete app information and update history that opens automatically on fresh install or after an update.",
        badge: "new",
      },
    ],
  },
  {
    version: "4.2.4",
    date: "30 Okt 2026",
    highlights: [
      {
        icon: <Repeat size={14} />,
        titleId: "Sistem Repeat Task di Todo",
        titleEn: "Repeat Task System in Todo",
        descId: "Tandai task sebagai berulang (Harian, Hari Kerja, Mingguan, Bulanan). Task baru otomatis dibuat saat yang lama selesai.",
        descEn: "Mark tasks as recurring (Daily, Weekdays, Weekly, Monthly). A new task is auto-spawned when the current one is completed.",
        badge: "new",
      },
      {
        icon: <MessageSquare size={14} />,
        titleId: "Quick Note: Shift+Enter untuk Baris Baru",
        titleEn: "Quick Note: Shift+Enter for New Line",
        descId: "Di Quick Note, tekan Shift+Enter untuk pindah baris, dan tekan Enter untuk menyimpan.",
        descEn: "In Quick Note, press Shift+Enter for a new line and Enter alone to save.",
        badge: "new",
      },
      {
        icon: <Maximize2 size={14} />,
        titleId: "Optimasi Monitor Ultrawide",
        titleEn: "Ultrawide Monitor Optimization",
        descId: "Stroke tipis pada notch mode solid agar tampilan lebih bersih di monitor lebar.",
        descEn: "Thin hairline stroke on solid notch mode for a cleaner look on wide monitors.",
        badge: "improve",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Fix: Panel Control Center di Tab Wide",
        titleEn: "Fix: Control Center Panel on Wide Tab",
        descId: "Panel tidak lagi terlihat terpotong saat ukuran tab dalam kondisi wide.",
        descEn: "Panel no longer appears clipped when tab size is set to wide.",
        badge: "fix",
      },
    ],
  },
  {
    version: "4.2.3",
    date: "Okt 2026",
    highlights: [
      {
        icon: <ScanText size={14} />,
        titleId: "Sistem OCR: Copy Image to Text",
        titleEn: "OCR System: Copy Image to Text",
        descId: "Fitur OCR untuk mengekstrak teks dari gambar di clipboard. Bisa diatur di menu Pengaturan > Modul.",
        descEn: "OCR feature to extract text from images in clipboard. Toggle it in Settings > Modules.",
        badge: "new",
      },
      {
        icon: <Zap size={14} />,
        titleId: "Peningkatan Performa Umum",
        titleEn: "General Performance Improvements",
        descId: "Berbagai optimasi internal untuk animasi yang lebih halus dan konsumsi memori lebih ringan.",
        descEn: "Various internal optimizations for smoother animations and lower memory usage.",
        badge: "improve",
      },
    ],
  },
];

const BADGE_STYLE: Record<string, string> = {
  new: "bg-[#30d158]/15 text-[#30d158]",
  fix: "bg-[#ff9f0a]/15 text-[#ff9f0a]",
  improve: "bg-[#0a84ff]/15 text-[#8db8ff]",
};

const BADGE_LABEL_ID: Record<string, string> = {
  new: "Baru",
  fix: "Perbaikan",
  improve: "Peningkatan",
};

const BADGE_LABEL_EN: Record<string, string> = {
  new: "New",
  fix: "Fix",
  improve: "Improved",
};

interface AboutViewProps {
  appVersion: string;
  optLanguage: Language;
  isLightMode: boolean;
}

export const AboutView: React.FC<AboutViewProps> = ({ appVersion, optLanguage, isLightMode }) => {
  const isId = optLanguage === "id";
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set([CHANGELOG[0].version]));

  const toggle = (v: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const cardBase = isLightMode
    ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]";

  return (
    <div className="flex flex-col gap-5 w-full pb-4">
      {/* App Identity Card */}
      <div className={`w-full rounded-[18px] p-5 flex flex-col gap-4 ${cardBase}`}>
        <div className="flex items-center gap-5">
          <img
            src="/logo/LOGO-GILI.png"
            alt="Gili"
            draggable={false}
            className="w-16 h-16 rounded-[18px] object-contain shadow-[0_8px_24px_rgba(0,0,0,0.35)] shrink-0"
          />
          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
            <div className="flex items-baseline gap-2.5">
              <span className={`text-[22px] font-bold tracking-tight ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                Gili Island
              </span>
              <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${isLightMode ? "bg-black/[0.06] text-neutral-500" : "bg-white/[0.08] text-zinc-400"}`}>
                v{appVersion}
              </span>
            </div>
            <p className={`text-[12.5px] leading-snug ${isLightMode ? "text-neutral-600" : "text-zinc-400"}`}>
              {isId
                ? "Notch bar cerdas untuk Windows. Menghadirkan widget media, to-do list, catatan cepat, timer, dan berbagai utilitas dalam satu tempat elegan."
                : "A smart notch bar for Windows. Media controls, to-dos, quick notes, timers, and essential utilities in one elegant surface."}
            </p>
            <div className={`flex items-center gap-1 mt-1.5 text-[12px] font-medium ${isLightMode ? "text-neutral-500" : "text-zinc-500"}`}>
              <span>{isId ? "Dibuat oleh" : "Made by"}</span>
              <button
                type="button"
                onClick={() => openUrl("https://instagram.com/faizngraha").catch(() => {})}
                className={`flex items-center gap-1 font-semibold transition-colors cursor-pointer ${isLightMode ? "text-[#0a84ff] hover:text-[#0070e0]" : "text-[#8db8ff] hover:text-white"}`}
              >
                Faiz Nugraha (@faizngraha)
                <ExternalLink size={11} />
              </button>
            </div>
          </div>
        </div>

        <div
          className={`pt-3.5 border-t flex items-center justify-between gap-3 flex-wrap ${
            isLightMode ? "border-black/[0.06]" : "border-white/[0.06]"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 border ${
                isLightMode
                  ? "bg-[#5865F2]/10 border-[#5865F2]/20"
                  : "bg-[#5865F2]/15 border-[#5865F2]/25"
              }`}
            >
              <img
                src="/logo/discord.webp"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`text-[12.5px] font-semibold leading-tight ${
                  isLightMode ? "text-neutral-800" : "text-zinc-100"
                }`}
              >
                {isId ? "Komunitas Discord Gili" : "Gili Discord Community"}
              </span>
              <span
                className={`text-[11.5px] leading-snug ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                {isId
                  ? "Yuk gabung buat diskusi, request fitur, laporan bug, & info update."
                  : "Join to share feedback, request features, report bugs, and catch updates."}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openUrl("https://discord.gg/tCtQSa5H").catch(() => {})}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[10px] text-[12px] font-semibold transition-colors cursor-pointer shrink-0 bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-sm"
          >
            <span>{isId ? "Gabung Discord" : "Join Discord"}</span>
            <ExternalLink size={11} />
          </button>
        </div>
      </div>

      {/* What's New Section */}
      <div className="flex flex-col gap-2">
        <h2 className={`text-[13px] font-bold tracking-tight px-1 ${isLightMode ? "text-neutral-900" : "text-white"}`}>
          {isId ? "Yang Baru" : "What's New"}
        </h2>

        <div className="flex flex-col gap-2">
          {CHANGELOG.map((entry, entryIdx) => {
            const isExpanded = expandedVersions.has(entry.version);
            const isLatest = entryIdx === 0;

            return (
              <div key={entry.version} className={`w-full rounded-[18px] overflow-hidden ${cardBase}`}>
                {/* Version Header */}
                <button
                  type="button"
                  onClick={() => toggle(entry.version)}
                  className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isLightMode ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.03]"}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[14px] font-bold tracking-tight ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                      v{entry.version}
                    </span>
                    {isLatest && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0a84ff] text-white tracking-wide uppercase">
                        {isId ? "Terbaru" : "Latest"}
                      </span>
                    )}
                    <span className={`text-[11.5px] ${isLightMode ? "text-neutral-400" : "text-zinc-500"}`}>
                      {entry.date}
                    </span>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={14} className={isLightMode ? "text-neutral-400" : "text-zinc-500"} />
                    : <ChevronDown size={14} className={isLightMode ? "text-neutral-400" : "text-zinc-500"} />
                  }
                </button>

                {/* Changelog Items */}
                {isExpanded && (
                  <div className={`flex flex-col divide-y ${isLightMode ? "divide-black/[0.06]" : "divide-white/[0.05]"}`}>
                    {entry.highlights.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 px-4 py-3">
                        <div className={`w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 mt-0.5 ${isLightMode ? "bg-black/[0.05] text-neutral-600" : "bg-white/[0.07] text-zinc-300"}`}>
                          {item.icon}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[12.5px] font-semibold leading-tight ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                              {isId ? item.titleId : item.titleEn}
                            </span>
                            {item.badge && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wide uppercase ${BADGE_STYLE[item.badge]}`}>
                                {isId ? BADGE_LABEL_ID[item.badge] : BADGE_LABEL_EN[item.badge]}
                              </span>
                            )}
                          </div>
                          <p className={`text-[11.5px] leading-snug ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                            {isId ? item.descId : item.descEn}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Note */}
      <div className={`w-full rounded-[18px] p-4 flex items-center justify-center text-center ${cardBase}`}>
        <span className={`text-[12px] font-medium ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
          {isId ? "Terima kasih sudah menggunakan Gili" : "Thank you for using Gili"}
        </span>
      </div>
    </div>
  );
};
