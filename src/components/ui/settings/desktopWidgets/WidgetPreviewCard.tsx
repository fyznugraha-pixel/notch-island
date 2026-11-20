import React from "react";
import {
  CloudSun,
  Music2,
  Wifi,
  Bluetooth,
  Moon,
  Volume2,
  Flame,
  Sparkles,
} from "lucide-react";
import { WidgetCatalogEntry, WidgetSize } from "../../../../services/desktopWidgetsService";

interface WidgetPreviewCardProps {
  entry: WidgetCatalogEntry;
  size: WidgetSize;
  lightWallpaper: boolean;
}

export const WidgetPreviewCard: React.FC<WidgetPreviewCardProps> = ({
  entry,
  size,
  lightWallpaper,
}) => {
  const fg = lightWallpaper ? "text-slate-900" : "text-white";
  const sub = lightWallpaper ? "text-slate-600" : "text-white/60";
  const chip = lightWallpaper ? "bg-slate-900/[0.08]" : "bg-white/[0.11]";
  const accentBar = lightWallpaper ? "bg-slate-900" : "bg-white";
  const accentLabel = lightWallpaper ? "text-slate-700" : "text-white/85";
  const dim =
    size === "small"
      ? { width: 158, height: 158 }
      : size === "medium"
      ? { width: 300, height: 150 }
      : { width: 268, height: 248 };

  const renderInner = () => {
    switch (entry.widget_type) {
      case "calendar_agenda": {
        const headers = ["M", "S", "S", "R", "K", "J", "S"];
        const days = Array.from({ length: 30 }, (_, i) => i + 1);
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-[9.5px] font-bold opacity-90">
              {headers.map((h, i) => (
                <div key={i}>{h}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px] tabular-nums">
              {days.map((d) => (
                <div
                  key={d}
                  className={`mx-auto w-4 h-4 flex items-center justify-center leading-none ${
                    d === 20 ? "font-extrabold scale-110 opacity-100" : "font-normal opacity-75"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        );
      }
      case "styled_clock":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${accentLabel}`}>
              Jumat, 20 November
            </span>
            <div className="text-[40px] font-bold tracking-tight tabular-nums leading-none">
              22:15
            </div>
            <span className={`text-[11px] ${sub}`}>8 gaya termasuk kata Indonesia</span>
          </div>
        );
      case "system_performance":
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${sub}`}>
                Performa Sistem
              </span>
              <span className={`text-[10.5px] font-semibold tabular-nums ${sub}`}>
                RAM 7.7/16 GB
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {[
                { label: "CPU", val: "18%", pct: 18, color: lightWallpaper ? "#0f172a" : "#ffffff" },
                { label: "RAM", val: "48%", pct: 48, color: "#34d399" },
              ].map((ring) => (
                <div key={ring.label} className="flex flex-col items-center">
                  <div className="relative w-11 h-11 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="14.5"
                        fill="none"
                        stroke={lightWallpaper ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.14)"}
                        strokeWidth="3.5"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14.5"
                        fill="none"
                        stroke={ring.color}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${ring.pct * 0.91} 91`}
                      />
                    </svg>
                    <span className="absolute text-[10px] font-bold tabular-nums">{ring.val}</span>
                  </div>
                  <span className={`text-[9px] font-semibold mt-0.5 ${sub}`}>{ring.label}</span>
                </div>
              ))}
              {size !== "small" && (
                <div className="flex-1 flex items-end gap-1 h-11 pb-2">
                  {[30, 55, 22, 68, 40, 28, 52, 35].map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full ${accentBar} opacity-85`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={`flex items-center justify-between text-[10px] tabular-nums ${sub}`}>
              <span>GPU 12%</span>
              <span>D 2.4 Mbps</span>
            </div>
          </div>
        );
      case "now_playing":
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-pink-500 to-indigo-500 flex items-center justify-center text-white shrink-0">
                <Music2 size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold truncate">Slow Dancing in the Dark</div>
                <div className={`text-[11px] truncate ${sub}`}>Joji</div>
              </div>
            </div>
            <div className="text-[12.5px] font-semibold leading-snug">
              Give me reasons we should be complete
            </div>
            <div className="h-1 w-full rounded-full bg-white/15 overflow-hidden">
              <div className={`h-full w-[62%] rounded-full ${accentBar}`} />
            </div>
          </div>
        );
      case "weather_forecast":
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold">Jakarta</span>
              <CloudSun size={18} className="text-amber-400" />
            </div>
            <div className="flex items-end justify-between">
              <span className="text-[38px] font-bold leading-none tabular-nums">29°</span>
              {size !== "small" && (
                <div className="flex gap-3 text-center">
                  {[
                    ["13:00", "30°"],
                    ["16:00", "28°"],
                    ["19:00", "26°"],
                  ].map(([t, d]) => (
                    <div key={t}>
                      <div className={`text-[9.5px] ${sub}`}>{t}</div>
                      <div className="text-[12px] font-semibold tabular-nums">{d}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className={`text-[11px] ${sub}`}>Cerah Berawan . Open-Meteo</span>
          </div>
        );
      case "prayer_times":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Sholat . Jakarta
            </span>
            <div>
              <div className="text-[32px] font-bold leading-none tabular-nums">17:58</div>
              <div className={`text-[11.5px] mt-1 ${sub}`}>Maghrib . Kemenag RI Offline</div>
            </div>
            {size !== "small" && (
              <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                {[
                  ["Sbh", "04:12"],
                  ["Dzh", "11:46"],
                  ["Ash", "15:09"],
                  ["Mgh", "17:58"],
                  ["Isy", "19:11"],
                ].map(([k, v]) => (
                  <div key={k} className={`rounded-lg py-1 ${chip}`}>
                    <div className={sub}>{k}</div>
                    <div className="font-semibold tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case "quick_controls":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className="text-[12px] font-semibold">Kontrol Cepat</span>
            <div className={`grid gap-2 ${size === "small" ? "grid-cols-2" : "grid-cols-4"}`}>
              {[
                { icon: <Wifi size={14} />, lbl: "Wi-Fi", on: true },
                { icon: <Bluetooth size={14} />, lbl: "BT", on: true },
                { icon: <Moon size={14} />, lbl: "Gelap", on: true },
                { icon: <Volume2 size={14} />, lbl: "Audio", on: false },
              ].map((t) => (
                <div
                  key={t.lbl}
                  className={`rounded-[12px] p-2 flex flex-col items-center gap-1 ${
                    t.on ? "bg-blue-500/25 border border-blue-400/50" : chip
                  }`}
                >
                  {t.icon}
                  <span className="text-[9.5px] font-medium">{t.lbl}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case "habit_heatmap":
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold flex items-center gap-1">
                <Flame size={13} className="text-amber-400" /> Fokus Harian
              </span>
              <span className="text-[11px] font-bold text-emerald-400 tabular-nums">12 hari</span>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[3px]"
                  style={{
                    backgroundColor:
                      i % 5 === 0
                        ? "rgba(52,195,160,0.95)"
                        : i % 3 === 0
                        ? "rgba(52,195,160,0.5)"
                        : lightWallpaper
                        ? "rgba(15,23,42,0.1)"
                        : "rgba(255,255,255,0.1)",
                  }}
                />
              ))}
            </div>
          </div>
        );
      case "audio_visualizer":
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="font-semibold">Spektrum Audio</span>
              <span className="text-[10px] font-semibold text-emerald-400">WASAPI</span>
            </div>
            <div className="flex items-end gap-1.5 h-20">
              {[24, 52, 76, 40, 88, 66, 94, 54, 72, 46, 80, 34, 58, 42].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-gradient-to-t from-blue-500 to-emerald-400"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        );
      case "screen_time":
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${accentLabel}`}>
                Screen Time Hari Ini
              </span>
              <span className={`text-[10.5px] tabular-nums ${sub}`}>Batas 8j</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[34px] font-bold leading-none tabular-nums">4j 32m</span>
              <span className={`text-[11px] tabular-nums ${sub}`}>56%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
              <div className={`h-full w-[56%] rounded-full ${accentBar}`} />
            </div>
          </div>
        );
      case "countdown_moment":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${accentLabel}`}>
              Hitung Mundur
            </span>
            <div>
              <div className="text-[38px] font-bold leading-none tabular-nums">42</div>
              <div className={`text-[11px] mt-1 ${sub}`}>hari lagi . 2027-01-01</div>
            </div>
            <div className="text-[12.5px] font-semibold truncate">Target Rilis Proyek</div>
          </div>
        );
      case "photo_frame":
        return (
          <div
            className="h-full w-full rounded-[18px] overflow-hidden relative flex items-center justify-center"
            style={{
              background: lightWallpaper
                ? "linear-gradient(160deg, #e2e8f0 0%, #cbd5e1 65%, #94a3b8 100%)"
                : "linear-gradient(160deg, #1e293b 0%, #334155 60%, #0f172a 100%)",
            }}
          >
            <svg viewBox="0 0 120 96" className="w-full h-full opacity-85">
              <circle cx="88" cy="26" r="9" fill={lightWallpaper ? "#f8fafc" : "#e2e8f0"} opacity="0.8" />
              <path
                d="M0 78 L34 46 L62 72 L86 52 L120 82 L120 96 L0 96 Z"
                fill={lightWallpaper ? "rgba(15,23,42,0.22)" : "rgba(255,255,255,0.16)"}
              />
            </svg>
          </div>
        );
      case "world_clock":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${accentLabel}`}>
              Jam Dunia
            </span>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                ["Jakarta", "22:30", 315, 180],
                ["Tokyo", "00:30", 15, 180],
                ["London", "15:30", 105, 180],
                ["New York", "10:30", 315, 180],
              ].map(([city, t, hDeg, mDeg]) => (
                <div key={String(city)} className={`rounded-[14px] py-2 px-1 flex flex-col items-center ${chip}`}>
                  <svg viewBox="0 0 36 36" className="w-7 h-7 mb-1">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill={lightWallpaper ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.08)"}
                      stroke={lightWallpaper ? "rgba(15,23,42,0.45)" : "rgba(255,255,255,0.55)"}
                      strokeWidth="1.3"
                    />
                    <line
                      x1="18"
                      y1="18"
                      x2={18 + 7.5 * Math.cos(((Number(hDeg) - 90) * Math.PI) / 180)}
                      y2={18 + 7.5 * Math.sin(((Number(hDeg) - 90) * Math.PI) / 180)}
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <line
                      x1="18"
                      y1="18"
                      x2={18 + 11 * Math.cos(((Number(mDeg) - 90) * Math.PI) / 180)}
                      y2={18 + 11 * Math.sin(((Number(mDeg) - 90) * Math.PI) / 180)}
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-[10.5px] font-semibold truncate max-w-full">{city}</div>
                  <div className={`text-[10px] font-bold tabular-nums ${sub}`}>{t}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case "quick_snippets":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className="text-[12px] font-semibold">Papan Snippet (1 Klik Salin)</span>
            <div className={`grid gap-1.5 ${size === "small" ? "grid-cols-1" : "grid-cols-2"}`}>
              {["Alamat Kantor", "Email Kerja", "Perintah Build", "Salam Pembuka"].slice(0, size === "small" ? 3 : 4).map((s) => (
                <div key={s} className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium truncate ${chip}`}>
                  {s}
                </div>
              ))}
            </div>
          </div>
        );
      case "air_quality":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              AQI . Jakarta
            </span>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[36px] font-bold leading-none tabular-nums">74</div>
                <div className="text-[11.5px] font-semibold text-amber-400 mt-0.5">Sedang</div>
              </div>
              {size !== "small" && (
                <div className="flex gap-1.5 text-center">
                  {[
                    ["PM2.5", "22.4"],
                    ["PM10", "38.0"],
                    ["UV", "4.2"],
                  ].map(([k, v]) => (
                    <div key={k} className={`rounded-[10px] px-2 py-1.5 ${chip}`}>
                      <div className={`text-[9px] ${sub}`}>{k}</div>
                      <div className="text-[11.5px] font-bold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
              <div className="h-full w-[38%] rounded-full bg-amber-400" />
            </div>
          </div>
        );
      default:
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${accentLabel}`}>
                Grup {entry.group}
              </span>
              <Sparkles size={13} className={accentLabel} />
            </div>
            <div>
              <div className="text-[14px] font-semibold leading-snug">{entry.name}</div>
              <div className={`text-[11px] mt-1 line-clamp-3 ${sub}`}>{entry.description}</div>
            </div>
            <div className={`text-[10px] truncate ${sub}`}>{entry.data_source}</div>
          </div>
        );
    }
  };

  const surfaceStyle: React.CSSProperties =
    entry.widget_type === "photo_frame"
      ? {
          width: dim.height,
          height: dim.height,
          boxShadow: "0 12px 28px rgba(0,0,0,0.22)",
        }
      : {
          ...dim,
          background: lightWallpaper
            ? "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(241,245,249,0.56) 100%)"
            : "linear-gradient(180deg, rgba(34,37,48,0.62) 0%, rgba(20,22,30,0.48) 100%)",
          backdropFilter: "blur(20px)",
          boxShadow: lightWallpaper
            ? "0 10px 26px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.65)"
            : "0 12px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.20)",
        };

  return (
    <div
      style={surfaceStyle}
      className={`rounded-[26px] ${entry.widget_type === "photo_frame" ? "p-0" : "p-4"} transition-all border ${fg} ${
        lightWallpaper ? "border-slate-900/12" : "border-white/22"
      }`}
    >
      {renderInner()}
    </div>
  );
};
