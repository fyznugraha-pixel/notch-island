import React, { useState, useEffect, useRef, useCallback } from "react";
import { FolderDown, Plus, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { StashedFile } from "../../components/ui/DropShelfPanel";
import {
  getInitialShelfFiles,
  loadPersistedShelfFiles,
  persistShelfFiles,
} from "../../services/shelfService";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

function pathsToStashedFiles(paths: string[], existing: StashedFile[]): StashedFile[] {
  const existingPaths = new Set(existing.map((f) => f.path.toLowerCase()));
  const now = Date.now();
  const added: StashedFile[] = [];
  paths.forEach((rawPath, i) => {
    if (!rawPath || existingPaths.has(rawPath.toLowerCase())) return;
    const parts = rawPath.split(/[\\/]/);
    const name = parts[parts.length - 1] || rawPath;
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    added.push({
      id: `shelf_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      path: rawPath,
      ext,
      addedAt: now,
      source: "local",
    });
  });
  return [...added, ...existing];
}

export const DropZoneNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<StashedFile[]>(() => getInitialShelfFiles());

  const syncFiles = useCallback(async () => {
    const persisted = await loadPersistedShelfFiles();
    if (Array.isArray(persisted)) setFiles(persisted);
  }, []);

  useEffect(() => {
    syncFiles();
    const id = setInterval(syncFiles, 4000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "island_drop_shelf") syncFiles();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [syncFiles]);

  const handlePickFiles = async () => {
    try {
      const picked = await invoke<string[]>("pick_files_dialog");
      if (Array.isArray(picked) && picked.length > 0) {
        const next = pathsToStashedFiles(picked, files);
        setFiles(next);
        await persistShelfFiles(next, true);
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

  const handleToggle = () => {
    if (!isOpen) syncFiles();
    setIsOpen((v) => !v);
  };

  const countLabel =
    files.length === 1
      ? tx(lang, "1 saved file", "1 file tersimpan")
      : tx(lang, `${files.length} saved files`, `${files.length} file tersimpan`);

  return (
    <>
      <Tooltip
        content={`Drop Zone Mini (${countLabel})`}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `Drop Zone Mini (${files.length} ${tx(lang, "files", "file")})`,
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "h-10 px-3 gap-2.5 rounded-[12px] border border-dashed border-[#3882F6]/50 bg-[#3882F6]/10 hover:bg-[#3882F6]/15"
          }`}
        >
          <FolderDown size={15} className="text-[#60a5fa] shrink-0" />
          {isCompact ? (
            files.length > 0 && (
              <span className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full bg-[#3882F6] text-[10px] font-bold text-[#ffffff] flex items-center justify-center tabular-nums">
                {files.length}
              </span>
            )
          ) : (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[125px]">
              <span className="text-[11.5px] font-semibold text-[#93c5fd] truncate">
                Drop Zone
              </span>
              <span className="text-[10px] text-[#60a5fa] truncate">
                {files.length > 0 ? countLabel : tx(lang, "Drop files", "Taruh file")}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Drop Zone Mini"
        moduleId="drop_zone_mini"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-zinc-300">
            {files.length > 0
              ? tx(
                  lang,
                  `${files.length} files ready to move or share in Island Shelf.`,
                  `${files.length} file siap dipindah atau dibagikan di Shelf Island.`
                )
              : tx(lang, "No files in Drop Zone yet.", "Belum ada file di Drop Zone.")}
          </div>
          {files.length > 0 && (
            <div className="flex flex-col gap-1 max-h-[110px] overflow-y-auto pr-0.5">
              {files.slice(0, 5).map((f) => (
                <div
                  key={f.id}
                  className="w-full min-w-0 px-2 py-1 rounded-[6px] bg-white/[0.04] text-[10.5px] text-zinc-200 truncate"
                >
                  {f.name}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePickFiles}
              className={`flex-1 min-w-0 h-8 px-2.5 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-[#ffffff] text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <Plus size={13} className="shrink-0" />
              <span className="truncate">{tx(lang, "Choose Files", "Pilih File")}</span>
            </button>
            <Tooltip
              content={tx(lang, "Open full Shelf in Island", "Buka Shelf penuh di Island")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="button"
                onClick={handleOpenNotchShelf}
                className={`h-8 px-2.5 shrink-0 rounded-[8px] bg-white/[0.07] hover:bg-white/[0.12] text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <ExternalLink size={12} className="shrink-0" />
                <span>{tx(lang, "Open Shelf", "Buka Shelf")}</span>
              </button>
            </Tooltip>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
