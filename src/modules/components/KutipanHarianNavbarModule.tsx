import React, { useState, useRef } from "react";
import { Quote, RefreshCw, Copy, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

const QUOTES = [
  "Mulai dulu, sempurnakan sambil jalan.",
  "Sedikit kemajuan setiap hari menghasilkan hasil besar.",
  "Fokus pada progres, bukan kesempurnaan.",
  "Disiplin adalah jembatan antara tujuan dan pencapaian.",
  "Istirahat sejenak adalah bagian dari produktivitas.",
];

export const KutipanHarianNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const currentQuote = QUOTES[idx % QUOTES.length];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentQuote).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Kutipan Harian: "${currentQuote}"`}
      >
        <Quote size={15} className="text-[#f472b6] shrink-0" />
        {!isCompact && (
          <span className="text-[11px] italic text-zinc-200 truncate max-w-[165px]">
            "{currentQuote}"
          </span>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Kutipan Harian"
        moduleId="kutipan_harian"
        currentView={view}
        config={config}
        width={260}
      >
        <div className="flex flex-col gap-2.5">
          <div className="p-3 rounded-[10px] bg-white/[0.04] border border-white/[0.06] text-[12px] italic text-zinc-100 leading-relaxed">
            "{currentQuote}"
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIdx((i) => (i + 1) % QUOTES.length)}
              className="flex-1 h-7 rounded-[7px] bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
            >
              <RefreshCw size={11} />
              <span>Kutipan Lain</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="h-7 px-2.5 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              <span>{copied ? "Disalin" : "Salin"}</span>
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
