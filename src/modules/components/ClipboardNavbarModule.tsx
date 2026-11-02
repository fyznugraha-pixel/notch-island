import React, { useState, useEffect, useRef } from "react";
import { Clipboard, Check, Trash2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

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
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ClipItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadHistory = async () => {
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
      if (osClip && osClip.trim().length > 0) {
        const trimmed = osClip.trim();
        if (!list.some((x) => x.text === trimmed)) {
          list = [
            { id: `clip_${Date.now()}`, text: trimmed, timestamp: Date.now() },
            ...list,
          ].slice(0, 15);
          localStorage.setItem(CLIP_KEY, JSON.stringify(list));
        }
      }
    } catch {}

    setItems(list);
  };

  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, 3500);
    return () => clearInterval(id);
  }, []);

  const handleCopyItem = (item: ClipItem) => {
    navigator.clipboard.writeText(item.text).catch(() => {});
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const handleClear = () => {
    setItems([]);
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify([]));
    } catch {}
  };

  const latest = items[0]?.text || "Clipboard kosong";

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => {
          loadHistory();
          setIsOpen((v) => !v);
        }}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Clipboard: ${latest}`}
      >
        <Clipboard size={15} className="text-[#a855f7] shrink-0" />
        {!isCompact && (
          <>
            <div className="flex flex-col leading-[1.15] min-w-0">
              <span className="text-[11.5px] font-semibold text-white truncate max-w-[115px]">
                {latest}
              </span>
              <span className="text-[10px] text-zinc-400">
                {items.length > 0 ? "Klik untuk tempel/salin" : "Belum ada teks"}
              </span>
            </div>
            {items.length > 1 && (
              <span className="text-[10px] text-zinc-400 font-semibold">
                +{items.length - 1}
              </span>
            )}
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Riwayat Clipboard"
        moduleId="clipboard"
        currentView={view}
        config={config}
        width={280}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
            <span>Klik item untuk langsung menyalin</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={loadHistory}
                className="p-1 hover:text-white cursor-pointer"
                title="Segarkan dari OS Clipboard"
              >
                <RefreshCw size={11} />
              </button>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 hover:text-rose-400 cursor-pointer"
                  title="Bersihkan riwayat"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto pr-0.5">
            {items.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-4 text-center">
                Belum ada riwayat salinan teks.
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCopyItem(item)}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.05] text-left transition-colors cursor-pointer"
                >
                  <span className="text-[11.5px] text-zinc-200 truncate flex-1 font-mono">
                    {item.text}
                  </span>
                  {copiedId === item.id ? (
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5 shrink-0">
                      <Check size={11} /> Disalin
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 shrink-0">
                      Salin
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
