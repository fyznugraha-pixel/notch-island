import type { AiModelConfig } from "../components/ui/aichat/AiChatTypes";
import { t, getLanguage } from "./i18n";

const INSTALL_ID_STORAGE = "gili_install_id_v1";
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (saved && UUID_V4_REGEX.test(saved)) return saved;
  const fresh = crypto.randomUUID();
  localStorage.setItem(INSTALL_ID_STORAGE, fresh);
  return fresh;
}

export async function buildGiliFreeHeaders(bodyJson: string): Promise<Record<string, string>> {
  const installId = getInstallId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Gili-Install-Id": installId,
  };
  const secret = (import.meta.env.VITE_GILI_CLIENT_TOKEN ?? "").trim();
  if (!secret || typeof crypto === "undefined" || !crypto.subtle) {
    return headers;
  }
  const timestamp = String(Date.now());
  const enc = new TextEncoder();
  const bodyHashBuf = await crypto.subtle.digest("SHA-256", enc.encode(bodyJson));
  const bodyHashHex = Array.from(new Uint8Array(bodyHashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${installId}.${bodyHashHex}`));
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  headers["X-Gili-Timestamp"] = timestamp;
  headers["X-Gili-Signature"] = sigHex;
  return headers;
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
