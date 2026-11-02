import React, { useState, useEffect, useRef } from "react";
import { Moon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

export const FocusNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [dnd, setDnd] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_windows_dnd")
      .then((val) => setDnd(Boolean(val)))
      .catch(() => {});
  }, []);

  const toggleDnd = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = !dnd;
    setDnd(next);
    try {
      await invoke("set_windows_dnd", { enabled: next });
      await invoke("set_windows_banners_hidden", { hidden: next });
    } catch {}
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? `w-10 h-10 justify-center rounded-[12px] ${
                dnd
                  ? "bg-purple-500/20 border border-purple-500/40"
                  : "bg-white/[0.06] hover:bg-white/[0.11]"
              }`
            : `h-10 px-3 gap-2.5 rounded-[12px] border ${
                dnd
                  ? "bg-purple-500/20 border-purple-500/40"
                  : "bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.07]"
              }`
        }`}
        title={`Mode Fokus: ${dnd ? "Aktif (Notifikasi dibisukan)" : "Nonaktif"}`}
      >
        <Moon
          size={15}
          className={dnd ? "text-[#c084fc]" : "text-zinc-300"}
        />
        {!isCompact && (
          <>
            <div className="flex flex-col leading-[1.15]">
              <span
                className={`text-[11.5px] font-semibold ${
                  dnd ? "text-[#e9d5ff]" : "text-white"
                }`}
              >
                Fokus
              </span>
              <span
                className={`text-[10px] ${
                  dnd ? "text-[#c084fc]" : "text-zinc-400"
                }`}
              >
                {dnd ? "Aktif · bisu" : "Nonaktif"}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleDnd}
              className={`w-[26px] h-[15px] rounded-full relative transition-colors cursor-pointer ${
                dnd ? "bg-[#a855f7]" : "bg-zinc-700"
              }`}
              title="Alihkan Mode Fokus"
            >
              <span
                className={`absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white transition-all ${
                  dnd ? "right-[2px]" : "left-[2px]"
                }`}
              />
            </button>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Mode Fokus (Jangan Ganggu)"
        moduleId="mode_fokus"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] text-zinc-400">
            Saat aktif, banner notifikasi Windows dibisukan agar kamu tetap fokus.
          </div>
          <button
            type="button"
            onClick={() => toggleDnd()}
            className={`h-8 rounded-[9px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              dnd
                ? "bg-purple-500 text-white"
                : "bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200"
            }`}
          >
            <Moon size={13} />
            <span>{dnd ? "Matikan Mode Fokus" : "Aktifkan Mode Fokus"}</span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
