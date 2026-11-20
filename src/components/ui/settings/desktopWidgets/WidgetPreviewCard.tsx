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
  const dim =
    size === "small"
      ? { width: 158, height: 158 }
      : size === "medium"
      ? { width: 300, height: 150 }
      : { width: 268, height: 248 };

  const renderInner = () => {
    switch (entry.widget_type) {
      case "styled_clock":
        return (
          <div className="h-full flex flex-col justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
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
              <span className="text-[11px] font-semibold text-emerald-400 tabular-nums">
                RAM 48%
              </span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-[34px] font-bold leading-none tabular-nums">18%</span>
              <div className="flex-1 flex items-end gap-1 h-9">
                {[30, 55, 22, 68, 40, 28, 52, 35].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full bg-blue-500/85"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
              <div className="h-full w-[48%] rounded-full bg-emerald-400" />
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
              <div className="h-full w-[62%] rounded-full bg-blue-400" />
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
      default:
        return (
          <div className="h-full flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-blue-400">
                Grup {entry.group}
              </span>
              <Sparkles size={13} className="text-blue-400" />
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

  return (
    <div
      style={dim}
      className={`rounded-[24px] p-4 transition-all border border-dashed ${fg} ${
        lightWallpaper ? "border-slate-900/20" : "border-white/20"
      }`}
    >
      {renderInner()}
    </div>
  );
};
