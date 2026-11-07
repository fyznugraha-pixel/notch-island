import React, { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp, Repeat, ScanText, Maximize2, Bug, Zap, MessageSquare, CheckSquare, SlidersHorizontal, Music, Eye, Cpu, LayoutGrid, Monitor, Smartphone, Palette, Layers, Minimize2, Smile, Bell, FolderDown, Gamepad2, MousePointerClick, Moon, MapPin, BellOff, AppWindow } from "lucide-react";
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
    version: "4.5.0",
    date: "7 Nov 2026",
    highlights: [
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
        titleId: "Mini Player Desktop & Lirik Interaktif",
        titleEn: "Desktop Mini Player & Interactive Lyrics",
        descId: "Putar dan nikmati musik langsung di desktop dengan mode bar ringkas atau kartu, lirik tersinkronisasi real-time yang interaktif (klik baris untuk lompat lagu & scroll wheel), kalibrasi offset, serta integrasi drag-to-notch.",
        descEn: "Play and enjoy music on your desktop with compact bar or card modes, interactive real-time synchronized lyrics (click lines to seek & mouse wheel scroll), offset calibration, and drag-to-notch integration.",
        badge: "new",
      },
      {
        icon: <MousePointerClick size={14} />,
        titleId: "Navigasi Tab Roda Mouse di Bagian Header",
        titleEn: "Mouse Wheel Tab Switching on Header Bar",
        descId: "Beralih antar tab secara cepat dan mulus cukup dengan memutar roda wheel mouse (scroll atas/bawah) di area baris header seluruh tab.",
        descEn: "Quickly and smoothly switch between tabs simply by rolling your mouse wheel (scroll up/down) anywhere over the header bar across all tabs.",
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
    ? "bg-white/85 border border-black/10 shadow-sm"
    : "bg-[#111114] border border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.5)]";

  return (
    <div className="flex flex-col gap-5 w-full pb-4">
      {/* App Identity Card */}
      <div className={`w-full rounded-[22px] p-5 flex items-center gap-5 ${cardBase}`}>
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
