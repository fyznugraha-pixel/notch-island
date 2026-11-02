import React, { useState, useEffect, useRef } from "react";
import { FolderDown, Plus, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

const SHELF_KEY = "gili_shelf_items";

export const DropZoneNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<any[]>([]);

  const loadFiles = () => {
    try {
      const raw = localStorage.getItem(SHELF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFiles(parsed);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadFiles();
    const id = setInterval(loadFiles, 3000);
    return () => clearInterval(id);
  }, []);

  const handlePickFiles = async () => {
    try {
      const picked = await invoke<any[]>("pick_files_dialog");
      if (Array.isArray(picked) && picked.length > 0) {
        const next = [...picked, ...files];
        setFiles(next);
        localStorage.setItem(SHELF_KEY, JSON.stringify(next));
      }
    } catch {
      invoke("trigger_notch_action", { action: "open_tab:shelf" }).catch(
        () => {}
      );
    }
  };

  const handleOpenNotchShelf = () => {
    invoke("trigger_notch_action", { action: "open_tab:shelf" }).catch(() => {});
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] border border-dashed border-[#3882F6]/50 bg-[#3882F6]/10 hover:bg-[#3882F6]/15"
        }`}
        title={`Drop Zone Mini (${files.length} file)`}
      >
        <FolderDown size={15} className="text-[#60a5fa] shrink-0" />
        {isCompact ? (
          files.length > 0 && (
            <span className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full bg-[#3882F6] text-[10px] font-bold text-white flex items-center justify-center">
              {files.length}
            </span>
          )
        ) : (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-semibold text-[#93c5fd]">
              Drop Zone
            </span>
            <span className="text-[10px] text-[#60a5fa]">
              {files.length > 0 ? `${files.length} file tersimpan` : "Taruh file"}
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Drop Zone Mini"
        moduleId="drop_zone_mini"
        currentView={view}
        config={config}
        width={250}
      >
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-zinc-400">
            {files.length > 0
              ? `${files.length} file siap dipindah atau dibagikan.`
              : "Belum ada file di Drop Zone."}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePickFiles}
              className="flex-1 h-8 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus size={13} />
              <span>Pilih File</span>
            </button>
            <button
              type="button"
              onClick={handleOpenNotchShelf}
              className="h-8 px-2.5 rounded-[8px] bg-white/[0.07] hover:bg-white/[0.12] text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
              title="Buka Shelf penuh di Island"
            >
              <ExternalLink size={12} />
              <span>Buka Shelf</span>
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
