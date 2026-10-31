import React, { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp, Repeat, ScanText, Maximize2, Bug, Zap, MessageSquare, CheckSquare, SlidersHorizontal, Music, Eye, Cpu, LayoutGrid, Monitor } from "lucide-react";
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
    version: "4.3.1",
    date: "1 Nov 2026",
    highlights: [
      {
        icon: <Monitor size={14} />,
        titleId: "Dukungan Dual Monitor & Pintasan Layar",
        titleEn: "Dual Monitor Support & Display Shortcut",
        descId: "Pindai otomatis seluruh layar yang terhubung dan pindahkan posisi Gili Notch antar monitor secara instan, baik melalui pemilih di menu Pengaturan Tampilan maupun pintasan keyboard global (Control+Alt+M) dengan notifikasi HUD nama & resolusi monitor.",
        descEn: "Automatically detects all connected displays and moves Gili Notch between screens instantly, via the Appearance settings selector or the new global shortcut (Control+Alt+M) with resolution HUD feedback.",
        badge: "new",
      },
      {
        icon: <Bug size={14} />,
        titleId: "Perbaikan Bug Buka Jendela Pengaturan",
        titleEn: "Settings Window Launch Bug Fix",
        descId: "Memperbaiki masalah di mana jendela pengaturan terbuka sekejap lalu langsung tertutup di perangkat tertentu dengan menghapus batasan proses render WebView2 dan memperkuat deteksi rute jendela secara sinkron.",
        descEn: "Fixed an issue where the settings window briefly flashed and immediately closed on certain devices by eliminating WebView2 process restrictions and hardening synchronous window route detection.",
        badge: "fix",
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
