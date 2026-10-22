export type Language = "en" | "id";

export const translations = {
  // Navigation / Tabs
  tab_now_playing: { en: "Now Playing", id: "Sedang Diputar" },
  tab_control_center: { en: "Control Center", id: "Pusat Kontrol" },
  tab_todo_list: { en: "To-Do List", id: "Daftar Tugas" },
  tab_file_shelf: { en: "File Shelf", id: "Rak Berkas" },
  tab_clipboard: { en: "Clipboard", id: "Papan Klip" },
  tab_volume_mixer: { en: "Volume Mixer", id: "Mixer Volume" },
  tab_settings: { en: "Settings", id: "Pengaturan" },
  nav_prev: { en: "Prev", id: "Sebelumnya" },
  nav_next: { en: "Next", id: "Berikutnya" },
  nav_back: { en: "Back", id: "Kembali" },

  // Settings Panel - General
  settings_general: { en: "General", id: "Umum" },
  settings_language: { en: "Language", id: "Bahasa" },
  settings_language_desc: { en: "Interface language", id: "Bahasa tampilan" },
  settings_auto_compact: { en: "Auto Compact", id: "Auto Compact" },
  settings_auto_compact_desc: { en: "Shrink when browser is active", id: "Mengecil saat browser aktif" },
  settings_autostart: { en: "Run on Startup", id: "Jalankan saat Startup" },
  settings_greeting: { en: "Boot Greeting", id: "Sambutan saat Boot" },
  settings_updates: { en: "Software Update", id: "Pembaruan Perangkat Lunak" },
  settings_updates_desc: { en: "Keep Notch updated automatically", id: "Selalu perbarui Notch otomatis" },
  settings_check_update: { en: "Check for Updates", id: "Periksa Pembaruan" },
  settings_checking_update: { en: "Checking...", id: "Memeriksa..." },
  settings_update_available: { en: "Update Available", id: "Pembaruan Tersedia" },
  settings_update_now: { en: "Update Now", id: "Perbarui Sekarang" },
  settings_update_downloading: { en: "Downloading update...", id: "Mengunduh pembaruan..." },
  settings_update_installing: { en: "Installing...", id: "Memasang..." },
  settings_update_latest: { en: "Up to date", id: "Versi terbaru" },
  settings_update_error: { en: "Check failed", id: "Gagal memeriksa" },
  settings_notif_duration: { en: "Notif Duration", id: "Durasi Notifikasi" },
  settings_close_delay: { en: "Panel Close Delay", id: "Delay Tutup Panel" },
  settings_close_delay_desc: { en: "Auto-close when cursor leaves", id: "Tutup otomatis saat kursor keluar" },
  settings_close_delay_none: { en: "No Delay", id: "No Delay" },
  settings_close_delay_never: { en: "Never", id: "Never" },
  settings_close_delay_tip_0: { en: "Close immediately when cursor leaves", id: "Langsung tutup saat kursor keluar" },
  settings_close_delay_tip_1: { en: "Close 1 second after cursor leaves", id: "Tutup 1 detik setelah kursor keluar" },
  settings_close_delay_tip_3: { en: "Close 3 seconds after cursor leaves", id: "Tutup 3 detik setelah kursor keluar" },
  settings_close_delay_tip_never: { en: "Stay open until you click outside", id: "Tetap buka sampai klik di luar Notch" },
  settings_weather_location: { en: "Weather Location", id: "Lokasi Cuaca" },
  settings_weather_location_desc: { en: "Forecast location (GPS, IP, or custom)", id: "Lokasi cuaca (GPS, IP, atau pilihan kota)" },
  settings_weather_mode_auto: { en: "Auto (GPS/IP)", id: "Otomatis (GPS/IP)" },
  settings_weather_search_placeholder: { en: "Search city (e.g. Jakarta, Bandung)...", id: "Cari kota (mis. Jakarta, Bandung)..." },
  settings_weather_reset_auto: { en: "Use Auto", id: "Gunakan Otomatis" },
  settings_weather_searching: { en: "Searching...", id: "Mencari..." },
  settings_weather_no_results: { en: "No cities found", id: "Kota tidak ditemukan" },
  settings_weather_custom_active: { en: "Custom", id: "Manual" },

  // Onboarding
  onboarding_title: { en: "Welcome to Notch", id: "Selamat Datang di Notch" },
  onboarding_subtitle: { en: "Choose how Notch detects your weather location", id: "Pilih cara Notch mendeteksi cuaca kotamu" },
  onboarding_auto_title: { en: "Automatic (GPS / IP)", id: "Otomatis (GPS / IP)" },
  onboarding_auto_desc: { en: "Seamless detection without setup", id: "Deteksi otomatis tanpa repot" },
  onboarding_auto_badge: { en: "Recommended", id: "Rekomendasi" },
  onboarding_manual_title: { en: "Search City", id: "Pilih Kota Sendiri" },
  onboarding_manual_desc: { en: "Pick and lock your exact city", id: "Cari kotamu secara spesifik" },
  onboarding_skip: { en: "Skip for now", id: "Nanti saja" },
  onboarding_back: { en: "Back", id: "Kembali" },
  settings_weather_restart_onboarding: { en: "Restart Welcome Setup", id: "Ulangi Setup Awal" },

  // Settings Panel - Appearance
  settings_appearance: { en: "Appearance", id: "Tampilan" },
  settings_mode: { en: "Theme Mode", id: "Mode Tema" },
  settings_mode_dark: { en: "Dark", id: "Gelap" },
  settings_mode_light: { en: "Light", id: "Terang" },
  settings_mode_auto: { en: "Auto", id: "Sistem" },
  settings_mode_dark_tip: { en: "Classic dark theme", id: "Tema gelap klasik" },
  settings_mode_light_tip: { en: "Frosted white glass", id: "Kaca terang frosted" },
  settings_mode_auto_tip: { en: "Follow Windows system theme", id: "Ikuti tema sistem Windows" },
  settings_idle_size: { en: "Idle Size", id: "Ukuran Idle" },
  settings_idle_slot: { en: "Customize Idle Content", id: "Kustomisasi Isi Idle" },
  settings_idle_slot_desc: { en: "Choose items & positions (Left, Center, Right)", id: "Pilih item & posisi (Kiri, Tengah, Kanan)" },
  settings_idle_customize_btn: { en: "Customize", id: "Atur" },
  settings_idle_preview_label: { en: "LIVE IDLE PREVIEW (CLICK SLOT TO EDIT)", id: "PREVIEW IDLE (KLIK SLOT UNTUK UBAH)" },
  settings_idle_pos_left: { en: "Left", id: "Kiri" },
  settings_idle_pos_center: { en: "Center", id: "Tengah" },
  settings_idle_pos_right: { en: "Right", id: "Kanan" },
  settings_idle_swap_lr: { en: "Swap Left ↔ Right", id: "Tukar Kiri ↔ Kanan" },
  settings_idle_reset: { en: "Reset", id: "Reset" },
  settings_idle_pick_for: { en: "Select item for {pos} slot:", id: "Pilih isi untuk slot {pos}:" },
  settings_slot_battery: { en: "Battery", id: "Baterai" },
  settings_slot_clock: { en: "Clock", id: "Jam" },
  settings_slot_date: { en: "Date", id: "Tanggal" },
  settings_slot_smart: { en: "Smart", id: "Pintar" },
  settings_slot_ping: { en: "Ping", id: "Ping" },
  settings_slot_weather: { en: "Weather", id: "Cuaca" },
  settings_slot_todo: { en: "To-Do", id: "Tugas" },
  settings_slot_fps: { en: "FPS", id: "FPS" },
  settings_slot_none: { en: "Empty", id: "Kosong" },
  settings_slot_tip_date: { en: "Show short date (e.g. Wed, 21)", id: "Tampilkan tanggal singkat (mis. Rab, 21)" },
  settings_slot_tip_smart: { en: "Auto show To-Do, Shelf, Focus, or Date", id: "Otomatis tampilkan Tugas, File, Fokus, atau Tanggal" },
  settings_slot_tip_ping: { en: "Show live network latency (ms)", id: "Tampilkan ping jaringan real-time (ms)" },
  settings_slot_tip_weather: { en: "Show weather & temperature", id: "Tampilkan ikon & suhu cuaca" },
  settings_slot_tip_none: { en: "Hide this slot", id: "Sembunyikan slot ini" },
  settings_idle_compact: { en: "Compact", id: "Kecil" },
  settings_idle_default: { en: "Normal", id: "Normal" },
  settings_idle_large: { en: "Large", id: "Besar" },
  settings_idle_tip_compact: { en: "Compact idle notch (90%)", id: "Notch idle kecil (90%)" },
  settings_idle_tip_default: { en: "Standard idle notch (100%)", id: "Notch idle standar (100%)" },
  settings_idle_tip_large: { en: "Large idle notch (110%)", id: "Notch idle besar (110%)" },
  settings_tab_size: { en: "Tab Panel Size", id: "Ukuran Panel Tab" },
  settings_tab_compact: { en: "Compact", id: "Ringkas" },
  settings_tab_default: { en: "Normal", id: "Normal" },
  settings_tab_large: { en: "Wide", id: "Luas" },
  settings_tab_tip_compact: { en: "Compact panels (400px)", id: "Panel ringkas (400px)" },
  settings_tab_tip_default: { en: "Standard panels (440px)", id: "Panel standar (440px)" },
  settings_tab_tip_large: { en: "Wide panels (480px)", id: "Panel luas (480px)" },
  settings_font_size: { en: "Font Size", id: "Ukuran Font" },
  settings_font_small: { en: "Small", id: "Kecil" },
  settings_font_default: { en: "Normal", id: "Normal" },
  settings_font_large: { en: "Large", id: "Besar" },
  settings_font_tip_small: { en: "Small text scale (92%)", id: "Skala teks kecil (92%)" },
  settings_font_tip_default: { en: "Normal text scale (100%)", id: "Skala teks normal (100%)" },
  settings_font_tip_large: { en: "Large text scale (108%)", id: "Skala teks besar (108%)" },
  settings_ears: { en: "Notch Ears", id: "Telinga Notch" },
  settings_weather_anim: { en: "Weather Animation", id: "Animasi Cuaca" },
  settings_weather_anim_desc: { en: "Rain, snow & lightning effects", id: "Efek hujan, salju & petir di Notch" },
  settings_position: { en: "Position", id: "Posisi" },
  settings_pos_top: { en: "Top", id: "Atas" },
  settings_pos_bottom: { en: "Bottom", id: "Bawah" },
  settings_pos_top_tip: { en: "Top of screen", id: "Posisi atas layar" },
  settings_pos_bottom_tip: { en: "Bottom of screen", id: "Posisi bawah layar" },
  settings_transparency: { en: "Transparency", id: "Transparansi" },
  settings_theme_solid: { en: "Solid", id: "Solid" },
  settings_theme_glass: { en: "Glass", id: "Glass" },
  settings_theme_clear: { en: "Clear", id: "Clear" },
  settings_theme_solid_tip: { en: "Solid dark theme", id: "Tema gelap solid" },
  settings_theme_glass_tip: { en: "Glassmorphism blur", id: "Tema glassmorphism" },
  settings_theme_clear_tip: { en: "High transparency", id: "Transparansi tinggi" },
  settings_animations: { en: "Animations", id: "Animasi" },
  settings_anim_snappy: { en: "Snappy", id: "Snappy" },
  settings_anim_smooth: { en: "Smooth", id: "Smooth" },
  settings_anim_bouncy: { en: "Bouncy", id: "Bouncy" },
  settings_anim_snappy_tip: { en: "Fast & responsive", id: "Cepat & responsif" },
  settings_anim_smooth_tip: { en: "Gentle spring", id: "Pegas lembut" },
  settings_anim_bouncy_tip: { en: "Bouncy spring", id: "Animasi memantul" },

  // Settings Panel - Modules
  settings_modules: { en: "Modules", id: "Modul" },
  settings_volume_monitor: { en: "Volume Monitor", id: "Monitor Volume" },
  settings_clipboard_monitor: { en: "Clipboard Monitor", id: "Monitor Clipboard" },
  settings_media_player: { en: "Media Player", id: "Pemutar Media" },

  // Control Center
  cc_focus_normal: { en: "Normal", id: "Normal" },
  cc_focus_dnd: { en: "Do Not Disturb", id: "Jangan Ganggu" },
  cc_focus_gaming: { en: "Gaming Mode", id: "Mode Game" },
  cc_focus_sleep: { en: "Sleep Mode", id: "Mode Tidur" },
  cc_focus_normal_desc: { en: "All notifications active", id: "Semua notifikasi aktif" },
  cc_focus_dnd_desc: { en: "Mute sound & alerts", id: "Senyapkan suara & notifikasi" },
  cc_focus_gaming_desc: { en: "High performance", id: "Performa tinggi aktif" },
  cc_focus_sleep_desc: { en: "Dim & silent night", id: "Redup & mode malam" },
  cc_power_eco: { en: "Eco", id: "Hemat" },
  cc_power_balanced: { en: "Balanced", id: "Seimbang" },
  cc_power_performance: { en: "Performance", id: "Performa" },
  cc_brightness: { en: "Brightness", id: "Kecerahan" },
  cc_brightness_mode: { en: "Brightness Mode", id: "Mode Kecerahan" },
  cc_volume: { en: "Volume", id: "Volume" },
  cc_hotspot: { en: "Mobile Hotspot", id: "Hotspot Portabel" },
  cc_hotspot_active: { en: "Active", id: "Aktif" },
  cc_hotspot_inactive: { en: "Inactive", id: "Nonaktif" },
  cc_hotspot_on: { en: "Opening Hotspot (Active)", id: "Membuka Hotspot (Aktif)" },
  cc_hotspot_off: { en: "Opening Hotspot (Inactive)", id: "Membuka Hotspot (Nonaktif)" },
  cc_screenshot: { en: "Screenshot Tool", id: "Alat Screenshot" },
  cc_lock_pc: { en: "Lock PC", id: "Kunci PC" },
  cc_sleep_pc: { en: "Sleep PC", id: "Tidurkan PC" },
  cc_restart_pc: { en: "Restart PC", id: "Mulai Ulang PC" },
  cc_shutdown_pc: { en: "Shut Down PC", id: "Matikan PC" },
  cc_wifi: { en: "Wi-Fi", id: "Wi-Fi" },
  cc_wifi_settings: { en: "Wi-Fi Settings...", id: "Pengaturan Wi-Fi..." },
  cc_bluetooth: { en: "Bluetooth", id: "Bluetooth" },
  cc_bluetooth_settings: { en: "Bluetooth Settings...", id: "Pengaturan Bluetooth..." },
  cc_connected: { en: "Connected", id: "Terhubung" },
  cc_not_connected: { en: "Not Connected", id: "Tidak Terhubung" },
  cc_disconnect: { en: "Disconnect", id: "Putuskan" },
  cc_connect: { en: "Connect", id: "Hubungkan" },
  cc_connecting: { en: "Connecting...", id: "Menghubungkan..." },
  cc_known_networks: { en: "Known Networks", id: "Jaringan Tersimpan" },
  cc_other_networks: { en: "Other Networks", id: "Jaringan Lainnya" },
  cc_searching: { en: "Searching...", id: "Mencari..." },
  cc_no_networks: { en: "No networks found", id: "Tidak ada jaringan ditemukan" },
  cc_paired_devices: { en: "Paired Devices", id: "Perangkat Tersanding" },
  cc_no_devices: { en: "No devices found", id: "Tidak ada perangkat ditemukan" },
  cc_back: { en: "Back", id: "Kembali" },

  // To-Do List
  todo_title: { en: "To-Do List", id: "Daftar Tugas" },
  todo_placeholder: { en: "Add a new task...", id: "Tulis tugas baru..." },
  todo_empty: { en: "No tasks yet", id: "Belum ada catatan tugas" },
  todo_empty_sub: { en: "Click Add Task to start", id: "Klik Tambah Tugas untuk menambah" },
  todo_done_today: { en: "Tasks Completed Today", id: "Tugas Selesai Hari Ini" },
  todo_done: { en: "Done", id: "Selesai" },
  todo_add_task: { en: "Add Task", id: "Tambah Tugas" },
  todo_edit: { en: "Edit", id: "Edit" },
  todo_edit_tip: { en: "Edit task", id: "Edit nama tugas" },
  todo_delete_tip: { en: "Delete task", id: "Hapus tugas" },
  todo_pending: { en: "Pending", id: "Tertunda" },
  todo_completed: { en: "Completed", id: "Selesai" },
  todo_badge: { en: "To-Do", id: "Tugas" },
  todo_reminder_title: { en: "{count} Pending To-Do", id: "{count} Tugas Belum Selesai" },

  // File Shelf
  shelf_drop_title: { en: "Drop files to stash in Notch", id: "Lepas file untuk simpan ke Notch" },
  shelf_clear_all: { en: "Clear All", id: "Hapus Semua" },
  shelf_empty: { en: "Shelf is empty", id: "Rak berkas kosong" },
  shelf_empty_badge: { en: "Shelf Empty", id: "Shelf Kosong" },
  shelf_files_count: { en: "{count} Files Stashed", id: "{count} File Tersimpan" },
  shelf_swipe_tip: { en: "• Scroll to explore", id: "• Geser untuk melihat" },
  shelf_clear_btn: { en: "Clear", id: "Bersihkan" },
  shelf_drop_here: { en: "Drag & Drop Files Here", id: "Tarik & Lepas File ke Sini" },
  shelf_drop_desc: { en: "Previews will appear instantly, ready to drag to WhatsApp, Discord, or folders", id: "Preview gambar langsung tampil & siap ditarik ke WA, Discord, atau folder lain" },
  shelf_copied: { en: "Copied!", id: "Tersalin!" },
  shelf_explorer: { en: "Explorer", id: "Buka Folder" },
  shelf_delete: { en: "Delete", id: "Hapus" },
  shelf_empty_sub: { en: "Drag and drop files onto Notch to stash", id: "Tarik dan lepas file ke Notch untuk menyimpan" },
  shelf_file_saved_title: { en: "File Stashed in Shelf", id: "File Tersimpan di Shelf" },
  shelf_file_saved_body: { en: "{count} files ready to be moved from Notch", id: "{count} file siap dipindahkan dari Notch" },
  shelf_select_all: { en: "Select All", id: "Pilih Semua" },
  shelf_deselect_all: { en: "Deselect", id: "Batal Pilih" },
  shelf_selected_count: { en: "{count} selected", id: "{count} dipilih" },
  shelf_drag_all: { en: "Drag {count} Files", id: "Tarik {count} File" },
  shelf_delete_selected: { en: "Delete ({count})", id: "Hapus ({count})" },
  shelf_copied_all: { en: "Copied {count} files!", id: "{count} file tersalin!" },

  // Clipboard
  clipboard_title: { en: "Clipboard History", id: "Riwayat Papan Klip" },
  clipboard_clear: { en: "Clear All", id: "Hapus Semua" },
  clipboard_empty: { en: "No clipboard history", id: "Belum ada riwayat klip" },
  clipboard_copied: { en: "Copied to clipboard", id: "Disalin ke papan klip" },
  clipboard_search_placeholder: { en: "Spotlight Search...", id: "Pencarian Spotlight..." },
  clipboard_clear_btn: { en: "Clear", id: "Bersihkan" },
  clipboard_chars: { en: "{count} chars", id: "{count} karakter" },
  clipboard_copy_tip: { en: "Copy", id: "Salin" },
  clipboard_delete_tip: { en: "Delete", id: "Hapus" },
  clipboard_no_history: { en: "No Clipboard History", id: "Belum Ada Riwayat Klip" },
  clipboard_no_history_sub: { en: "Text or links you copy will automatically appear here", id: "Teks atau link yang disalin akan otomatis muncul di sini" },
  clipboard_no_results: { en: "No results found", id: "Tidak ada hasil ditemukan" },
  clipboard_no_results_sub: { en: "Try searching with different keywords", id: "Coba cari dengan kata kunci lain" },
  clipboard_just_now: { en: "Just now", id: "Baru saja" },
  clipboard_ago_s: { en: "{s}s ago", id: "{s}dtk lalu" },
  clipboard_ago_m: { en: "{m}m ago", id: "{m}mnt lalu" },
  clipboard_ago_h: { en: "{h}h ago", id: "{h}jam lalu" },

  // Volume Mixer
  mixer_title: { en: "Volume Mixer", id: "Mixer Volume" },
  mixer_master: { en: "Master Output", id: "Output Utama" },
  mixer_system_sound: { en: "System Sound", id: "Suara Sistem" },
  mixer_apps: { en: "App Volumes", id: "Volume Aplikasi" },
  mixer_empty: { en: "No active audio sources", id: "Tidak ada aplikasi pemutar suara" },

  // Lyrics
  media_prev: { en: "Previous", id: "Sebelumnya" },
  media_play: { en: "Play", id: "Putar" },
  media_pause: { en: "Pause", id: "Jeda" },
  media_next: { en: "Next", id: "Berikutnya" },
  lyrics_title: { en: "Lyrics", id: "Lirik" },
  lyrics_live_sync: { en: "Live Sync", id: "Live Sync" },
  lyrics_searching: { en: "Searching lyrics...", id: "Mencari lirik..." },
  lyrics_not_found: { en: "Lyrics not found", id: "Lirik tidak ditemukan" },
  lyrics_instrumental: { en: "Instrumental Track", id: "Lagu Instrumental" },
  lyrics_instrumental_sub: { en: "No vocal lyrics on this track", id: "Tidak ada lirik vokal pada trek ini" },
  lyrics_advance: { en: "Advance lyrics (-0.2s)", id: "Percepat lirik (-0.2s)" },
  lyrics_delay: { en: "Delay lyrics (+0.2s)", id: "Lambatkan lirik (+0.2s)" },
  lyrics_reset_offset: { en: "Reset sync offset (default 0.0s)", id: "Reset offset sinkronisasi (default 0.0s)" },
  lyrics_idle_instrumental: { en: "♪ Instrumental Track ♪", id: "♪ Lagu Instrumental ♪" },

  // System & Greetings
  greeting_welcome: { en: "Welcome back", id: "Selamat datang kembali" },
  greeting_evening: { en: "Good evening", id: "Selamat malam" },
  greeting_morning: { en: "Good morning", id: "Selamat pagi" },
  greeting_afternoon: { en: "Good afternoon", id: "Selamat siang" },

  // OCR & Notifications
  notif_ocr_detected: { en: "Text Detected!", id: "Teks terdeteksi!" },
  notif_ocr_click_to_copy: { en: "Click to copy text", id: "Klik untuk menyalin teks" },
  notif_ocr_copied: { en: "Text copied successfully!", id: "Teks berhasil disalin!" },
  notif_copied_clipboard: { en: "Copied to Clipboard", id: "Disalin ke Papan Klip" },
  notif_charging: { en: "Charging", id: "Mengisi Daya" },
  notif_fully_charged: { en: "Fully Charged", id: "Baterai Penuh" },
  notif_on_battery: { en: "On Battery", id: "Menggunakan Baterai" },
  notif_battery_remaining: { en: "{percent}% remaining", id: "Tersisa {percent}%" },
  notif_connected: { en: "Connected", id: "Terhubung" },
  notif_caps_on: { en: "Caps Lock: ON", id: "Caps Lock: AKTIF" },
  notif_caps_off: { en: "Caps Lock: OFF", id: "Caps Lock: NONAKTIF" },
} as const;

export type TranslationKey = keyof typeof translations;

export function getLanguage(): Language {
  try {
    const saved = localStorage.getItem("island_language");
    if (saved === "en" || saved === "id") return saved;
  } catch {}

  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("id")) {
    return "id";
  }
  return "en";
}

export function setLanguage(lang: Language, autoReload = false) {
  try {
    localStorage.setItem("island_language", lang);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("island_language_changed", { detail: lang }));
    }
  } catch {}

  if (autoReload && typeof window !== "undefined") {
    setTimeout(() => {
      window.location.reload();
    }, 150);
  }
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const lang = getLanguage();
  const entry = translations[key];
  if (!entry) return key;

  let text: string = entry[lang] || entry["en"] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}
