import React, { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Heart,
  ExternalLink,
  Copy,
  Check,
  QrCode,
  Maximize2,
  X,
} from "lucide-react";
import { Language } from "../../services/i18n";

interface SupportViewProps {
  optLanguage: Language;
  isLightMode: boolean;
}

const SAWERIA_URL = "https://saweria.co/payes";
const SOCIABUZZ_URL = "https://sociabuzz.com/itsgili/tribe";

export const SupportView: React.FC<SupportViewProps> = ({
  optLanguage,
  isLightMode,
}) => {
  const isId = optLanguage === "id";
  const [copiedTarget, setCopiedTarget] = useState<"saweria" | "sociabuzz" | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleCopyLink = async (url: string, target: "saweria" | "sociabuzz") => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget(null), 2000);
    } catch {}
  };

  const cardClass = isLightMode
    ? "bg-white/90 border border-black/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
    : "bg-[#16161b]/95 border border-white/[0.07] shadow-[0_8px_28px_rgba(0,0,0,0.35)]";

  return (
    <div className="flex flex-col gap-4 w-full pb-6">
      {/* 1. Header Appreciation Banner */}
      <div className={`w-full rounded-[20px] p-4 flex items-center gap-3.5 ${cardClass}`}>
        <div className="w-11 h-11 rounded-[13px] bg-[#ff2d55] text-white flex items-center justify-center shrink-0 shadow-sm">
          <Heart size={21} strokeWidth={2.2} className="fill-white/20" />
        </div>
        <div className="flex flex-col min-w-0">
          <h3
            className={`text-[14px] font-semibold leading-snug ${
              isLightMode ? "text-neutral-900" : "text-white"
            }`}
          >
            {isId ? "Dukung Pengembangan Gili" : "Support Gili Development"}
          </h3>
          <p
            className={`text-[12px] leading-relaxed mt-0.5 ${
              isLightMode ? "text-neutral-600" : "text-zinc-400"
            }`}
          >
            {isId
              ? "Gili dikembangkan secara independen. Jika aplikasi ini membantu produktivitas harianmu, kamu bisa memberikan dukungan melalui Saweria, SociaBuzz, atau scan QRIS di bawah ini."
              : "Gili is independently built. If this app helps your daily workflow, you can support its continued development via Saweria, SociaBuzz, or by scanning the QRIS code below."}
          </p>
        </div>
      </div>

      {/* 2. Saweria Link Card */}
      <div className={`w-full rounded-[20px] p-4 flex items-center justify-between gap-3 ${cardClass}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[12px] overflow-hidden shrink-0 border border-black/[0.08]">
            <img src="/logo/saweria.jpg" alt="Saweria" className="w-full h-full object-cover" draggable={false} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`text-[13.5px] font-semibold truncate ${
                isLightMode ? "text-neutral-900" : "text-white"
              }`}
            >
              Saweria — payes
            </span>
            <span
              className={`text-[12px] font-mono truncate mt-0.5 ${
                isLightMode ? "text-[#0a84ff]" : "text-[#5ac8fa]"
              }`}
            >
              {SAWERIA_URL}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleCopyLink(SAWERIA_URL, "saweria")}
            className={`px-3 py-2 rounded-[11px] text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.05] hover:bg-black/[0.09] text-neutral-700"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200"
            }`}
          >
            {copiedTarget === "saweria" ? (
              <>
                <Check size={13.5} className="text-[#30d158]" />
                <span>{isId ? "Tersalin" : "Copied"}</span>
              </>
            ) : (
              <>
                <Copy size={13.5} />
                <span>{isId ? "Salin Link" : "Copy Link"}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleOpenUrl(SAWERIA_URL)}
            className="px-3.5 py-2 rounded-[11px] bg-[#0a84ff] hover:bg-[#0070e0] text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{isId ? "Buka Saweria" : "Open Saweria"}</span>
            <ExternalLink size={13.5} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* 3. SociaBuzz Link Card */}
      <div className={`w-full rounded-[20px] p-4 flex items-center justify-between gap-3 ${cardClass}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[12px] overflow-hidden shrink-0 border border-black/[0.08]">
            <img src="/logo/sociabuzz_logo.jpg" alt="SociaBuzz" className="w-full h-full object-cover" draggable={false} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`text-[13.5px] font-semibold truncate ${
                isLightMode ? "text-neutral-900" : "text-white"
              }`}
            >
              SociaBuzz — itsgili
            </span>
            <span
              className={`text-[12px] font-mono truncate mt-0.5 ${
                isLightMode ? "text-[#0a84ff]" : "text-[#5ac8fa]"
              }`}
            >
              {SOCIABUZZ_URL}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleCopyLink(SOCIABUZZ_URL, "sociabuzz")}
            className={`px-3 py-2 rounded-[11px] text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.05] hover:bg-black/[0.09] text-neutral-700"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200"
            }`}
          >
            {copiedTarget === "sociabuzz" ? (
              <>
                <Check size={13.5} className="text-[#30d158]" />
                <span>{isId ? "Tersalin" : "Copied"}</span>
              </>
            ) : (
              <>
                <Copy size={13.5} />
                <span>{isId ? "Salin Link" : "Copy Link"}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleOpenUrl(SOCIABUZZ_URL)}
            className="px-3.5 py-2 rounded-[11px] bg-[#00c28e] hover:bg-[#00a87b] text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{isId ? "Buka SociaBuzz" : "Open SociaBuzz"}</span>
            <ExternalLink size={13.5} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* 4. QRIS Card */}
      <div className={`w-full rounded-[20px] p-4 flex flex-col gap-3.5 ${cardClass}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-[#0a84ff] text-white flex items-center justify-center shrink-0">
              <QrCode size={16} strokeWidth={2.2} />
            </div>
            <div className="flex flex-col">
              <span
                className={`text-[13px] font-semibold leading-tight ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                QRIS — FYURL
              </span>
              <span
                className={`text-[11px] leading-tight mt-0.5 ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                NMID: ID1026570218432 • {isId ? "Mendukung semua Mobile Banking & E-Wallet" : "Supports all Indonesian Mobile Banking & E-Wallets"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            className={`px-2.5 py-1.5 rounded-[9px] text-[11.5px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.05] hover:bg-black/[0.09] text-neutral-700"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200"
            }`}
          >
            <Maximize2 size={12.5} />
            <span>{isId ? "Perbesar" : "Enlarge"}</span>
          </button>
        </div>

        <div className="w-full flex flex-col items-center justify-center py-2">
          <div
            onClick={() => setIsZoomed(true)}
            title={isId ? "Klik untuk memperbesar QRIS" : "Click to enlarge QRIS"}
            className="bg-white rounded-[18px] p-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.25)] border border-black/10 cursor-zoom-in transition-transform hover:scale-[1.01]"
          >
            <img
              src="/qris-support.png"
              alt="QRIS FYURL"
              draggable={false}
              className="w-[270px] h-auto rounded-[12px] object-contain select-none"
            />
          </div>
          <span
            className={`text-[11px] mt-2.5 ${
              isLightMode ? "text-neutral-500" : "text-zinc-400"
            }`}
          >
            {isId
              ? "Klik gambar QRIS untuk tampilan ukuran penuh"
              : "Click the QRIS image for full-size view"}
          </span>
        </div>
      </div>

      {/* Fullscreen QRIS Lightbox Modal */}
      {isZoomed && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-[22px] p-3 shadow-2xl max-h-[90vh] flex flex-col items-center"
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#1c1c22] text-white border border-white/15 flex items-center justify-center shadow-lg hover:bg-[#e81123] transition-colors cursor-pointer"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
            <img
              src="/qris-support.png"
              alt="QRIS FYURL"
              draggable={false}
              className="max-h-[82vh] w-auto rounded-[14px] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
