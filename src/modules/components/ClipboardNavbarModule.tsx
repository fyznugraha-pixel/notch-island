import React, { useState, useEffect, useRef, useCallback } from "react";
import { Clipboard, Check, Trash2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { copyTextToClipboard } from "../../utils/clipboard";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

const CLIP_KEY = "gili_clipboard_history";

interface ClipItem {
  id: string;
  text: string;
  timestamp: number;
}

export const ClipboardNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [items, setItems] = useState<ClipItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    let list: ClipItem[] = [];
    try {
      const raw = localStorage.getItem(CLIP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          list = parsed
            .map((p: any, idx: number) => ({
              id: p.id || `clip_${idx}`,
              text: typeof p === "string" ? p : p.text || p.content || "",
              timestamp: p.timestamp || Date.now(),
            }))
            .filter((x) => x.text.trim().length > 0);
        }
      }
    } catch {}

    try {
      const osClip = await invoke<string>("read_clipboard_text");
      const trimmed = osClip?.trim();
      if (trimmed && list[0]?.text !== trimmed) {
        const deduped = list.filter((x) => x.text !== trimmed);
        list = [
          { id: `clip_${Date.now()}`, text: trimmed, timestamp: Date.now() },
          ...deduped,
        ].slice(0, 15);
        localStorage.setItem(CLIP_KEY, JSON.stringify(list));
      }
    } catch {}

    setItems(list);
  }, []);

  useEffect(() => {
    loadHistory();
    const unlisten = listen("clipboard-update", () => {
      loadHistory();
    });
    const id = setInterval(loadHistory, 6000);
    return () => {
      unlisten.then((fn) => fn());
      clearInterval(id);
    };
  }, [loadHistory]);

  const handleCopyItem = async (item: ClipItem) => {
    const ok = await copyTextToClipboard(item.text);
    if (ok) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1200);
    }
  };

  const handleClear = () => {
    setItems([]);
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify([]));
    } catch {}
  };

  const latest = items[0]?.text || tx(lang, "Clipboard empty", "Clipboard kosong");

  const handleToggle = () => {
    if (!isOpen) loadHistory();
    setIsOpen((v) => !v);
  };

  return (
    <>
      <Tooltip
        content={`Clipboard: ${latest}`}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(handleToggle, `Clipboard: ${latest}`, isOpen)}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Clipboard size={15} className="text-[#a855f7] shrink-0" />
          {!isCompact && (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[125px]">
                <span className="text-[11.5px] font-semibold text-white truncate">
                  {latest}
                </span>
                <span className="text-[10px] text-zinc-400 truncate">
                  {items.length > 0
                    ? tx(lang, "Click to copy again", "Klik untuk salin ulang")
                    : tx(lang, "No text yet", "Belum ada teks")}
                </span>
              </div>
              {items.length > 1 && (
                <span className="text-[10px] text-zinc-300 font-semibold shrink-0">
                  +{items.length - 1}
                </span>
              )}
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Clipboard History", "Riwayat Clipboard")}
        moduleId="clipboard"
        currentView={view}
        config={config}
        width={280}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-[10.5px] text-zinc-400 min-w-0">
            <span className="truncate min-w-0 flex-1">
              {tx(lang, "Click item to copy immediately", "Klik item untuk langsung menyalin")}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Tooltip content={tx(lang, "Refresh from OS Clipboard", "Segarkan dari OS Clipboard")} side="top" isLightMode={isLight}>
                <button
                  type="button"
                  onClick={loadHistory}
                  aria-label={tx(lang, "Refresh from OS Clipboard", "Segarkan dari OS Clipboard")}
                  className={`p-1 text-zinc-300 hover:text-white cursor-pointer rounded ${TRIGGER_FOCUS_RING}`}
                >
                  <RefreshCw size={11} />
                </button>
              </Tooltip>
              {items.length > 0 && (
                <Tooltip content={tx(lang, "Clear history", "Bersihkan riwayat")} side="top" isLightMode={isLight}>
                  <button
                    type="button"
                    onClick={handleClear}
                    aria-label={tx(lang, "Clear history", "Bersihkan riwayat")}
                    className={`p-1 text-zinc-300 hover:text-rose-400 cursor-pointer rounded ${TRIGGER_FOCUS_RING}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto pr-0.5">
            {items.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-4 text-center">
                {tx(lang, "No copied text history yet.", "Belum ada riwayat salinan teks.")}
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCopyItem(item)}
                  className={`w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2.5 py-2 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-left transition-colors cursor-pointer ${TRIGGER_FOCUS_RING}`}
                >
                  <span className="text-[11.5px] text-zinc-200 truncate flex-1 min-w-0 font-mono">
                    {item.text}
                  </span>
                  {copiedId === item.id ? (
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5 shrink-0">
                      <Check size={11} /> {tx(lang, "Copied", "Disalin")}
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {tx(lang, "Copy", "Salin")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
