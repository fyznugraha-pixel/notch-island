import React from "react";
import { NavbarConfig, NavbarIconSpacing } from "../../../types/navbar";
import { Layers, Maximize2, Shield, Lock } from "lucide-react";
import { hexToRgba } from "../../../services/navbarConfigService";
import { Language } from "../../../services/i18n";

interface NavbarShapeCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  isProLocked?: boolean;
  onRequirePro?: () => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

export const NavbarShapeCard: React.FC<NavbarShapeCardProps> = ({
  config,
  onChange,
  isProLocked = false,
  onRequirePro,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const isAnchored = config.shape === "anchored";
  const effectiveEnabled = !isProLocked && config.enabled;

  const cardBg = isLightMode
    ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    : "bg-[#121318] border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]";
  const subCardBg = isLightMode
    ? "bg-neutral-50/90 border-black/[0.06]"
    : "bg-white/[0.03] border-white/[0.06]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-600" : "text-zinc-400";

  return (
    <div className={`flex flex-col gap-4 p-5 rounded-[18px] border ${cardBg}`}>
      {/* 1. Master Enable Toggle */}
      <div
        className={`flex items-center justify-between pb-3 border-b ${
          isLightMode ? "border-black/[0.07]" : "border-white/[0.06]"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Shield size={18} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`text-[13px] font-semibold ${textTitle}`}>
                {isId ? "Aktifkan Taskbar Gili" : "Enable Gili Taskbar"}
              </span>
              {isProLocked && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold tracking-wide border ${
                    isLightMode
                      ? "bg-[#eff6ff] text-[#1d4ed8] border-blue-600/25"
                      : "bg-[#0a84ff]/15 text-[#93c5fd] border-[#60a5fa]/30"
                  }`}
                >
                  <Lock size={9} strokeWidth={2.5} aria-hidden="true" />
                  <span>PRO</span>
                </span>
              )}
            </div>
            <span className={`text-[11px] ${textSub}`}>
              {isProLocked
                ? isId
                  ? "Aktifkan lisensi Taskbar Pro di Microsoft Store untuk menjalankan dock"
                  : "Activate Taskbar Pro license from Microsoft Store to run the live dock"
                : isId
                ? "Nyalain dock melayang biar navigasi app makin sat-set & estetik"
                : "Turn on floating dock for smooth app navigation & status"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isProLocked) {
              onRequirePro?.();
              return;
            }
            onChange({ enabled: !config.enabled });
          }}
          aria-pressed={effectiveEnabled}
          aria-label={
            isProLocked
              ? isId
                ? "Beli Taskbar Pro untuk mengaktifkan Taskbar"
                : "Buy Taskbar Pro to enable Taskbar"
              : isId
              ? "Aktifkan Taskbar"
              : "Toggle Taskbar"
          }
          style={{
            backgroundColor: effectiveEnabled ? config.accent : undefined,
          }}
          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa] ${
            effectiveEnabled ? "" : isLightMode ? "bg-black/20" : "bg-white/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
              effectiveEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* 2. Shape Selection (Anchored vs Floating) */}
      <div className="flex flex-col gap-2">
        <label className={`text-[12px] font-semibold ${textTitle}`}>
          {isId ? "Bentuk Bingkai (Shape)" : "Dock Shape"}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Anchored Button */}
          <button
            type="button"
            onClick={() => onChange({ shape: "anchored" })}
            style={
              isAnchored
                ? {
                    backgroundColor: hexToRgba(config.accent, 0.12),
                    borderColor: config.accent,
                    color: config.accent,
                  }
                : undefined
            }
            className={`flex flex-col p-3 rounded-[14px] border text-left transition-all cursor-pointer ${
              isAnchored
                ? "shadow-sm"
                : isLightMode
                ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
            }`}
          >
            {/* SVG Visual Miniature Preview of Anchored */}
            <div className="w-full h-16 rounded-[9px] bg-[#0c0c11] border border-white/10 mb-2.5 overflow-hidden relative flex items-end justify-center select-none pointer-events-none">
              <svg width="100%" height="100%" viewBox="0 0 140 48" fill="none" className="w-full h-full">
                {/* Desktop Grid Lines */}
                <line x1="0" y1="12" x2="140" y2="12" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                <line x1="0" y1="24" x2="140" y2="24" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                <line x1="0" y1="36" x2="140" y2="36" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                
                {/* Screen Bottom Edge Line */}
                <line x1="0" y1="47.5" x2="140" y2="47.5" stroke={isAnchored ? "#3b82f6" : "rgba(255,255,255,0.2)"} strokeWidth="1" />

                {/* Left Inverted Wing */}
                <path d="M 33 48 Q 41 48 41 38 L 41 48 Z" fill="#1b1b22" />
                {/* Right Inverted Wing */}
                <path d="M 99 38 Q 99 48 107 48 L 99 48 Z" fill="#1b1b22" />

                {/* Anchored Dock Body */}
                <path
                  d="M 41 48 L 41 33 Q 41 27 47 27 L 93 27 Q 99 27 99 33 L 99 48 Z"
                  fill="#1b1b22"
                  stroke={isAnchored ? "#3b82f6" : "rgba(255,255,255,0.18)"}
                  strokeWidth="0.8"
                />

                {/* Mini Dock Items */}
                <rect x="46" y="32" width="6.5" height="6.5" rx="2" fill="#fff" fillOpacity="0.9" />
                <rect x="56" y="32" width="6.5" height="6.5" rx="2" fill="#3b82f6" fillOpacity="0.8" />
                <rect x="66" y="32" width="6.5" height="6.5" rx="2" fill="#fff" fillOpacity="0.8" />
                {/* Active Indicator Bar */}
                <line x1="67.5" y1="41" x2="70.5" y2="41" stroke="#3882F6" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="76" y="32" width="6.5" height="6.5" rx="2" fill="#fff" fillOpacity="0.5" />
                {/* Mini Clock */}
                <rect x="86" y="33" width="7" height="4.5" rx="1.5" fill="#fff" fillOpacity="0.6" />
              </svg>
            </div>

            <div className="flex items-center gap-2 mb-1">
              <Layers size={15} />
              <span className="text-[12.5px] font-semibold">
                {isId ? "Nempel (Anchored)" : "Anchored"}
              </span>
            </div>
            <span
              className={`text-[10.5px] leading-relaxed ${
                isAnchored
                  ? isLightMode
                    ? "text-blue-700"
                    : "text-blue-400"
                  : textSub
              }`}
            >
              {isId
                ? "Nempel rapi di pinggir layar pake lekukan sayap yang smooth abis"
                : "Seamlessly hugs the bottom screen edge with smooth wings"}
            </span>
          </button>

          {/* Floating Button */}
          <button
            type="button"
            onClick={() => onChange({ shape: "floating" })}
            style={
              !isAnchored
                ? {
                    backgroundColor: hexToRgba(config.accent, 0.12),
                    borderColor: config.accent,
                    color: config.accent,
                  }
                : undefined
            }
            className={`flex flex-col p-3 rounded-[14px] border text-left transition-all cursor-pointer ${
              !isAnchored
                ? "shadow-sm"
                : isLightMode
                ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
            }`}
          >
            {/* SVG Visual Miniature Preview of Floating */}
            <div className="w-full h-16 rounded-[9px] bg-[#0c0c11] border border-white/10 mb-2.5 overflow-hidden relative flex items-end justify-center select-none pointer-events-none">
              <svg width="100%" height="100%" viewBox="0 0 140 48" fill="none" className="w-full h-full">
                {/* Desktop Grid Lines */}
                <line x1="0" y1="12" x2="140" y2="12" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                <line x1="0" y1="24" x2="140" y2="24" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                <line x1="0" y1="36" x2="140" y2="36" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                
                {/* Screen Bottom Edge Line */}
                <line x1="0" y1="47.5" x2="140" y2="47.5" stroke={!isAnchored ? "#3b82f6" : "rgba(255,255,255,0.2)"} strokeWidth="1" />

                {/* Floating Dock Shadow */}
                <rect x="36" y="32" width="68" height="10" rx="5" fill="#000" fillOpacity="0.5" />

                {/* Floating Capsule Pill Body */}
                <rect
                  x="36"
                  y="23"
                  width="68"
                  height="17"
                  rx="8.5"
                  fill="#1b1b22"
                  stroke={!isAnchored ? "#3b82f6" : "rgba(255,255,255,0.22)"}
                  strokeWidth="0.9"
                />

                {/* Mini Dock Items */}
                <rect x="42" y="28" width="6.5" height="6.5" rx="2" fill="#fff" fillOpacity="0.9" />
                <rect x="52" y="28" width="6.5" height="6.5" rx="2" fill="#3b82f6" fillOpacity="0.8" />
                <rect x="62" y="28" width="6.5" height="6.5" rx="2" fill="#fff" fillOpacity="0.8" />
                {/* Active Indicator Bar */}
                <line x1="63.5" y1="37" x2="66.5" y2="37" stroke="#3882F6" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="72" y="28" width="6.5" height="6.5" rx="2" fill="#fff" fillOpacity="0.5" />
                {/* Mini Clock */}
                <rect x="82" y="29" width="7" height="4.5" rx="1.5" fill="#fff" fillOpacity="0.6" />
              </svg>
            </div>

            <div className="flex items-center gap-2 mb-1">
              <Maximize2 size={15} />
              <span className="text-[12.5px] font-semibold">
                {isId ? "Melayang (Floating)" : "Floating"}
              </span>
            </div>
            <span
              className={`text-[10.5px] leading-relaxed ${
                !isAnchored
                  ? isLightMode
                    ? "text-blue-700"
                    : "text-blue-400"
                  : textSub
              }`}
            >
              {isId
                ? "Kapsul ngambang estetik dengan shadow halus & sudut rounded"
                : "Aesthetic floating capsule with soft shadows & rounded corners"}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Sliders: Radius, Distance, Icon Size & Spacing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Corner Radius */}
        <div className={`flex flex-col justify-between gap-2.5 p-3 rounded-[12px] border ${subCardBg}`}>
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>
              {isId ? "Radius Sudut" : "Corner Radius"}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                isLightMode ? "text-blue-600" : "text-blue-400"
              }`}
            >
              {config.cornerRadius}px
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            value={config.cornerRadius}
            onChange={(e) => onChange({ cornerRadius: Number(e.target.value) })}
            aria-label={isId ? "Radius Sudut" : "Corner Radius"}
            className={`w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#0a84ff] ${
              isLightMode ? "bg-black/10" : "bg-white/10"
            }`}
          />
        </div>

        {/* Distance from bottom (Disabled if anchored) */}
        <div
          className={`flex flex-col justify-between gap-2.5 p-3 rounded-[12px] border transition-opacity ${subCardBg} ${
            isAnchored ? "opacity-45" : ""
          }`}
        >
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>
              {isId ? "Jarak dari Tepi Layar" : "Distance from Edge"}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                isLightMode ? "text-blue-600" : "text-blue-400"
              }`}
            >
              {isAnchored ? "0px" : `${config.distanceFromEdge}px`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={32}
            disabled={isAnchored}
            value={config.distanceFromEdge}
            onChange={(e) => onChange({ distanceFromEdge: Number(e.target.value) })}
            aria-label={isId ? "Jarak dari Tepi Layar" : "Distance from Edge"}
            className={`w-full h-1.5 rounded-full appearance-none accent-[#0a84ff] cursor-pointer disabled:cursor-not-allowed ${
              isLightMode ? "bg-black/10" : "bg-white/10"
            }`}
          />
        </div>

        {/* Taskbar Height */}
        <div className={`flex flex-col justify-between gap-2.5 p-3 rounded-[12px] border ${subCardBg}`}>
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>
              {isId ? "Tinggi Taskbar" : "Taskbar Height"}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                isLightMode ? "text-blue-600" : "text-blue-400"
              }`}
            >
              {config.taskbarHeight ?? 48}px
            </span>
          </div>
          <input
            type="range"
            min={36}
            max={64}
            value={config.taskbarHeight ?? 48}
            onChange={(e) => onChange({ taskbarHeight: Number(e.target.value) })}
            aria-label={isId ? "Tinggi Taskbar" : "Taskbar Height"}
            className={`w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#0a84ff] ${
              isLightMode ? "bg-black/10" : "bg-white/10"
            }`}
          />
        </div>

        {/* App Icon Size */}
        <div className={`flex flex-col justify-between gap-2.5 p-3 rounded-[12px] border ${subCardBg}`}>
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>
              {isId ? "Ukuran Ikon Aplikasi" : "App Icon Size"}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                isLightMode ? "text-blue-600" : "text-blue-400"
              }`}
            >
              {config.iconSize}px
            </span>
          </div>
          <input
            type="range"
            min={24}
            max={56}
            value={config.iconSize}
            onChange={(e) => onChange({ iconSize: Number(e.target.value) })}
            aria-label={isId ? "Ukuran Ikon Aplikasi" : "App Icon Size"}
            className={`w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#0a84ff] ${
              isLightMode ? "bg-black/10" : "bg-white/10"
            }`}
          />
        </div>

        {/* Icon Spacing Segmented Control */}
        <div className={`sm:col-span-2 flex flex-col justify-between gap-2 p-3 rounded-[12px] border ${subCardBg}`}>
          <span className={`text-[11.5px] font-medium ${textTitle}`}>
            {isId ? "Jarak Antar Ikon" : "Icon Spacing"}
          </span>
          <div
            className={`flex items-center p-0.5 rounded-[9px] border ${
              isLightMode
                ? "bg-black/[0.04] border-black/[0.06]"
                : "bg-white/[0.05] border-white/[0.06]"
            }`}
          >
            {(["tight", "normal", "roomy"] as NavbarIconSpacing[]).map((spacing) => {
              const label =
                spacing === "tight"
                  ? (isId ? "Rapat" : "Tight")
                  : spacing === "normal"
                  ? "Normal"
                  : (isId ? "Lega" : "Roomy");
              const isSelected = config.iconSpacing === spacing;
              return (
                <button
                  key={spacing}
                  type="button"
                  onClick={() => onChange({ iconSpacing: spacing })}
                  className={`flex-1 py-1 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#0a84ff] text-white shadow-sm"
                      : isLightMode
                      ? "text-neutral-600 hover:text-neutral-900"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
