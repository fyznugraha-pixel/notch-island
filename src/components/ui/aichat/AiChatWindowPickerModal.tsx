import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  RotateCw,
  Check,
  Lock,
  Loader2,
  FileText,
  Terminal,
  AppWindow,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AiBrandLogo } from "./AiBrandLogos";
import type { ActiveWindowItem, AiMessageContext } from "./AiChatTypes";

interface AiChatWindowPickerModalProps {
  onClose: () => void;
  onAttachContext: (context: AiMessageContext) => void;
  accentColor?: string;
}

export const AiChatWindowPickerModal: React.FC<AiChatWindowPickerModalProps> = ({
  onClose,
  onAttachContext,
  accentColor = "#3882F6",
}) => {
  const [windows, setWindows] = useState<ActiveWindowItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [readMode, setReadMode] = useState<"text" | "screenshot">(() => {
    try {
      const saved = localStorage.getItem("island_ai_window_read_mode");
      if (saved === "text" || saved === "screenshot") return saved;
    } catch {}
    return "screenshot";
  });

  const handleSetReadMode = (mode: "text" | "screenshot") => {
    setReadMode(mode);
    try {
      localStorage.setItem("island_ai_window_read_mode", mode);
    } catch {}
  };
  const [censorSensitive, setCensorSensitive] = useState<boolean>(true);

  const fetchWindows = useCallback(async () => {
    setLoading(true);
    try {
      const rawList = await invoke<any[]>("get_open_windows");
      if (Array.isArray(rawList) && rawList.length > 0) {
        const list: ActiveWindowItem[] = rawList.map((item: any) => ({
          id: String(item.id || item.hwnd),
          appName: item.appName || item.app_name || "Aplikasi",
          windowTitle: item.windowTitle || item.window_title || item.title || "",
          iconType: item.iconType || item.icon_type || "default",
          isActive: Boolean(item.isActive ?? item.is_active),
          isBlocked: Boolean(item.isBlocked ?? item.is_blocked),
          hwnd: item.hwnd,
          pid: item.pid,
          appIconUrl: item.appIconUrl || item.app_icon_url || undefined,
        }));
        setWindows(list);
        setSelectedId((prev) => {
          if (prev && list.some((w) => w.id === prev && !w.isBlocked)) return prev;
          const active = list.find((w) => w.isActive && !w.isBlocked);
          return active ? active.id : (list.find((w) => !w.isBlocked)?.id || list[0].id);
        });
      } else {
        setWindows([]);
      }
    } catch (err) {
      console.warn("Failed to get open windows:", err);
      setWindows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWindows();
  }, [fetchWindows]);

  const selectedWin = windows.find((w) => w.id === selectedId) || windows[0];

  const handleConfirm = async () => {
    if (!selectedWin || selectedWin.isBlocked) return;

    setCapturing(true);
    try {
      if (selectedWin.hwnd) {
        const res: any = await invoke("capture_window_context", {
          hwnd: selectedWin.hwnd,
          readMode,
        });

        let text = res.previewText || res.preview_text || "";
        if (censorSensitive && text) {
          text = text
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email disembunyikan]")
            .replace(/sk-[a-zA-Z0-9_-]+/g, "[token disembunyikan]");
        }

        const title = res.title || selectedWin.windowTitle;
        const imgUrl = res.imageDataUrl || res.image_data_url || undefined;
        const charCount = typeof res.characterCount === "number" ? res.characterCount : (text ? text.length : 0);

        onAttachContext({
          type: "window",
          title: `${selectedWin.appName} · ${title}`,
          characterCount: charCount,
          previewText: text,
          imageDataUrl: imgUrl,
        });
        onClose();
        return;
      }
    } catch (err) {
      console.warn("capture_window_context failed, falling back to window title:", err);
    } finally {
      setCapturing(false);
    }

    let fallbackText = selectedWin.windowTitle;
    onAttachContext({
      type: "window",
      title: `${selectedWin.appName} · ${selectedWin.windowTitle}`,
      characterCount: fallbackText.length,
      previewText: fallbackText,
    });
    onClose();
  };

  const renderAppIcon = (win: ActiveWindowItem) => {
    if (win.appIconUrl) {
      return (
        <img
          src={win.appIconUrl}
          alt={win.appName}
          className="w-5 h-5 rounded-[5px] object-contain shrink-0"
        />
      );
    }

    const nameLower = (win.appName || "").toLowerCase();
    const typeLower = (win.iconType || "").toLowerCase();

    if (typeLower === "antigravity" || nameLower.includes("antigravity")) {
      return <AiBrandLogo provider="antigravity" size={20} />;
    }
    if (typeLower === "vscode" || nameLower.includes("code") || nameLower.includes("cursor")) {
      return <AiBrandLogo provider="vscode" size={20} />;
    }
    if (typeLower === "discord" || nameLower.includes("discord")) {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="#5865F2" className="shrink-0">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      );
    }
    if (typeLower === "chrome" || nameLower.includes("chrome")) {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0">
          <circle cx="12" cy="12" r="10" fill="#EA4335" />
          <path d="M12 2a10 10 0 0 1 8.66 5H12z" fill="#EA4335" />
          <path d="M20.66 7A10 10 0 0 1 17 20.66L12 12z" fill="#FBBC05" />
          <path d="M17 20.66A10 10 0 0 1 3.34 17L12 12z" fill="#34A853" />
          <circle cx="12" cy="12" r="4.8" fill="#FFFFFF" />
          <circle cx="12" cy="12" r="3.6" fill="#4285F4" />
        </svg>
      );
    }
    if (typeLower === "edge" || nameLower.includes("edge")) {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" className="shrink-0">
          <circle cx="12" cy="12" r="9" fill="#0078D7" />
          <path d="M12 4C7.58 4 4 7.58 4 12c0 2.5 1.15 4.74 2.96 6.22C8.36 15.65 11.2 14.5 14 14.5c3 0 5 1.5 5 4 0 .5-.1 1-.25 1.5A9.97 9.97 0 0 0 22 12c0-5.52-4.48-10-10-10z" fill="#00BCF2" />
        </svg>
      );
    }
    if (typeLower === "terminal" || nameLower.includes("terminal") || nameLower.includes("powershell") || nameLower.includes("cmd")) {
      return <Terminal size={15} className="text-emerald-400 shrink-0" />;
    }
    if (typeLower === "word" || nameLower.includes("word")) {
      return (
        <div className="w-[18px] h-[18px] rounded-[4px] bg-[#185abd] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
          W
        </div>
      );
    }
    if (typeLower === "excel" || nameLower.includes("excel")) {
      return (
        <div className="w-[18px] h-[18px] rounded-[4px] bg-[#107c41] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
          X
        </div>
      );
    }
    if (typeLower === "notepad" || nameLower.includes("notepad")) {
      return <FileText size={15} className="text-amber-400 shrink-0" />;
    }
    return (
      <span className="text-[12px] font-bold text-white shrink-0">
        {win.appName ? win.appName[0].toUpperCase() : <AppWindow size={14} />}
      </span>
    );
  };

  return (
    <div className="grow flex flex-col justify-between w-full h-full select-none pt-2">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          aria-label="Kembali ke AI Chat"
          onClick={onClose}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div className="text-[18px] font-semibold tracking-[-0.02em] text-white grow">
          Baca jendela
        </div>
        <button
          type="button"
          aria-label="Segarkan daftar jendela"
          onClick={fetchWindows}
          disabled={loading}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all disabled:opacity-50"
        >
          <RotateCw size={15} strokeWidth={2} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Mode Bar */}
      <div className="flex items-center gap-3 mt-3 h-8 shrink-0">
        <div className="flex gap-1 p-0.5 bg-white/[0.06] border border-white/10 rounded-[16px]">
          <button
            type="button"
            onClick={() => handleSetReadMode("screenshot")}
            style={{
              background: readMode === "screenshot" ? accentColor : "transparent",
              color: readMode === "screenshot" ? "#04101f" : "#c4c4cc",
            }}
            className="h-6 px-3 rounded-[12px] text-[12px] font-semibold cursor-pointer transition-all"
          >
            Tangkapan layar
          </button>
          <button
            type="button"
            onClick={() => handleSetReadMode("text")}
            style={{
              background: readMode === "text" ? accentColor : "transparent",
              color: readMode === "text" ? "#04101f" : "#c4c4cc",
            }}
            className="h-6 px-3 rounded-[12px] text-[12px] font-semibold cursor-pointer transition-all"
          >
            Teks
          </button>
        </div>
        <span className="text-[12px] text-[#a1a1aa] grow truncate">
          {readMode === "text"
            ? "Teks lebih hemat token dan bisa disensor otomatis."
            : "Mengirim tangkapan layar jendela ke model AI multimodal."}
        </span>
        <span className="h-5 px-2 rounded-full bg-white/[0.06] flex items-center text-[11px] text-[#c4c4cc] tabular-nums">
          {windows.length} jendela
        </span>
      </div>

      {/* Window List */}
      <div
        data-scrollable="true"
        className="flex flex-col gap-1.5 mt-2 grow min-h-0 overflow-y-auto settings-scroll pr-1"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[#a1a1aa] text-[13px]">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span>Memindai jendela yang terbuka...</span>
          </div>
        ) : windows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#a1a1aa] text-center gap-1.5">
            <AppWindow size={24} className="opacity-40" />
            <span className="text-[13px] font-medium">Tidak ada jendela yang terbuka</span>
            <span className="text-[11px] text-[#71717a]">
              Buka aplikasi lain lalu klik tombol segarkan di atas
            </span>
          </div>
        ) : (
          windows.map((win) => {
            const isSelected = win.id === selectedId;
            if (win.isBlocked) {
              return (
                <div
                  key={win.id}
                  className="w-full flex items-center gap-3 h-11 px-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025] opacity-50 cursor-not-allowed select-none shrink-0"
                >
                  <div className="w-7 h-7 rounded-[9px] bg-white/[0.06] text-[#a1a1aa] flex items-center justify-center shrink-0">
                    <Lock size={13} strokeWidth={2} />
                  </div>
                  <div className="grow min-w-0">
                    <div className="text-[13px] font-medium text-[#a1a1aa]">{win.appName}</div>
                    <div className="text-[11px] text-[#71717a] truncate">Tidak bisa dibaca</div>
                  </div>
                  <span className="h-5 px-2 rounded-full bg-red-500/15 text-red-300 text-[11px] font-medium flex items-center shrink-0">
                    Diblokir
                  </span>
                </div>
              );
            }

            return (
              <button
                key={win.id}
                type="button"
                onClick={() => setSelectedId(win.id)}
                style={{
                  backgroundColor: isSelected ? "rgba(56,130,246,0.25)" : "rgba(255,255,255,0.04)",
                  borderColor: isSelected ? "rgba(56,130,246,0.45)" : "rgba(255,255,255,0.08)",
                }}
                className="w-full flex items-center gap-3 h-11 px-3 rounded-[14px] border text-left cursor-pointer transition-all active:scale-[0.99] shrink-0"
              >
                <div className="w-7 h-7 rounded-[9px] bg-white/10 flex items-center justify-center shrink-0">
                  {renderAppIcon(win)}
                </div>
                <div className="grow min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate">
                    {win.appName}
                  </div>
                  <div className="text-[11px] text-[#d4d4d8] truncate">
                    {win.windowTitle}
                  </div>
                </div>
                {win.isActive && (
                  <span className="h-5 px-2 rounded-full bg-white/[0.12] text-white text-[11px] flex items-center shrink-0">
                    Sedang aktif
                  </span>
                )}
                {isSelected ? (
                  <span className="w-[18px] h-[18px] rounded-full bg-[#f4f4f5] text-black flex items-center justify-center shrink-0">
                    <Check size={11} strokeWidth={3.4} />
                  </span>
                ) : (
                  <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#7a7a86] shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center gap-3 h-[50px] px-3.5 rounded-[26px] border border-white/[0.08] bg-white/[0.04] mt-2 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={censorSensitive}
          onClick={() => setCensorSensitive(!censorSensitive)}
          style={{ background: censorSensitive ? accentColor : "rgba(255,255,255,0.14)" }}
          className="w-10 h-6 rounded-full p-0.5 flex items-center transition-colors cursor-pointer shrink-0"
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-transform ${
              censorSensitive ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span className="grow text-[12px] text-[#d4d4d8] leading-tight">
          Sembunyikan email, nomor kartu, dan token
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={capturing || loading || !selectedWin || selectedWin.isBlocked}
          style={{ background: accentColor }}
          className="h-9 px-4 rounded-full text-black text-[13px] font-semibold flex items-center gap-2 cursor-pointer active:scale-95 shadow-md shrink-0 transition-transform disabled:opacity-50"
        >
          {capturing ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Membaca...</span>
            </>
          ) : (
            <>
              <span>Gunakan konteks</span>
              <span className="text-[11px] font-medium border border-black/35 rounded-md px-1.5">
                Enter
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
