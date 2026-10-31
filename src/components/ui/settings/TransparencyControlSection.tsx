import React, { useEffect, useState } from "react";
import {
  Layers,
  Blend,
  Droplets,
  Eye,
  SlidersHorizontal,
  Activity,
  Music,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { t, getLanguage } from "../../../services/i18n";

export const PRESET_SOLID = { opacity: 1.0, blur: 0 };
export const PRESET_LIQUID_GLASS = { opacity: 0.78, blur: 68 };
export const PRESET_GLASS = { opacity: 0.54, blur: 45 };

export function getDefaultBlurForOpacity(opacity: number): number {
  const num = Number(opacity);
  if (!Number.isFinite(num) || num >= 0.95) return PRESET_SOLID.blur;
  if (num >= 0.68) return PRESET_LIQUID_GLASS.blur;
  return PRESET_GLASS.blur;
}

export function resolveNotchThemeMode(
  opacity: number,
  blur: number
): "solid" | "glass" | "clear" {
  const op = Number.isFinite(opacity) ? opacity : 1.0;
  const bl = Number.isFinite(blur) ? blur : 0;
  if (op >= 0.96 && bl <= 2) return "solid";
  if (op >= 0.66) return "glass";
  return "clear";
}

export function computeNotchGlassCssVars(
  opacity: number,
  blur: number,
  isLightMode: boolean,
  isExpanded: boolean
): Record<string, string> {
  const clampedOpacity = Math.max(0.15, Math.min(1.0, Number.isFinite(opacity) ? opacity : 1.0));
  const clampedBlur = Math.max(0, Math.min(100, Number.isFinite(blur) ? blur : 0));
  const blurRatio = clampedBlur / 100;
  const isSolid = clampedOpacity >= 0.96 && clampedBlur <= 2;

  if (isSolid) {
    return {
      "--notch-blur": "none",
      "--glass-inner-blur": "none",
    };
  }

  // Backdrop blur radius in px (pure background gaussian blur, 0px to 48px)
  const blurPx = Math.round(blurRatio * 44);
  const satPct = Math.round(100 + blurRatio * 40);
  const innerBlurPx = Math.min(20, Math.round(blurRatio * 16));
  const innerBlurCss = innerBlurPx <= 2 ? "none" : `blur(${innerBlurPx}px)`;

  const expandBoost = isExpanded ? 0.05 : 0;
  if (isLightMode) {
    const cardTopAlpha = Math.min(0.92, Math.max(0.20, clampedOpacity * 0.68 + expandBoost));
    const cardBotAlpha = Math.min(0.88, Math.max(0.15, clampedOpacity * 0.50 + expandBoost));
    const elevatedTopAlpha = Math.min(0.94, cardTopAlpha + 0.08);
    return {
      "--notch-blur": blurPx <= 1 ? "none" : `blur(${blurPx}px) saturate(${satPct}%)`,
      "--glass-inner-blur": innerBlurCss,
      "--glass-card-bg": `linear-gradient(145deg, rgba(255, 255, 255, ${cardTopAlpha.toFixed(2)}) 0%, rgba(246, 246, 252, ${cardBotAlpha.toFixed(2)}) 100%)`,
      "--glass-card-hover-bg": `linear-gradient(145deg, rgba(255, 255, 255, ${Math.min(0.96, cardTopAlpha + 0.1).toFixed(2)}) 0%, rgba(246, 246, 252, ${Math.min(0.92, cardBotAlpha + 0.08).toFixed(2)}) 100%)`,
      "--glass-elevated-bg": `linear-gradient(145deg, rgba(255, 255, 255, ${elevatedTopAlpha.toFixed(2)}) 0%, rgba(242, 242, 250, ${cardTopAlpha.toFixed(2)}) 100%)`,
    };
  }

  // Dark mode: pure transparency opacity, not polluted by blur:
  const darkBase = Math.min(0.86, Math.max(0.22, clampedOpacity * 0.60 + expandBoost));
  const darkEnd = Math.min(0.82, Math.max(0.16, clampedOpacity * 0.46 + expandBoost));
  const elevatedBase = Math.min(0.90, darkBase + 0.08);
  const elevatedEnd = Math.min(0.86, darkEnd + 0.06);

  return {
    "--notch-blur": blurPx <= 1 ? "none" : `blur(${blurPx}px) saturate(${satPct}%)`,
    "--glass-inner-blur": innerBlurCss,
    "--glass-card-bg": `linear-gradient(145deg, rgba(26, 26, 35, ${darkBase.toFixed(2)}) 0%, rgba(16, 16, 22, ${darkEnd.toFixed(2)}) 100%)`,
    "--glass-card-hover-bg": `linear-gradient(145deg, rgba(38, 38, 50, ${Math.min(0.92, darkBase + 0.08).toFixed(2)}) 0%, rgba(24, 24, 34, ${Math.min(0.88, darkEnd + 0.08).toFixed(2)}) 100%)`,
    "--glass-elevated-bg": `linear-gradient(145deg, rgba(36, 36, 48, ${elevatedBase.toFixed(2)}) 0%, rgba(24, 24, 32, ${elevatedEnd.toFixed(2)}) 100%)`,
  };
}

interface TransparencyControlSectionProps {
  optOpacity: number;
  onChangeOpacity: (val: number) => void;
  optBlur?: number;
  onChangeBlur?: (val: number) => void;
  isLightMode?: boolean;
}

export const TransparencyControlSection: React.FC<TransparencyControlSectionProps> = ({
  optOpacity,
  onChangeOpacity,
  optBlur,
  onChangeBlur,
  isLightMode = false,
}) => {
  const isId = getLanguage() === "id";
  const [activePreviewTab, setActivePreviewTab] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<any>("gili-settings-sync", (event) => {
      const payload = event.payload;
      if (payload && payload.type === "notch_tab_state") {
        setActivePreviewTab(payload.isOpen ? payload.tab : null);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleTogglePreview = (tabName: string = "quick_control") => {
    invoke("trigger_notch_action", { action: `preview_tab:${tabName}` }).catch(() => {});
    setActivePreviewTab((prev) => (prev === tabName ? null : tabName));
  };

  const handleClosePreview = () => {
    invoke("trigger_notch_action", { action: "close_preview_tab" }).catch(() => {});
    setActivePreviewTab(null);
  };

  const effectiveBlur =
    typeof optBlur === "number" && Number.isFinite(optBlur)
      ? Math.round(Math.max(0, Math.min(100, optBlur)))
      : getDefaultBlurForOpacity(optOpacity);

  // Convert internal opacity (1.0 = solid, 0.15 = max transparent) to intuitive Transparency % (0% - 85%)
  const transparencyPct = Math.round(
    Math.max(0, Math.min(85, (1 - (Number.isFinite(optOpacity) ? optOpacity : 1)) * 100))
  );

  const isSolidPreset =
    Math.abs(optOpacity - PRESET_SOLID.opacity) <= 0.03 &&
    Math.abs(effectiveBlur - PRESET_SOLID.blur) <= 4;
  const isLiquidGlassPreset =
    Math.abs(optOpacity - PRESET_LIQUID_GLASS.opacity) <= 0.04 &&
    Math.abs(effectiveBlur - PRESET_LIQUID_GLASS.blur) <= 6;
  const isGlassPreset =
    Math.abs(optOpacity - PRESET_GLASS.opacity) <= 0.05 &&
    Math.abs(effectiveBlur - PRESET_GLASS.blur) <= 6;
  const isCustom = !isSolidPreset && !isLiquidGlassPreset && !isGlassPreset;

  const activePresetValue: "solid" | "liquid_glass" | "glass" = isSolidPreset
    ? "solid"
    : isLiquidGlassPreset
    ? "liquid_glass"
    : isGlassPreset
    ? "glass"
    : optOpacity >= 0.92 && effectiveBlur <= 5
    ? "solid"
    : optOpacity >= 0.66
    ? "liquid_glass"
    : "glass";

  const handleSelectPreset = (preset: "solid" | "liquid_glass" | "glass") => {
    if (preset === "solid") {
      onChangeOpacity(PRESET_SOLID.opacity);
      onChangeBlur?.(PRESET_SOLID.blur);
    } else if (preset === "liquid_glass") {
      onChangeOpacity(PRESET_LIQUID_GLASS.opacity);
      onChangeBlur?.(PRESET_LIQUID_GLASS.blur);
    } else {
      onChangeOpacity(PRESET_GLASS.opacity);
      onChangeBlur?.(PRESET_GLASS.blur);
    }
  };

  const handleTransparencySliderChange = (pct: number) => {
    const clampedPct = Math.max(0, Math.min(85, pct));
    const nextOpacity = Number((1 - clampedPct / 100).toFixed(2));
    onChangeOpacity(nextOpacity);
  };

  const handleBlurSliderChange = (nextBlur: number) => {
    const clampedBlur = Math.max(0, Math.min(100, Math.round(nextBlur)));
    onChangeBlur?.(clampedBlur);
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[12px] hover:bg-white/[0.02] transition-colors">
      {/* Top Row: 3 Default Presets (Solid, Liquid Glass, Glass) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 bg-[#142d1f] text-[#30d158]">
            <Layers size={18} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[13px] font-semibold leading-tight truncate ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                {t("settings_transparency")}
              </span>
              {isCustom && (
                <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-semibold bg-[#3882F6]/15 text-[#3882F6] border border-[#3882F6]/30 leading-none">
                  Custom
                </span>
              )}
            </div>
            <span
              className={`text-[10.5px] leading-tight truncate mt-0.5 ${
                isLightMode ? "text-neutral-500" : "text-[#71717a]"
              }`}
            >
              {t("settings_transparency_desc")}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          <IosSegmentedControl
            value={activePresetValue}
            onChange={(val) => handleSelectPreset(val as "solid" | "liquid_glass" | "glass")}
            options={[
              {
                value: "solid",
                label: t("settings_theme_solid"),
                tooltip: t("settings_theme_solid_tip"),
              },
              {
                value: "liquid_glass",
                label: t("settings_theme_glass"),
                tooltip: t("settings_theme_glass_tip"),
              },
              {
                value: "glass",
                label: t("settings_theme_clear"),
                tooltip: t("settings_theme_clear_tip"),
              },
            ]}
          />
        </div>
      </div>

      {/* Bottom Box: Custom Transparency & Blur Level Sliders */}
      <div
        className={`mt-1 rounded-[12px] p-2.5 flex flex-col gap-2.5 border ${
          isLightMode
            ? "bg-black/[0.03] border-black/[0.07]"
            : "bg-[#0c0c10]/80 border-white/[0.06]"
        }`}
      >
        {/* Slider 1: Tingkat Transparansi */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Droplets size={12.5} className="text-[#30d158]" />
              <span
                className={`text-[11.5px] font-medium ${
                  isLightMode ? "text-neutral-700" : "text-zinc-300"
                }`}
              >
                {t("settings_custom_transparency")}
              </span>
            </div>
            <span
              className={`text-[11px] font-mono font-semibold tabular-nums ${
                isLightMode ? "text-neutral-800" : "text-white"
              }`}
            >
              {transparencyPct}%
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[9.5px] text-zinc-500 w-9 shrink-0">
              {isId ? "Pekat" : "Solid"}
            </span>
            <input
              type="range"
              min={0}
              max={85}
              step={1}
              value={transparencyPct}
              onChange={(e) => handleTransparencySliderChange(Number(e.target.value))}
              className={`flex-1 h-1.5 ${
                isLightMode ? "bg-black/10" : "bg-[#1e1e25]"
              } rounded-full appearance-none cursor-pointer accent-[#30d158]`}
              aria-label={t("settings_custom_transparency")}
            />
            <span className="text-[9.5px] text-zinc-500 w-10 text-right shrink-0">
              {isId ? "Bening" : "Clear"}
            </span>
          </div>
        </div>

        {/* Slider 2: Tingkat Keburaman (Blur) */}
        <div className="flex flex-col gap-1 pt-1 border-t border-white/[0.05]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Blend size={12.5} className="text-[#3882F6]" />
              <span
                className={`text-[11.5px] font-medium ${
                  isLightMode ? "text-neutral-700" : "text-zinc-300"
                }`}
              >
                {t("settings_custom_blur")}
              </span>
            </div>
            <span
              className={`text-[11px] font-mono font-semibold tabular-nums ${
                isLightMode ? "text-neutral-800" : "text-white"
              }`}
            >
              {effectiveBlur}%
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[9.5px] text-zinc-500 w-9 shrink-0">
              0
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={effectiveBlur}
              onChange={(e) => handleBlurSliderChange(Number(e.target.value))}
              className={`flex-1 h-1.5 ${
                isLightMode ? "bg-black/10" : "bg-[#1e1e25]"
              } rounded-full appearance-none cursor-pointer accent-[#3882F6]`}
              aria-label={t("settings_custom_blur")}
            />
            <span className="text-[9.5px] text-zinc-500 w-10 text-right shrink-0">
              100%
            </span>
          </div>
        </div>

        {/* Row 3: Live Preview Tab Action Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5 min-w-0">
            <Eye size={12.5} className="text-[#3882F6] shrink-0" />
            <span
              className={`text-[11px] font-medium truncate ${
                isLightMode ? "text-neutral-700" : "text-zinc-300"
              }`}
            >
              {t("settings_preview_notch_tab")}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleTogglePreview("quick_control")}
              className={`px-2.5 py-1 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 border select-none ${
                activePreviewTab === "quick_control"
                  ? "bg-[#3882F6] text-white border-[#3882F6] shadow-sm shadow-[#3882F6]/30 font-semibold"
                  : isLightMode
                  ? "bg-black/[0.05] hover:bg-black/[0.09] active:bg-black/[0.14] text-neutral-800 border-black/10"
                  : "bg-white/[0.07] hover:bg-white/[0.12] active:bg-white/[0.18] text-white border-white/10"
              }`}
              title={isId ? "Buka Control Center di Notch" : "Open Control Center on Notch"}
            >
              <SlidersHorizontal size={11} className={activePreviewTab === "quick_control" ? "text-white" : "text-[#3882F6]"} />
              <span>
                {activePreviewTab === "quick_control"
                  ? (isId ? "Tab Terbuka (Control Center)" : "Tab Open (Control Center)")
                  : (isId ? "Buka Tab (Control Center)" : "Open Tab (Control Center)")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTogglePreview("sys_monitor")}
              className={`px-2 py-1 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 border select-none ${
                activePreviewTab === "sys_monitor"
                  ? "bg-[#3882F6] text-white border-[#3882F6] shadow-sm shadow-[#3882F6]/30 font-semibold"
                  : isLightMode
                  ? "bg-black/[0.05] hover:bg-black/[0.09] active:bg-black/[0.14] text-neutral-800 border-black/10"
                  : "bg-white/[0.07] hover:bg-white/[0.12] active:bg-white/[0.18] text-zinc-200 border-white/10"
              }`}
              title={isId ? "Buka Monitor Sistem di Notch" : "Open System Monitor on Notch"}
            >
              <Activity size={11} className={activePreviewTab === "sys_monitor" ? "text-white" : "text-[#ff9f0a]"} />
              <span>{t("settings_preview_monitor")}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTogglePreview("media_expanded")}
              className={`px-2 py-1 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 border select-none ${
                activePreviewTab === "media_expanded"
                  ? "bg-[#3882F6] text-white border-[#3882F6] shadow-sm shadow-[#3882F6]/30 font-semibold"
                  : isLightMode
                  ? "bg-black/[0.05] hover:bg-black/[0.09] active:bg-black/[0.14] text-neutral-800 border-black/10"
                  : "bg-white/[0.07] hover:bg-white/[0.12] active:bg-white/[0.18] text-zinc-200 border-white/10"
              }`}
              title={isId ? "Buka Tab Musik di Notch" : "Open Music Tab on Notch"}
            >
              <Music size={11} className={activePreviewTab === "media_expanded" ? "text-white" : "text-[#fc3c44]"} />
              <span>{t("settings_preview_music")}</span>
            </button>

            {activePreviewTab && (
              <button
                type="button"
                onClick={handleClosePreview}
                className={`px-2 py-1 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 border select-none ${
                  isLightMode
                    ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25"
                }`}
                title={isId ? "Tutup Tab Notch" : "Close Notch Tab"}
              >
                <X size={11} />
                <span>{t("settings_preview_close")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

