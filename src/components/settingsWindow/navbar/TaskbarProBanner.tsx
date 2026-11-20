import React, { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Lock,
  RefreshCw,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Check,
} from "lucide-react";
import { Language } from "../../../services/i18n";
import { TaskbarProStatus } from "../../../services/taskbarProService";

export interface ProPurchaseFeedback {
  kind: "success" | "info" | "error";
  message: string;
}

export type GiliProBannerContext = "taskbar" | "standby" | "widgets";

interface TaskbarProBannerProps {
  proStatus: TaskbarProStatus;
  isPurchasing: boolean;
  isRefreshing: boolean;
  feedback: ProPurchaseFeedback | null;
  highlightPulse?: boolean;
  onPurchase: () => void;
  onRefreshLicense: () => void;
  context?: GiliProBannerContext;
  isLightMode?: boolean;
  optLanguage?: Language;
}

const DISCORD_SERVER_URL = "https://discord.gg/tCtQSa5H";
const DISCORD_USERNAME = "kaixerrs";
const INSTAGRAM_URL = "https://instagram.com/faizngraha";
const MS_REDEEM_URL = "https://redeem.microsoft.com";

export const TaskbarProBanner: React.FC<TaskbarProBannerProps> = ({
  proStatus,
  isPurchasing,
  isRefreshing,
  feedback,
  highlightPulse = false,
  onPurchase,
  onRefreshLicense,
  context = "taskbar",
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const priceLabel = proStatus.formattedPrice?.trim();
  const [discordCopied, setDiscordCopied] = useState(false);

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

  const contactBtnClass = isLightMode
    ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-800 border-black/10"
    : "bg-white/[0.05] hover:bg-white/[0.10] text-zinc-200 border-white/12";

  const contextCopy = {
    taskbar: {
      titleId: "Aktifkan Taskbar, StandBy & Widget dengan Gili Pro",
      titleEn: "Unlock Taskbar, StandBy & Widgets with Gili Pro",
      descId:
        "Semua pengaturan desain, modul, dan Live Preview tetap bisa dicoba di halaman ini. Pembelian satu kali paket Gili Pro membuka aktivasi Taskbar, mode StandBy, dan 34 Widget Desktop.",
      descEn:
        "Every layout option, module, and Live Preview stays open to explore. A single one-time Gili Pro purchase unlocks live Taskbar docking, StandBy display, and all 34 Desktop Widgets.",
    },
    standby: {
      titleId: "Aktifkan StandBy Desk Display dengan Gili Pro",
      titleEn: "Unlock StandBy Desk Display with Gili Pro",
      descId:
        "Semua pengaturan tampilan jam dan widget StandBy bisa dicoba terlebih dahulu. Satu pembelian Gili Pro membuka StandBy, Taskbar, serta Widget Desktop dalam satu paket.",
      descEn:
        "You can configure every StandBy clock face and layout right here. One Gili Pro bundle purchase unlocks StandBy, Taskbar, and Desktop Widgets together.",
    },
    widgets: {
      titleId: "Aktifkan 34 Widget Desktop Native dengan Gili Pro",
      titleEn: "Unlock 34 Native Desktop Widgets with Gili Pro",
      descId:
        "Jelajahi Galeri dan pratinjau warna sepuasnya di sini. Satu pembelian Gili Pro langsung membuka Widget Desktop Direct2D, Taskbar, dan StandBy dalam satu paket.",
      descEn:
        "Explore the Widget Gallery and theme previews freely right here. One Gili Pro bundle unlocks Direct2D Desktop Widgets, Taskbar, and StandBy together.",
    },
  }[context];

  const buyLabel = isPurchasing
    ? isId
      ? "Membuka Microsoft Store..."
      : "Opening Microsoft Store..."
    : priceLabel
    ? isId
      ? `Beli Gili Pro (${priceLabel})`
      : `Buy Gili Pro (${priceLabel})`
    : isId
    ? "Beli Gili Pro"
    : "Buy Gili Pro";

  const handleOpenDiscord = () => {
    navigator.clipboard?.writeText(DISCORD_USERNAME).catch(() => {});
    setDiscordCopied(true);
    window.setTimeout(() => setDiscordCopied(false), 2500);
    openUrl(DISCORD_SERVER_URL).catch(() => {});
  };

  return (
    <section
      aria-label={isId ? "Lisensi Gili Pro" : "Gili Pro License"}
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
              {isId
                ? "Add-on Microsoft Store · Paket Gili Pro"
                : "Microsoft Store Add-on · Gili Pro Bundle"}
            </span>
          </span>

          <span className={`text-[11px] font-medium ${metaColor}`}>
            {priceLabel
              ? isId
                ? `${priceLabel} · Taskbar + StandBy + Widget`
                : `${priceLabel} · Taskbar + StandBy + Widgets`
              : isId
              ? "Sekali beli · Taskbar + StandBy + Widget"
              : "One-time purchase · Taskbar + StandBy + Widgets"}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className={`text-[15px] font-bold tracking-tight leading-snug ${titleColor}`}>
            {isId ? contextCopy.titleId : contextCopy.titleEn}
          </h2>
          <p className={`text-[12px] leading-relaxed ${bodyColor}`}>
            {isId ? contextCopy.descId : contextCopy.descEn}
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

        <div
          className={`pt-3 mt-1 border-t flex flex-col gap-2 ${
            isLightMode ? "border-black/[0.08]" : "border-white/[0.08]"
          }`}
        >
          <p className={`text-[11.5px] leading-relaxed ${metaColor}`}>
            {isId
              ? "Kesulitan membeli Pro di Microsoft Store? Chat developer untuk pembayaran langsung, nanti kamu akan diberikan kode redeem (setelah redeem, klik Pulihkan Pembelian)."
              : "Having trouble purchasing Pro on Microsoft Store? Message the developer for direct payment to receive a Microsoft Store redeem code (then click Restore Purchase)."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenDiscord}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[9px] border text-[11.5px] font-semibold transition-colors cursor-pointer ${contactBtnClass}`}
            >
              <img
                src="/logo/discord.webp"
                alt=""
                aria-hidden="true"
                className="w-3.5 h-3.5 object-contain shrink-0"
              />
              <span>
                {discordCopied
                  ? isId
                    ? `Discord: ${DISCORD_USERNAME} (disalin)`
                    : `Discord: ${DISCORD_USERNAME} (copied)`
                  : `Discord: ${DISCORD_USERNAME}`}
              </span>
              {discordCopied ? (
                <Check size={11} className="text-[#34c759]" aria-hidden="true" />
              ) : (
                <ExternalLink size={11} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => openUrl(INSTAGRAM_URL).catch(() => {})}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[9px] border text-[11.5px] font-semibold transition-colors cursor-pointer ${contactBtnClass}`}
            >
              <img
                src="/logo/Instagram_icon.png"
                alt=""
                aria-hidden="true"
                className="w-3.5 h-3.5 object-contain shrink-0"
              />
              <span>Instagram: @faizngraha</span>
              <ExternalLink size={11} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => openUrl(MS_REDEEM_URL).catch(() => {})}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[9px] border text-[11.5px] font-medium transition-colors cursor-pointer ${contactBtnClass}`}
            >
              <span>{isId ? "Tukar Kode (Microsoft)" : "Redeem Code (Microsoft)"}</span>
              <ExternalLink size={11} aria-hidden="true" />
            </button>
          </div>
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
