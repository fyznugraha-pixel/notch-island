export interface StandbyPalette {
  night: boolean;
  bg: string;
  ambientGradient: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  hudBg: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  mutedChipBg: string;
  controlBg: string;
}

const NIGHT_RED = "#ff453a";
const NIGHT_SOFT_RED = "#ff6961";

export function resolveStandbyPalette(night: boolean, accentHex: string): StandbyPalette {
  if (night) {
    return {
      night: true,
      bg: "#000000",
      ambientGradient: "#000000",
      cardBg: "#120607",
      cardBorder: "rgba(255, 69, 58, 0.26)",
      cardShadow: "none",
      hudBg: "rgba(18, 6, 7, 0.88)",
      textPrimary: NIGHT_RED,
      textSecondary: NIGHT_SOFT_RED,
      accent: NIGHT_RED,
      mutedChipBg: "rgba(255, 69, 58, 0.14)",
      controlBg: "rgba(255, 69, 58, 0.18)",
    };
  }

  return {
    night: false,
    bg: "#000000",
    ambientGradient: "#000000",
    cardBg: "linear-gradient(155deg, rgba(28, 28, 34, 0.84) 0%, rgba(14, 14, 18, 0.92) 100%)",
    cardBorder: "rgba(255, 255, 255, 0.12)",
    cardShadow:
      "0 24px 64px rgba(0, 0, 0, 0.62), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
    hudBg: "rgba(18, 18, 22, 0.72)",
    textPrimary: "#f5f5f7",
    textSecondary: "#a8a8b3",
    accent: accentHex || "#f5f5f7",
    mutedChipBg: "rgba(255, 255, 255, 0.08)",
    controlBg: "rgba(255, 255, 255, 0.12)",
  };
}

export function formatTimeParts(
  now: Date,
  use24h: boolean,
): { hours: string; minutes: string; seconds: string; period: string } {
  const rawHours = now.getHours();
  const displayHours = use24h ? rawHours : rawHours % 12 || 12;
  const period = use24h ? "" : rawHours >= 12 ? "PM" : "AM";
  return {
    hours: String(displayHours).padStart(2, "0"),
    minutes: String(now.getMinutes()).padStart(2, "0"),
    seconds: String(now.getSeconds()).padStart(2, "0"),
    period,
  };
}
