import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Copy, Check } from "lucide-react";
import QRCode from "qrcode";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Tooltip } from "../Tooltip";
import { t, getLanguage } from "../../../services/i18n";
import {
  ShelfSessionInfo,
  ShelfTransferProgressPayload,
  ShelfTransferMode,
} from "../../../types/shelfTransfer";

interface DropShelfTransferModalProps {
  mode: ShelfTransferMode;
  session: ShelfSessionInfo | null;
  incomingProgress: Record<string, ShelfTransferProgressPayload>;
  activeDeviceName?: string;
  onClose: () => void;
  onCancel: () => void;
}

export const DropShelfTransferModal: React.FC<DropShelfTransferModalProps> = ({
  mode,
  session,
  incomingProgress,
  activeDeviceName,
  onClose,
  onCancel,
}) => {
  const isEn = getLanguage() === "en";
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);

  // Generate QR Code with proper quiet zone margin and high resolution
  useEffect(() => {
    if (!session?.url) return;
    setSecondsRemaining(session.expires_in_sec || 300);

    QRCode.toDataURL(session.url, {
      margin: 2,
      width: 256,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR Code generation error:", err));
  }, [session?.url, session?.expires_in_sec]);

  // Countdown timer (5 minutes)
  useEffect(() => {
    if (mode === "idle") return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [mode]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }, [secondsRemaining]);

  const handleCopyLink = async () => {
    if (!session?.url) return;
    try {
      await writeText(session.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  const totalSharedSize = useMemo(() => {
    if (!session?.files) return "";
    const totalBytes = session.files.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes < 1024 * 1024) {
      return `${(totalBytes / 1024).toFixed(1)} KB`;
    }
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [session?.files]);

  const progressList = Object.values(incomingProgress);
  const activeSpeed = progressList.find((p) => p.speed_formatted)?.speed_formatted || "";
  const totalIncomingBytes = progressList.reduce((acc, p) => acc + p.transferred, 0);
  const totalIncomingFormatted =
    totalIncomingBytes < 1024 * 1024
      ? `${(totalIncomingBytes / 1024).toFixed(1)} KB`
      : `${(totalIncomingBytes / (1024 * 1024)).toFixed(1)} MB`;

  const isSend = mode === "send";
  const isReceive = mode === "receive";
  const isReceiving = mode === "receiving";

  return (
    <div className="absolute inset-0 z-30 bg-[#000000]/95 backdrop-blur-xl flex flex-col px-4 py-1.5 select-none text-white animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex items-center gap-2 shrink-0 h-7 border-b border-white/[0.08] pb-1">
        <Tooltip content={isEn ? "Back" : "Kembali"} side="bottom">
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            type="button"
          >
            <ChevronLeft size={14} strokeWidth={2.4} />
          </button>
        </Tooltip>

        <div className="font-semibold text-[13.5px] tracking-tight flex-1">
          {isSend && (isEn ? "Send to Phone" : "Kirim ke HP")}
          {isReceive && (isEn ? "Receive from Phone" : "Terima dari HP")}
          {isReceiving && (isEn ? "Receiving from Phone" : "Menerima dari HP")}
        </div>

        {/* Status indicator on header */}
        {isReceiving ? (
          <div className="h-6 px-2.5 rounded-full bg-[#17171c] border border-white/10 text-zinc-200 text-[10px] font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{activeDeviceName || "Smartphone"}</span>
          </div>
        ) : (
          <div className="h-6 px-2.5 rounded-full bg-[#17171c] border border-white/10 text-zinc-300 text-[10px] font-medium flex items-center gap-1.5 tabular-nums">
            <span className="text-zinc-400">
              {isSend ? t("shelf_waiting_phone") : t("shelf_receive_mode_active")} ·
            </span>
            <span className={secondsRemaining < 60 ? "text-amber-400 font-semibold" : "text-white font-semibold"}>
              {t("shelf_expires_in", { time: formattedTime })}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isReceiving ? (
        /* Progress View (Board 62) */
        <div className="flex-1 flex flex-col min-h-0 pt-1.5 pb-0.5 overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {progressList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
                <span>{isEn ? "Waiting for file stream..." : "Menunggu pengiriman file..."}</span>
              </div>
            ) : (
              progressList.map((item) => {
                const ext = item.name.split(".").pop()?.toUpperCase() || "FILE";
                const isCompleted = item.status === "completed" || item.progress >= 100;
                return (
                  <div
                    key={item.id}
                    className="h-10 px-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center gap-2.5"
                  >
                    <span className="font-mono text-[9.5px] text-zinc-400 uppercase w-7 shrink-0">
                      {ext}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-zinc-200 truncate">{item.name}</div>
                      <div className="text-[9.5px] text-zinc-400">
                        {item.size > 0 ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : "--"}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {isCompleted ? (
                        <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                          <Check size={12} strokeWidth={2.6} />
                          <span>{isEn ? "done" : "selesai"}</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-[#3882F6] rounded-full transition-all duration-150"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-[#3882F6] tabular-nums">
                            {item.progress}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer stats */}
          <div className="shrink-0 pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[11px]">
            <div className="text-zinc-400 tabular-nums">
              {progressList.length} {isEn ? "files" : "file"} · {totalIncomingFormatted}
              {activeSpeed ? ` · ${activeSpeed}` : ""}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onCancel}
                className="h-6 px-2.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white text-[10px] font-medium transition-colors cursor-pointer"
              >
                {t("shelf_cancel")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-6 px-3 rounded bg-[#3882F6] hover:bg-[#2563eb] text-white text-[10px] font-medium transition-colors cursor-pointer"
              >
                {t("shelf_done")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* QR Code & Step Instructions View (Boards 60 & 61) */
        <div className="flex-1 flex items-center gap-4 sm:gap-6 min-h-0 pt-1 pb-0.5 overflow-hidden">
          {/* Left: QR Code Box - perfectly sized so it never clips */}
          <div className="w-[116px] h-[116px] sm:w-[124px] sm:h-[124px] shrink-0 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-md">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-full h-full object-contain block select-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-[10px]">
                Generating...
              </div>
            )}
          </div>

          {/* Right: Steps and URL */}
          <div className="flex-1 flex flex-col justify-between min-h-0 py-0.5">
            {/* Numbered Steps */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-zinc-200">
                <span className="w-3.5 h-3.5 rounded-full bg-[#1b1b22] border border-white/10 text-[9px] font-bold text-zinc-300 flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="truncate">{t("shelf_step_wifi")}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-200">
                <span className="w-3.5 h-3.5 rounded-full bg-[#1b1b22] border border-white/10 text-[9px] font-bold text-zinc-300 flex items-center justify-center shrink-0">
                  2
                </span>
                <span className="truncate">{isSend ? t("shelf_step_scan_send") : t("shelf_step_scan_receive")}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-200">
                <span className="w-3.5 h-3.5 rounded-full bg-[#1b1b22] border border-white/10 text-[9px] font-bold text-zinc-300 flex items-center justify-center shrink-0">
                  3
                </span>
                <span className="truncate">{isSend ? t("shelf_step_download") : t("shelf_step_upload")}</span>
              </div>
            </div>

            {/* URL Box & Actions */}
            <div className="mt-1 space-y-1">
              <div className="h-7 rounded-lg bg-[#101015] border border-white/10 flex items-center gap-1.5 px-2">
                <span className="text-[10.5px] font-mono text-zinc-300 truncate flex-1 select-all">
                  {session?.url?.replace(/^https?:\/\//, "") || "..."}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="h-5 px-1.5 rounded bg-white/[0.08] hover:bg-white/[0.15] text-[9.5px] font-medium text-zinc-200 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                  <span>{copied ? (isEn ? "Copied" : "Tersalin") : t("shelf_copy_link")}</span>
                </button>
                <button
                  type="button"
                  onClick={isSend ? onCancel : onClose}
                  className="h-5 px-2 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[9.5px] font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  {isSend ? t("shelf_cancel") : t("shelf_done")}
                </button>
              </div>

              {/* Bottom Notice */}
              <div className="text-[9.5px] text-zinc-400 truncate">
                {isSend ? (
                  <span>
                    {session?.files?.length || 0} file · {totalSharedSize}. {t("shelf_local_only")}
                  </span>
                ) : (
                  <span>{t("shelf_can_send_multiple")}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
