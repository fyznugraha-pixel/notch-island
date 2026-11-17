import React from "react";
import { NavbarIconTheme } from "../../../types/navbar";
import { hexToRgba } from "../../../services/navbarConfigService";

export type StyledIconVariant = Extract<
  NavbarIconTheme,
  | "glass"
  | "monochrome"
  | "tinted"
  | "circle"
  | "retro"
  | "neon"
  | "clay"
  | "outline"
  | "pastel"
  | "sticker"
  | "contrast"
>;

const STYLED_ICON_VARIANTS: ReadonlySet<NavbarIconTheme> = new Set<StyledIconVariant>([
  "glass",
  "monochrome",
  "tinted",
  "circle",
  "retro",
  "neon",
  "clay",
  "outline",
  "pastel",
  "sticker",
  "contrast",
]);

export function isStyledIconVariant(theme: NavbarIconTheme): theme is StyledIconVariant {
  return STYLED_ICON_VARIANTS.has(theme);
}

interface TileAppearance {
  borderRadius: string;
  background: string;
  border?: string;
  boxShadow?: string;
  backdropFilter?: string;
  imageRendering?: React.CSSProperties["imageRendering"];
  glyphFilter?: string;
  glyphClass?: string;
  isolation?: "isolate";
}

function resolveTileAppearance(
  variant: StyledIconVariant,
  safeTile: number,
  accentColor: string,
  isLightSurface: boolean
): TileAppearance {
  const squircleRadius = `${Math.max(5, Math.round(safeTile * 0.24))}px`;

  switch (variant) {
    case "glass":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface
          ? "linear-gradient(145deg, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.34) 55%, rgba(235,240,250,0.5) 100%)"
          : "linear-gradient(145deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 52%, rgba(255,255,255,0.16) 100%)",
        boxShadow: isLightSurface
          ? "0 2px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(0,0,0,0.08)"
          : "0 2px 7px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.52), inset 0 -1px 0 rgba(255,255,255,0.1)",
        border: isLightSurface
          ? "1px solid rgba(255,255,255,0.75)"
          : "1px solid rgba(255,255,255,0.28)",
        backdropFilter: "blur(10px)",
        glyphClass: "relative z-10 flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]",
      };
    case "monochrome":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
        border: isLightSurface
          ? "1px solid rgba(0,0,0,0.12)"
          : "1px solid rgba(255,255,255,0.14)",
        glyphFilter: isLightSurface
          ? "grayscale(1) contrast(1.22) brightness(0.84)"
          : "grayscale(1) contrast(1.22) brightness(1.08)",
      };
    case "tinted":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface
          ? `radial-gradient(circle at 50% 25%, ${hexToRgba(accentColor, 0.2)}, transparent 74%), linear-gradient(180deg, #272932 0%, #16181f 100%)`
          : `radial-gradient(circle at 50% 25%, ${hexToRgba(accentColor, 0.26)}, transparent 74%), linear-gradient(180deg, #1b1d25 0%, #0e1015 100%)`,
        border: `1px solid ${hexToRgba(accentColor, 0.42)}`,
        boxShadow: `0 2px 6px rgba(0,0,0,0.34), inset 0 1px 0 ${hexToRgba(accentColor, 0.25)}`,
        isolation: "isolate",
        glyphFilter: "grayscale(1) contrast(1.25) brightness(1.08)",
        glyphClass: "relative z-0 flex items-center justify-center",
      };
    case "circle":
      return {
        borderRadius: "9999px",
        background: isLightSurface
          ? "linear-gradient(180deg, #ffffff 0%, #eceef3 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.07) 100%)",
        border: isLightSurface
          ? "1px solid rgba(0,0,0,0.1)"
          : "1px solid rgba(255,255,255,0.2)",
        boxShadow: isLightSurface
          ? "0 1px 4px rgba(0,0,0,0.12)"
          : "0 2px 5px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.26)",
        glyphClass: "flex items-center justify-center rounded-full overflow-hidden",
      };
    case "retro":
      return {
        borderRadius: `${Math.max(2, Math.round(safeTile * 0.08))}px`,
        background: "linear-gradient(180deg, #dfdfdf 0%, #c0c2c8 100%)",
        boxShadow:
          "inset 1.5px 1.5px 0 #ffffff, inset -1.5px -1.5px 0 #5b5e66, 0 1px 3px rgba(0,0,0,0.45)",
        border: "1px solid rgba(0,0,0,0.5)",
        imageRendering: "pixelated",
        glyphFilter: "contrast(1.1)",
        glyphClass: "flex items-center justify-center drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]",
      };
    case "neon":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface ? "#111420" : "#090b12",
        border: `1.5px solid ${accentColor}`,
        boxShadow: `0 0 8px ${hexToRgba(accentColor, 0.42)}, inset 0 0 6px ${hexToRgba(accentColor, 0.16)}`,
        glyphClass: "flex items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]",
      };
    case "clay":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface
          ? "linear-gradient(145deg, #f7f9fc 0%, #e4e8f0 100%)"
          : "linear-gradient(145deg, #272b38 0%, #191c26 100%)",
        boxShadow: isLightSurface
          ? "2px 3px 6px rgba(15,23,42,0.16), inset 1.5px 1.5px 2px rgba(255,255,255,0.95), inset -1.5px -1.5px 2px rgba(148,163,184,0.32)"
          : "0 3px 6px rgba(0,0,0,0.45), inset 1px 1px 1.5px rgba(255,255,255,0.14), inset -1.5px -1.5px 2px rgba(0,0,0,0.45)",
        glyphClass: "flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)]",
      };
    case "outline":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)",
        border: isLightSurface
          ? "1.5px solid rgba(15,23,42,0.28)"
          : "1.5px solid rgba(255,255,255,0.34)",
        glyphFilter: isLightSurface
          ? "grayscale(0.85) contrast(1.15) brightness(0.9)"
          : "grayscale(0.85) contrast(1.15) brightness(1.06)",
      };
    case "pastel":
      return {
        borderRadius: squircleRadius,
        background: `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${hexToRgba(accentColor, 0.24)} 100%), #f8fafc`,
        border: `1px solid ${hexToRgba(accentColor, 0.34)}`,
        boxShadow: isLightSurface
          ? "0 2px 5px rgba(15,23,42,0.08)"
          : "0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.8)",
        glyphClass: "flex items-center justify-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]",
      };
    case "sticker":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface ? "#ffffff" : "#232733",
        border: isLightSurface
          ? "1.5px solid rgba(15,23,42,0.18)"
          : "1.5px solid rgba(255,255,255,0.22)",
        boxShadow: isLightSurface
          ? "0 2px 0 rgba(15,23,42,0.14)"
          : "0 2px 0 rgba(0,0,0,0.55)",
        glyphClass: "flex items-center justify-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.14)]",
      };
    case "contrast":
      return {
        borderRadius: squircleRadius,
        background: isLightSurface ? "#0a0a0d" : "#f8fafc",
        border: isLightSurface
          ? "1.5px solid rgba(0,0,0,0.9)"
          : "1.5px solid rgba(255,255,255,0.9)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.24)",
        glyphFilter: "contrast(1.18) saturate(1.15)",
      };
  }
}

interface StyledAppIconFrameProps {
  variant: StyledIconVariant;
  tileSize: number;
  accentColor?: string;
  isLightSurface?: boolean;
  children: React.ReactNode;
}

export const StyledAppIconFrame: React.FC<StyledAppIconFrameProps> = ({
  variant,
  tileSize,
  accentColor = "#3882F6",
  isLightSurface = false,
  children,
}) => {
  const safeTile = Math.max(18, tileSize);
  const appearance = resolveTileAppearance(variant, safeTile, accentColor, isLightSurface);

  return (
    <div
      style={{
        width: `${safeTile}px`,
        height: `${safeTile}px`,
        borderRadius: appearance.borderRadius,
        background: appearance.background,
        border: appearance.border,
        boxShadow: appearance.boxShadow,
        backdropFilter: appearance.backdropFilter,
        imageRendering: appearance.imageRendering,
        isolation: appearance.isolation,
      }}
      className="relative flex items-center justify-center shrink-0 overflow-hidden select-none pointer-events-none"
    >
      {variant === "glass" && (
        <span
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0) 100%)",
          }}
          className="absolute inset-x-0 top-0 h-[44%] pointer-events-none"
        />
      )}
      <span
        style={appearance.glyphFilter ? { filter: appearance.glyphFilter } : undefined}
        className={appearance.glyphClass ?? "flex items-center justify-center"}
      >
        {children}
      </span>
      {variant === "tinted" && (
        <>
          <span
            aria-hidden="true"
            style={{ backgroundColor: accentColor, mixBlendMode: "color", opacity: 0.94 }}
            className="absolute inset-0 pointer-events-none z-10"
          />
          <span
            aria-hidden="true"
            style={{ backgroundColor: accentColor, mixBlendMode: "soft-light", opacity: 0.25 }}
            className="absolute inset-0 pointer-events-none z-20"
          />
        </>
      )}
    </div>
  );
};
