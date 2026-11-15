import React from "react";
import { Lock, RefreshCw, LoaderCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { Language } from "../../../services/i18n";
import { TaskbarProStatus } from "../../../services/taskbarProService";

export interface ProPurchaseFeedback {
  kind: "success" | "info" | "error";
  message: string;
}

interface TaskbarProBannerProps {
  proStatus: TaskbarProStatus;
  isPurchasing: boolean;
  isRefreshing: boolean;
  feedback: ProPurchaseFeedback | null;
  highlightPulse?: boolean;
  onPurchase: () => void;
  onRefreshLicense: () => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

export const TaskbarProBanner: React.FC<TaskbarProBannerProps> = ({
  proStatus,
  isPurchasing,
  isRefreshing,
  feedback,
  highlightPulse = false,
  onPurchase,
  onRefreshLicense,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const priceLabel = proStatus.formattedPrice?.trim();

  const cardSurface = isLightMode
    ? "bg-white border-blue-600/30 shadow-[0_2px_12px_rgba(0,0,0,0.05)]"
    : "bg-[#121318] border-[#60a5fa]/35 shadow-[0_6px_22px_rgba(0,0,0,0.35)]";

  const titleColor = isLightMode ? "text-neutral-900" : "text-white";
  const bodyColor = isLightMode ? "text-neutral-700" : "text-zinc-300";
  const metaColor = isLightMode ? "text-neutral-600" : "text-zinc-400";

  const pillBadgeClass = isLightMode
    ? "bg-[#eff6ff] text-[#1d4ed8] border-blue-600/25"
    : "bg-[#0a84ff]/15 text-[#93c5fd] border-[#60a5fa]/30";

  const secondaryBtnClass = isLightMode
    ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-black/15"
    : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border-white/15";

  const buyLabel = isPurchasing
    ? isId
      ? "Membuka Microsoft Store..."
      : "Opening Microsoft Store..."
    : priceLabel
    ? isId
      ? `Beli Taskbar Pro (${priceLabel})`
      : `Buy Taskbar Pro (${priceLabel})`
    : isId
    ? "Beli Taskbar Pro"
    : "Buy Taskbar Pro";

  return (
    <section
      aria-label={isId ? "Lisensi Taskbar Pro" : "Taskbar Pro License"}
      className={`rounded-[18px] border p-5 transition-shadow duration-200 ${cardSurface} ${
        highlightPulse ? "ring-2 ring-[#0a84ff]" : ""
      }`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${pillBadgeClass}`}
          >
            <Lock size={11} strokeWidth={2.3} aria-hidden="true" />
            <span>
              {isId ? "Add-on Microsoft Store · Taskbar Pro" : "Microsoft Store Add-on · Taskbar Pro"}
            </span>
          </span>

          <span className={`text-[11px] font-medium ${metaColor}`}>
            {priceLabel
              ? isId
                ? `${priceLabel} · Sekali beli`
                : `${priceLabel} · One-time purchase`
              : isId
              ? "Sekali beli, aktif selamanya"
              : "One-time purchase, lifetime access"}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className={`text-[15px] font-bold tracking-tight leading-snug ${titleColor}`}>
            {isId
              ? "Aktifkan Taskbar Gili dengan lisensi Pro"
              : "Enable Gili Taskbar with a Pro license"}
          </h2>
          <p className={`text-[12px] leading-relaxed ${bodyColor}`}>
            {isId
              ? "Semua pengaturan desain, modul, dan Live Preview tetap bisa dicoba di halaman ini. Pembelian sekali bayar di Microsoft Store membuka aktivasi dock dan opsi sembunyikan taskbar bawaan Windows."
              : "Every layout option, module, and Live Preview stays open to test on this page. A one-time Microsoft Store purchase unlocks live dock activation and Windows taskbar hiding."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={isPurchasing || proStatus.checking}
            onClick={onPurchase}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[10px] bg-[#0066cc] hover:bg-[#005bb5] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[12.5px] font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]"
          >
            {isPurchasing ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Lock size={13} strokeWidth={2.3} aria-hidden="true" />
            )}
            <span>{buyLabel}</span>
          </button>

          <button
            type="button"
            disabled={isPurchasing || isRefreshing}
            onClick={onRefreshLicense}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[10px] border text-[12px] font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa] ${secondaryBtnClass}`}
          >
            <RefreshCw
              size={13}
              className={isRefreshing ? "animate-spin" : ""}
              aria-hidden="true"
            />
            <span>
              {isRefreshing
                ? isId
                  ? "Memeriksa akun..."
                  : "Checking license..."
                : isId
                ? "Pulihkan Pembelian"
                : "Restore Purchase"}
            </span>
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[11.5px] leading-snug ${
              feedback.kind === "error"
                ? isLightMode
                  ? "bg-red-50 border-red-600/25 text-red-800"
                  : "bg-[#2d161b] border-red-500/35 text-red-200"
                : feedback.kind === "success"
                ? isLightMode
                  ? "bg-emerald-50 border-emerald-600/25 text-emerald-900"
                  : "bg-emerald-950/50 border-emerald-500/35 text-emerald-200"
                : isLightMode
                ? "bg-neutral-100 border-black/10 text-neutral-800"
                : "bg-white/[0.05] border-white/10 text-zinc-200"
            }`}
          >
            {feedback.kind === "success" ? (
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>
    </section>
  );
};
