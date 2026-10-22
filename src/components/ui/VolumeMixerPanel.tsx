import React from "react";
import { motion } from "framer-motion";
import { Volume2, Music, Globe, AppWindow } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../services/i18n";

export interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  pids?: number[];
}

export interface VolumeMixerPanelProps {
  slideDirection: number;
  soundLevel: number;
  onSetSoundLevel: (level: number) => void;
  audioSessions: AudioSession[];
  onUpdateAudioSessions: React.Dispatch<React.SetStateAction<AudioSession[]>>;
  onClose: () => void;
}

const tabVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 16 : dir < 0 ? -16 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: "easeOut" as const },
    },
    transitionEnd: { transform: "none" },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -16 : dir < 0 ? 16 : 0,
    opacity: 0,
    transition: { duration: 0.12 },
  }),
};

export const VolumeMixerPanel: React.FC<VolumeMixerPanelProps> = ({
  slideDirection,
  soundLevel,
  onSetSoundLevel,
  audioSessions,
  onUpdateAudioSessions,
  onClose,
}) => {
  // Aggregate sessions by name
  const aggregatedSessions = audioSessions
    .filter((s) => s.name !== "Unknown" && s.name !== "")
    .reduce<AudioSession[]>((acc, curr) => {
      const existing = acc.find((s) => s.name === curr.name);
      if (!existing) {
        acc.push({ ...curr, pids: [curr.pid] });
      } else if (existing.pids) {
        existing.pids.push(curr.pid);
      }
      return acc;
    }, []);

  return (
    <motion.div
      key="volume_mixer"
      custom={slideDirection}
      variants={tabVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="absolute inset-0 w-full h-full flex flex-col px-3 pb-3 overflow-y-auto no-scrollbar min-w-0 cursor-default gpu-accelerated"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3.5 overflow-y-auto no-scrollbar pb-3 px-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Master Output Section */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-white/50 tracking-wider uppercase mb-1.5 px-3">
            {t("mixer_master")}
          </span>
          <div className="bg-[#1c1c1e]/90 rounded-2xl border border-white/10 p-3.5 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#0a84ff] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Volume2 size={16} />
                </div>
                <span className="text-[12.5px] font-semibold text-white">{t("mixer_system_sound")}</span>
              </div>
              <span className="text-[11.5px] font-mono font-semibold text-white/60 tabular-nums">
                {soundLevel}%
              </span>
            </div>
            <div className="relative h-7 bg-white/10 rounded-full overflow-hidden ring-1 ring-white/10 group flex items-center">
              <div
                className="absolute top-0 left-0 bottom-0 bg-white transition-colors group-hover:bg-[#0a84ff]"
                style={{ width: `${soundLevel}%` }}
              />
              <div className="relative z-10 pl-3 flex items-center pointer-events-none">
                <Volume2
                  size={15}
                  className={
                    soundLevel > 14
                      ? "text-neutral-900 transition-colors"
                      : "text-sky-400 transition-colors"
                  }
                />
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundLevel}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onSetSoundLevel(v);
                  invoke("set_master_volume", { level: v / 100.0 });
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* App Volumes Section */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-white/50 tracking-wider uppercase mb-1.5 px-3">
            {t("mixer_apps")}
          </span>
          <div className="bg-[#1c1c1e]/90 rounded-2xl border border-white/10 divide-y divide-white/[0.08] overflow-hidden shadow-sm backdrop-blur-md">
            {aggregatedSessions.length === 0 ? (
              <div className="text-center text-white/40 text-[12px] py-6 font-medium">
                {t("mixer_empty")}
              </div>
            ) : (
              aggregatedSessions.map((session, idx) => (
                <div
                  key={`${session.name}-${idx}`}
                  className="flex items-center gap-3 px-3.5 py-2.5 min-h-[50px]"
                >
                  <div className="w-[32px] h-[32px] rounded-[9px] bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                    {session.name.toLowerCase().includes("discord") ? (
                      <img src="/logo/discord.webp" alt="Discord" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("spotify") ? (
                      <Music size={15} className="text-[#1DB954]" />
                    ) : session.name.toLowerCase().includes("netflix") ? (
                      <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("tiktok") ? (
                      <img src="/logo/tiktok.webp" alt="TikTok" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("instagram") ? (
                      <img src="/logo/Instagram_icon.png" alt="Instagram" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("threads") ? (
                      <img src="/logo/threads.png" alt="Threads" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("vlc") ? (
                      <img src="/logo/vlc.png" alt="VLC" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("wmplayer") ||
                      session.name.toLowerCase().includes("zune") ? (
                      <img src="/logo/windows-media-player.png" alt="WMP" className="w-4 h-4 object-contain" />
                    ) : session.name.toLowerCase().includes("edge") ||
                      session.name.toLowerCase().includes("chrome") ? (
                      <Globe size={15} className="text-[#0a84ff]" />
                    ) : (
                      <AppWindow size={15} className="text-neutral-300" />
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-white truncate capitalize">
                        {session.name.replace(".exe", "")}
                      </span>
                      <span className="text-[10px] font-mono text-white/50 tabular-nums ml-2 shrink-0">
                        {Math.round(session.volume * 100)}%
                      </span>
                    </div>
                    <div className="relative h-4 bg-black/45 rounded-full overflow-hidden ring-1 ring-white/10 group">
                      <div
                        className="absolute top-0 left-0 bottom-0 bg-[#0a84ff]/90 transition-colors group-hover:bg-[#0a84ff]"
                        style={{ width: `${session.volume * 100}%` }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={session.volume * 100}
                        onChange={(e) => {
                          const v = Number(e.target.value) / 100.0;
                          onUpdateAudioSessions((prev) =>
                            prev.map((s) => (s.name === session.name ? { ...s, volume: v } : s))
                          );
                          session.pids?.forEach((p: number) => {
                            invoke("set_app_volume", { pid: p, volume: v });
                          });
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
