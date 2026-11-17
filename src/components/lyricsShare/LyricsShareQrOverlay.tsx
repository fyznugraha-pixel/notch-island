import React, { useEffect, useState } from "react";
import { Check, Copy, Smartphone, Wifi, X } from "lucide-react";
import QRCode from "qrcode";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { tx, useTaskbarLang } from "../../services/taskbarI18n";
import type { ShelfSessionInfo } from "../../types/shelfTransfer";

interface LyricsShareQrOverlayProps {
  session: ShelfSessionInfo;
  previewImageUrl?: string | null;
  onClose: () => void;
}

export const LyricsShareQrOverlay: React.FC<LyricsShareQrOverlayProps> = ({
  session,
  previewImageUrl,
  onClose,
}) => {
  const lang = useTaskbarLang();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.expires_in_sec || 300);

  useEffect(() => {
    setSecondsLeft(session.expires_in_sec || 300);
    QRCode.toDataURL(session.url, {
      margin: 2,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error("QR generation failed:", err));
  }, [session.url, session.expires_in_sec]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdown = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

  const handleCopyUrl = async () => {
    try {
      await writeText(session.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch (e) {
      console.error("Failed to copy QR URL:", e);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tx(lang, "Send Lyrics Card to Phone", "Kirim Kartu Lirik ke HP")}
      className="absolute inset-0 z-40 bg-[#0b0b10]/94 backdrop-blur-xl flex items-center justify-center p-6 select-none"
    >
      <div className="w-full max-w-[520px] rounded-2xl border border-white/10 bg-[#13131a] p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#3882F6]/15 border border-[#3882F6]/30 text-[#68a3ff] flex items-center justify-center shrink-0">
              <Smartphone size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-white truncate">
                {tx(lang, "Send Card to Phone", "Kirim Kartu ke HP")}
              </div>
              <div className="text-[11px] text-zinc-400 tabular-nums">
                {tx(lang, `Active ${countdown} on same Wi-Fi`, `Aktif ${countdown} di Wi-Fi yang sama`)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx(lang, "Close QR share", "Tutup QR kirim")}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-5">
          <div className="w-[152px] h-[152px] rounded-xl bg-white p-2 shrink-0 flex items-center justify-center shadow-md">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[11px] text-zinc-500">Generating...</span>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            {previewImageUrl && (
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                <img
                  src={previewImageUrl}
                  alt=""
                  className="w-9 h-9 rounded-md object-cover shrink-0 border border-white/10"
                />
                <div className="min-w-0">
                  <div className="text-[11.5px] font-medium text-zinc-100 truncate">
                    {session.files?.[0]?.name || "gili-lyrics-card.png"}
                  </div>
                  <div className="text-[10.5px] text-zinc-400">
                    {session.files?.[0]?.size_formatted || "PNG Image"}
                  </div>
                </div>
              </div>
            )}

            <ol className="space-y-1 text-[11.5px] text-zinc-300 leading-snug">
              <li>1. {tx(lang, "Ensure phone & PC share the same Wi-Fi.", "Pastikan HP & PC di Wi-Fi yang sama.")}</li>
              <li>2. {tx(lang, "Scan QR code with camera or scanner app.", "Scan QR lewat kamera atau pemindai HP.")}</li>
              <li>3. {tx(lang, "Tap Download Image to save to gallery.", "Ketuk unduh untuk simpan ke galeri HP.")}</li>
            </ol>

            <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-black/40 border border-white/10">
              <Wifi size={12} className="text-zinc-500 shrink-0" />
              <span className="text-[11px] font-mono text-zinc-300 truncate flex-1 select-all">
                {session.url}
              </span>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-2 py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-[10.5px] font-medium text-zinc-200 flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
              >
                {copiedUrl ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span>{copiedUrl ? tx(lang, "Copied", "Tersalin") : tx(lang, "Copy", "Salin")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
