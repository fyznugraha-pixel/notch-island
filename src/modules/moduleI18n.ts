import type { Language } from "../services/i18n";
import type { NavbarModuleCategory } from "./types";

export interface ModuleLocaleCopy {
  name: { en: string; id: string };
  description: { en: string; id: string };
}

export const MODULE_CATEGORY_LABELS: Record<NavbarModuleCategory, { en: string; id: string }> = {
  all: { en: "All", id: "Semua" },
  Produktif: { en: "Productivity", id: "Produktif" },
  Sistem: { en: "System", id: "Sistem" },
  "Media & estetika": { en: "Media & Aesthetic", id: "Media & estetika" },
  "Gaya hidup": { en: "Lifestyle", id: "Gaya hidup" },
};

export function getLocalizedCategoryLabel(
  category: NavbarModuleCategory | string,
  lang: Language
): string {
  const entry = MODULE_CATEGORY_LABELS[category as NavbarModuleCategory];
  if (!entry) return category;
  return lang === "id" ? entry.id : entry.en;
}

export const MODULE_CATALOG_I18N: Record<string, ModuleLocaleCopy> = {
  acara_berikutnya: {
    name: { en: "Next event", id: "Acara berikutnya" },
    description: {
      en: "Upcoming calendar meetings and deadlines with countdown.",
      id: "Rapat dan tenggat dari kalender, lengkap dengan hitung mundur.",
    },
  },
  to_do_fokus: {
    name: { en: "Focus To-Do", id: "To-Do fokus" },
    description: {
      en: "Keep your top task pinned and check it off from the dock.",
      id: "Tugas teratas selalu terlihat. Centang langsung dari bar.",
    },
  },
  pomodoro: {
    name: { en: "Pomodoro", id: "Pomodoro" },
    description: {
      en: "Focus and break timer with a live circular ring on the bar.",
      id: "Timer fokus dan istirahat, progresnya melingkar di bar.",
    },
  },
  catat_cepat: {
    name: { en: "Quick note", id: "Catat cepat" },
    description: {
      en: "Jot down quick ideas without opening a separate notes app.",
      id: "Ketik ide kilat tanpa membuka aplikasi catatan.",
    },
  },
  clipboard: {
    name: { en: "Clipboard", id: "Clipboard" },
    description: {
      en: "Recent copy history, ready to paste in one click.",
      id: "Riwayat salin terakhir, tinggal klik untuk tempel.",
    },
  },
  water_tracker: {
    name: { en: "Water tracker", id: "Water tracker" },
    description: {
      en: "Hydration reminder with smooth daily intake progress.",
      id: "Pengingat minum dengan progres harian yang halus.",
    },
  },
  pantau_sistem: {
    name: { en: "System monitor", id: "Pantau sistem" },
    description: {
      en: "Live CPU and RAM usage with a compact sparkline.",
      id: "CPU dan RAM live dengan sparkline kecil.",
    },
  },
  jaringan: {
    name: { en: "Network", id: "Jaringan" },
    description: {
      en: "Download, upload speed, and ping latency at a glance.",
      id: "Kecepatan unduh/unggah dan ping, sekilas lihat.",
    },
  },
  baterai_daya: {
    name: { en: "Battery & power", id: "Baterai & daya" },
    description: {
      en: "Battery percentage, time remaining, and power saver mode.",
      id: "Persen baterai, estimasi sisa, dan mode hemat daya.",
    },
  },
  output_audio: {
    name: { en: "Audio output", id: "Output audio" },
    description: {
      en: "Switch between speakers and headphones in one click.",
      id: "Ganti speaker ke headset dalam satu klik.",
    },
  },
  desktop_virtual: {
    name: { en: "Virtual desktops", id: "Desktop virtual" },
    description: {
      en: "Switch between virtual desktops without keyboard shortcuts.",
      id: "Pindah antar desktop virtual tanpa shortcut.",
    },
  },
  mode_fokus: {
    name: { en: "Focus mode", id: "Mode fokus" },
    description: {
      en: "Mute notifications temporarily with a single tap.",
      id: "Bungkam notifikasi sementara, satu ketuk.",
    },
  },
  sedang_diputar: {
    name: { en: "Now playing", id: "Sedang diputar" },
    description: {
      en: "Mini album art, visualizer, and synced lyric line.",
      id: "Cover mini, visualizer, dan baris lirik yang sinkron.",
    },
  },
  cuaca: {
    name: { en: "Weather", id: "Cuaca" },
    description: {
      en: "Current temperature and sky conditions with calm icons.",
      id: "Suhu dan kondisi, dengan ikon yang tenang.",
    },
  },
  jam_dunia: {
    name: { en: "World clock", id: "Jam dunia" },
    description: {
      en: "Two favorite time zones displayed side by side.",
      id: "Dua zona waktu favoritmu berdampingan.",
    },
  },
  visualizer: {
    name: { en: "Visualizer", id: "Visualizer" },
    description: {
      en: "Smooth wave bars reacting to audio on your bar.",
      id: "Garis gelombang halus mengikuti suara, murni dekorasi.",
    },
  },
  kalender_mini: {
    name: { en: "Mini calendar", id: "Kalender mini" },
    description: {
      en: "This week's strip, highlighted today badge, and event count.",
      id: "Strip minggu ini, hari ini disorot, plus jumlah acara.",
    },
  },
  streak_kebiasaan: {
    name: { en: "Habit streak", id: "Streak kebiasaan" },
    description: {
      en: "Build daily habits and grow your streak each checked day.",
      id: "Jaga kebiasaan harian, streak naik tiap hari dicentang.",
    },
  },
  tangkap_layar: {
    name: { en: "Screenshot", id: "Tangkap layar" },
    description: {
      en: "Capture region or fullscreen screenshots right from the bar.",
      id: "Screenshot area atau layar penuh langsung dari bar.",
    },
  },
  peluncur_cepat: {
    name: { en: "Quick launcher", id: "Peluncur cepat" },
    description: {
      en: "Search apps, files, or run commands from one field.",
      id: "Cari aplikasi, file, atau jalankan perintah dari satu kolom.",
    },
  },
  gpu_suhu: {
    name: { en: "GPU & thermal", id: "GPU & suhu" },
    description: {
      en: "GPU load, temperature, and fan telemetry for gaming or rendering.",
      id: "Beban GPU, suhu, dan kipas, cocok untuk gaming atau render.",
    },
  },
  penyimpanan: {
    name: { en: "Storage", id: "Penyimpanan" },
    description: {
      en: "Free disk space overview and low-storage warnings.",
      id: "Sisa ruang disk dan peringatan saat hampir penuh.",
    },
  },
  kontrol_media: {
    name: { en: "Media controls", id: "Kontrol media" },
    description: {
      en: "Play, pause, and skip tracks without switching windows.",
      id: "Putar, jeda, dan lompat lagu tanpa membuka pemutar.",
    },
  },
  kutipan_harian: {
    name: { en: "Daily quote", id: "Kutipan harian" },
    description: {
      en: "An uplifting quote that refreshes every day.",
      id: "Satu kalimat penyemangat yang berganti tiap hari.",
    },
  },
  privasi_kamera_mic: {
    name: { en: "Camera & mic privacy", id: "Privasi kamera & mic" },
    description: {
      en: "Active indicator showing which app uses camera or mic.",
      id: "Titik indikator saat ada aplikasi yang memakai kamera atau mic.",
    },
  },
  mixer_suara: {
    name: { en: "Sound mixer", id: "Mixer suara" },
    description: {
      en: "Per-app volume sliders without opening Windows settings.",
      id: "Slider volume tiap aplikasi, tanpa buka panel Windows.",
    },
  },
  baterai_perangkat: {
    name: { en: "Device battery", id: "Baterai perangkat" },
    description: {
      en: "Remaining battery for Bluetooth headsets, mice, and earbuds.",
      id: "Sisa baterai headset, mouse, atau earbuds Bluetooth.",
    },
  },
  hotspot_vpn: {
    name: { en: "Hotspot & VPN", id: "Hotspot & VPN" },
    description: {
      en: "Toggle mobile hotspot or VPN status directly from the bar.",
      id: "Nyalakan VPN atau hotspot langsung dari bar.",
    },
  },
  hitung_mundur: {
    name: { en: "Countdown", id: "Hitung mundur" },
    description: {
      en: "Track exams, launches, or special dates at a single glance.",
      id: "Tenggat UAS, skripsi, atau hari spesial, cukup satu angka.",
    },
  },
  kalkulator_konverter: {
    name: { en: "Calculator & converter", id: "Kalkulator & konverter" },
    description: {
      en: "Type \"15% of 240\" or \"100 USD to IDR\" for instant results.",
      id: "Ketik \"15% dari 240\" atau \"100 USD ke IDR\", hasil langsung muncul.",
    },
  },
  waktu_layar: {
    name: { en: "Screen time", id: "Waktu layar" },
    description: {
      en: "Today's active screen time and top used apps.",
      id: "Total pemakaian hari ini dan aplikasi yang paling banyak dipakai.",
    },
  },
  jadwal_kelas: {
    name: { en: "Class schedule", id: "Jadwal kelas" },
    description: {
      en: "Next class subject, room, and start time.",
      id: "Mata kuliah berikutnya, ruangan, dan jamnya.",
    },
  },
  text_snippet: {
    name: { en: "Text snippet", id: "Text snippet" },
    description: {
      en: "Expand short aliases into email templates or snippets.",
      id: "Ketik singkatan, jadi kalimat panjang. Cocok untuk template email.",
    },
  },
  drop_zone_mini: {
    name: { en: "Mini Drop Zone", id: "Drop Zone mini" },
    description: {
      en: "Count of files queued in Gili Drop Zone, click to open.",
      id: "Jumlah file di tray Gili Drop Zone, klik untuk membuka.",
    },
  },
  suara_ambient: {
    name: { en: "Ambient sound", id: "Suara ambient" },
    description: {
      en: "Rain, cafe, or white noise to pair with focus sessions.",
      id: "Hujan, kafe, atau white noise untuk fokus. Cocok dengan Pomodoro.",
    },
  },
  progres_hari: {
    name: { en: "Day progress", id: "Progres hari" },
    description: {
      en: "A subtle progress bar filling gently across the day.",
      id: "Garis tipis yang mengisi pelan sepanjang hari, murni estetika.",
    },
  },
  waktu_sholat: {
    name: { en: "Prayer times", id: "Waktu sholat" },
    description: {
      en: "Next prayer time and countdown based on your location.",
      id: "Waktu sholat berikutnya dengan hitung mundur, sesuai lokasi.",
    },
  },
  kualitas_udara: {
    name: { en: "Air quality", id: "Kualitas udara" },
    description: {
      en: "Local AQI index paired nicely with your weather module.",
      id: "Indeks AQI lokal, berguna di kota besar. Pasangan cuaca.",
    },
  },
  check_in_mood: {
    name: { en: "Mood check-in", id: "Check-in mood" },
    description: {
      en: "One daily tap to log your mood and review weekly trends.",
      id: "Satu ketukan per hari untuk mencatat mood, nanti bisa direkap.",
    },
  },
  istirahat_mata: {
    name: { en: "Eye rest", id: "Istirahat mata" },
    description: {
      en: "20-20-20 rule reminder: every 20m look 20ft away for 20s.",
      id: "Pengingat 20-20-20: tiap 20 menit, lihat jauh selama 20 detik.",
    },
  },
};

export function getLocalizedModuleMeta(
  id: string,
  lang: Language,
  fallbackName?: string,
  fallbackDesc?: string
): { name: string; description: string } {
  const entry = MODULE_CATALOG_I18N[id];
  if (!entry) {
    return {
      name: fallbackName || id,
      description: fallbackDesc || "",
    };
  }
  return {
    name: lang === "id" ? entry.name.id : entry.name.en,
    description: lang === "id" ? entry.description.id : entry.description.en,
  };
}

const PREVIEW_TEXT_EN_REPLACEMENTS: Array<[string, string]> = [
  ["Rapat tim", "Team sync"],
  ["14:00 · 25 mnt", "14:00 · 25 min"],
  ["Lewat 2j", "2h overdue"],
  ["Fokus 2/4", "Focus 2/4"],
  ["Catat ide…", "Jot an idea…"],
  ["Disalin barusan", "Copied just now"],
  ["Minum lagi 14.00", "Next drink 14:00"],
  ["Hemat daya", "Power saver"],
  ["Output", "Output"],
  ["dari 3", "of 3"],
  ["Sampai 15.00", "Until 15:00"],
  ["Lagu Favorit", "Favorite Track"],
  ["Lirik tampil di sini", "Lyrics appear here"],
  ["Cerah berawan", "Partly cloudy"],
  ["20-20-20 · 14 mnt lagi", "20-20-20 · 14 min left"],
  ["Istirahat mata", "Eye rest"],
  ["214 GB bebas di C:", "214 GB free on C:"],
  ["“Pelan tapi pasti”", "“Slow and steady”"],
  ["Kutipan hari ini", "Quote of the day"],
  ["Mixer 3 aplikasi", "Mixer 3 apps"],
  ["Sistem Informasi", "Information Systems"],
  ["Terima kasih atas…", "Thank you for…"],
  ["Belajar 30 mnt", "Study 30 min"],
  ["24 mnt lagi", "24 min left"],
  ["12 hari lagi", "12 days left"],
  ["15% dari 240", "15% of 240"],
  ["Mic aktif", "Mic active"],
  ["Area Layar", "Screen Area"],
  ["kipas 38%", "fan 38%"],
  ["12 hari", "12 days"],
  ["1,2 / 2 L", "1.2 / 2 L"],
  ["4j 12m", "4h 12m"],
  ["3j 40m", "3h 40m"],
  ["Cari…", "Search…"],
  [">OKT<", ">OCT<"],
  [">Sedang<", ">Moderate<"],
  [">Hujan<", ">Rain<"],
  [">Hari ini<", ">Today<"],
];

export function localizePreviewHtml(html: string, lang: Language): string {
  if (lang === "id" || !html) return html;
  let result = html;
  for (const [idStr, enStr] of PREVIEW_TEXT_EN_REPLACEMENTS) {
    if (result.includes(idStr)) {
      result = result.split(idStr).join(enStr);
    }
  }
  return result;
}
