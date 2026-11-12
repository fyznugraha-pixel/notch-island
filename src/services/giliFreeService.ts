import type { AiModelConfig } from "../components/ui/aichat/AiChatTypes";
import { t, getLanguage } from "./i18n";

const INSTALL_ID_STORAGE = "gili_install_id_v1";

export const GILI_FREE_DAILY_LIMIT = 15;

export function getGiliFreeNotice(): string {
  return t("aichat_free_notice", { limit: GILI_FREE_DAILY_LIMIT });
}

export function getGiliFreeModel(): AiModelConfig {
  const isEn = getLanguage() === "en";
  return {
    id: "gili-free",
    name: isEn ? "Gemini Flash-Lite (Free)" : "Gemini Flash-Lite (Gratis)",
    provider: "gemini",
    description: isEn
      ? `Free tier, ${GILI_FREE_DAILY_LIMIT} chats per day`
      : `Mode gratis, ${GILI_FREE_DAILY_LIMIT} chat per hari`,
    tier: "Fast",
    inputCostPer1M: 0,
    outputCostPer1M: 0,
  };
}

export const GILI_FREE_MODEL = getGiliFreeModel();

export function getGiliFreeEndpoint(): string {
  return (import.meta.env.VITE_GILI_FREE_URL ?? "").trim().replace(/\/+$/, "");
}

export function isGiliFreeEnabled(): boolean {
  return getGiliFreeEndpoint().length > 0;
}

export function getInstallId(): string {
  const saved = localStorage.getItem(INSTALL_ID_STORAGE);
  if (saved) return saved;
  const fresh = crypto.randomUUID();
  localStorage.setItem(INSTALL_ID_STORAGE, fresh);
  return fresh;
}

export function describeGiliFreeError(rawMessage: string): string {
  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart === -1) return rawMessage;
  try {
    const code = JSON.parse(rawMessage.slice(jsonStart))?.error?.code;
    if (code === "daily_limit") {
      return t("gili_free_daily_limit_reached", { limit: GILI_FREE_DAILY_LIMIT });
    }
    if (code === "upstream_busy") {
      return t("gili_free_upstream_busy");
    }
    if (code === "upstream_error") {
      return t("gili_free_upstream_error");
    }
    return rawMessage;
  } catch {
    return rawMessage;
  }
}
