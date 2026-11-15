import { hexToRgba, getPerceivedLuminance } from "./colorUtils";

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

export interface FrostedGlassInput {
  opacity: number;
  blur: number;
  isLight: boolean;
  isExpanded?: boolean;
  customColor?: string | null;
  isTranslucent?: boolean;
  isSolidOverride?: boolean;
}

export interface CalibratedGlassPalette {
  effectiveOpacity: number;
  effectiveBlur: number;
  blurRatio: number;
  isTranslucent: boolean;
  isCustomLight: boolean;
  darkStop0: string;
  darkStop1: string;
  darkStop2: string;
  lightStop0: string;
  lightStop1: string;
  lightStop2: string;
  diffDarkTop: string;
  diffDarkBot: string;
  diffLightTop: string;
  diffLightBot: string;
  backgroundFill: string;
  previewBackdropFilter: string;
  grainOpacity: number;
  rimOpacity: number;
  reflectionOpacity: number;
}

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val));

/**
 * Computes Notch-calibrated frosted glass surface stops and optical blur metrics.
 * Matches `NotchSurface.tsx` so Dock, Taskbar Preview, and Flyouts share identical rendering.
 */
export function computeCalibratedGlassPalette({
  opacity,
  blur,
  isLight,
  isExpanded = false,
  customColor = null,
  isTranslucent = true,
  isSolidOverride = false,
}: FrostedGlassInput): CalibratedGlassPalette {
  const effectiveOpacity = clamp(Number.isFinite(opacity) ? opacity : 0.78, 0.15, 1.0);
  const effectiveBlur = isTranslucent && !isSolidOverride
    ? clamp(Number.isFinite(blur) ? blur : 68, 0, 100)
    : 0;
  const blurRatio = effectiveBlur / 100;
  const expandBoost = isExpanded ? 0.04 : 0;

  const darkStop0 = clamp(effectiveOpacity * 0.56 + expandBoost, 0.18, 0.88).toFixed(2);
  const darkStop1 = clamp(effectiveOpacity * 0.62 + expandBoost, 0.22, 0.90).toFixed(2);
  const darkStop2 = clamp(effectiveOpacity * 0.68 + expandBoost, 0.26, 0.92).toFixed(2);

  const lightStop0 = clamp(effectiveOpacity * 0.54 + expandBoost, 0.18, 0.88).toFixed(2);
  const lightStop1 = clamp(effectiveOpacity * 0.48 + expandBoost, 0.16, 0.86).toFixed(2);
  const lightStop2 = clamp(effectiveOpacity * 0.52 + expandBoost, 0.18, 0.88).toFixed(2);

  const diffDarkTop = (blurRatio * 0.16).toFixed(2);
  const diffDarkBot = (blurRatio * 0.22).toFixed(2);
  const diffLightTop = (blurRatio * 0.14).toFixed(2);
  const diffLightBot = (blurRatio * 0.18).toFixed(2);

  const isCustomLight = customColor
    ? getPerceivedLuminance(customColor) >= 0.55
    : isLight;

  let backgroundFill: string;
  if (!isTranslucent || isSolidOverride) {
    if (customColor) {
      backgroundFill = customColor;
    } else if (isLight) {
      backgroundFill = "rgba(255, 255, 255, 0.94)";
    } else {
      backgroundFill = "rgb(0, 0, 0)";
    }
  } else if (customColor) {
    const customTopAlpha = clamp(effectiveOpacity * 0.62 + expandBoost, 0.18, 0.88);
    const customBotAlpha = clamp(effectiveOpacity * 0.72 + expandBoost, 0.22, 0.92);
    backgroundFill = `linear-gradient(180deg, ${hexToRgba(customColor, customTopAlpha)} 0%, ${hexToRgba(customColor, customBotAlpha)} 100%)`;
  } else if (isLight) {
    backgroundFill = `linear-gradient(180deg, rgba(255, 255, 255, ${lightStop0}) 0%, rgba(246, 246, 250, ${lightStop1}) 45%, rgba(235, 235, 242, ${lightStop2}) 100%)`;
  } else {
    backgroundFill = `linear-gradient(180deg, rgba(24, 24, 34, ${darkStop0}) 0%, rgba(16, 16, 24, ${darkStop1}) 45%, rgba(10, 10, 15, ${darkStop2}) 100%)`;
  }

  const previewBlurPx = Math.round(blurRatio * 44);
  const previewSatPct = Math.round(100 + blurRatio * 40);
  const previewBackdropFilter =
    isTranslucent && !isSolidOverride && previewBlurPx > 1
      ? `blur(${previewBlurPx}px) saturate(${previewSatPct}%)`
      : "none";

  return {
    effectiveOpacity,
    effectiveBlur,
    blurRatio,
    isTranslucent: isTranslucent && !isSolidOverride,
    isCustomLight,
    darkStop0,
    darkStop1,
    darkStop2,
    lightStop0,
    lightStop1,
    lightStop2,
    diffDarkTop,
    diffDarkBot,
    diffLightTop,
    diffLightBot,
    backgroundFill,
    previewBackdropFilter,
    grainOpacity: Math.min(1, blurRatio * 1.15),
    rimOpacity: isCustomLight ? 0.35 : 0.50,
    reflectionOpacity:
      effectiveOpacity < 0.66
        ? isCustomLight
          ? 0.25
          : 0.35
        : isCustomLight
        ? 0.55
        : 0.75,
  };
}
