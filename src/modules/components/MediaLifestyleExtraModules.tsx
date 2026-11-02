import React, { useState, useEffect, useRef } from "react";
import { Wind } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "../../types";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

export { AmbientSoundNavbarModule } from "./AmbientSoundNavbarModule";

// 32. Visualizer
export const VisualizerNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bars, setBars] = useState<number[]>([
    8, 16, 22, 12, 20, 14, 18, 9, 21, 15, 11, 17, 7,
  ]);

  useEffect(() => {
    const unlisten = listen<MediaPayload>("media-update", (ev) => {
      if (typeof ev.payload?.is_playing === "boolean") {
        setIsPlaying(ev.payload.is_playing);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setBars([4, 6, 8, 5, 7, 4, 6, 5, 8, 6, 4, 7, 4]);
      return;
    }
    const id = setInterval(() => {
      setBars((prev) =>
        prev.map(() => Math.floor(6 + Math.random() * 17))
      );
    }, 160);
    return () => clearInterval(id);
  }, [isPlaying]);

  const colors = ["#ec4899", "#a855f7", "#6366f1", "#3882F6"];

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Visualizer Musik (${isPlaying ? "Sedang aktif berputar" : "Jeda"})`}
      >
        <div className="flex items-center gap-[2.5px] h-[22px]">
          {(isCompact ? bars.slice(0, 5) : bars).map((h, i) => (
            <i
              key={i}
              style={{
                height: `${h}px`,
                background: colors[i % colors.length],
              }}
              className="w-[3px] rounded-[1.5px] transition-all duration-150"
            />
          ))}
        </div>
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Visualizer Spektrum Musik"
        moduleId="visualizer"
        currentView={view}
        config={config}
        width={230}
      >
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-zinc-400">
            Spektrum berdenyut otomatis saat musik di Windows atau Island sedang berputar.
          </div>
          <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            <span>{isPlaying ? "Musik Aktif Berputar" : "Musik Sedang Jeda"}</span>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 38. Kualitas udara
export const AirQualityNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [aqi, setAqi] = useState(42);
  const [city, setCity] = useState("Bandung");

  const status =
    aqi <= 50
      ? { label: "Baik", color: "#22c55e" }
      : aqi <= 100
      ? { label: "Sedang", color: "#f59e0b" }
      : { label: "Tidak Sehat", color: "#ef4444" };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Kualitas Udara (${city}): AQI ${aqi} · ${status.label}`}
      >
        <Wind size={15} className="text-[#4ade80] shrink-0" />
        {isCompact ? (
          <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#22c55e] text-[9px] font-bold text-[#052e16] flex items-center justify-center">
            {aqi}
          </span>
        ) : (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white">
              AQI {aqi} · {status.label}
            </span>
            <span className="text-[10px] text-zinc-400">
              PM2.5 rendah · {city}
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Indeks Kualitas Udara (AQI)"
        moduleId="kualitas_udara"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between p-2.5 rounded-[9px] bg-white/[0.04]">
            <div>
              <div className="text-[18px] font-bold text-emerald-400">
                AQI {aqi} ({status.label})
              </div>
              <div className="text-[10.5px] text-zinc-400">
                Aman untuk aktivitas luar ruangan di {city}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { c: "Bandung", v: 42 },
              { c: "Jakarta", v: 88 },
              { c: "Yogyakarta", v: 36 },
            ].map((item) => (
              <button
                key={item.c}
                type="button"
                onClick={() => {
                  setCity(item.c);
                  setAqi(item.v);
                }}
                className={`py-1 rounded-[7px] text-[10.5px] font-semibold cursor-pointer ${
                  city === item.c
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-white/[0.04] text-zinc-400 hover:text-white"
                }`}
              >
                {item.c}
              </button>
            ))}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 39. Check-in mood
const MOODS = [
  { id: 0, label: "Berat", color: "#ef4444" },
  { id: 1, label: "Kurang", color: "#f97316" },
  { id: 2, label: "Biasa", color: "#eab308" },
  { id: 3, label: "Baik", color: "#22c55e" },
  { id: 4, label: "Hebat", color: "#3882F6" },
];

export const MoodCheckinNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [selectedMood, setSelectedMood] = useState<number>(() => {
    const saved = localStorage.getItem("gili_mood_today");
    return saved !== null ? Number(saved) : 3;
  });

  const selectMood = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedMood(id);
    try {
      localStorage.setItem("gili_mood_today", String(id));
    } catch {}
  };

  const activeMood = MOODS[selectedMood] || MOODS[3];

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Mood Hari Ini: ${activeMood.label}`}
      >
        {isCompact ? (
          <span
            className="w-4 h-4 rounded-full shadow"
            style={{ backgroundColor: activeMood.color }}
          />
        ) : (
          <>
            <span className="text-[11px] font-medium text-zinc-300">
              Mood?
            </span>
            <div className="flex items-center gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => selectMood(m.id, e)}
                  style={{ backgroundColor: m.color }}
                  className={`w-[10px] h-[10px] rounded-full transition-all cursor-pointer ${
                    selectedMood === m.id
                      ? "ring-2 ring-white scale-110 opacity-100"
                      : "opacity-45 hover:opacity-90"
                  }`}
                  title={m.label}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Check-in Mood Harian"
        moduleId="check_in_mood"
        currentView={view}
        config={config}
        width={255}
      >
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] text-zinc-400">
            Bagaimana perasaanmu saat ini?
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMood(m.id)}
                className={`flex flex-col items-center gap-1 py-2 rounded-[8px] border transition-all cursor-pointer ${
                  selectedMood === m.id
                    ? "bg-white/[0.1] border-white/30 text-white font-bold"
                    : "bg-white/[0.03] border-white/[0.05] text-zinc-400 hover:text-white"
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-[9.5px]">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
