import type { AiModelConfig } from "../components/ui/aichat/AiChatTypes";

const INSTALL_ID_STORAGE = "gili_install_id_v1";

export const GILI_FREE_DAILY_LIMIT = 15;

export const GILI_FREE_NOTICE = `Mode gratis: ${GILI_FREE_DAILY_LIMIT} chat per hari. Jangan kirim data sensitif.`;

export const GILI_FREE_MODEL: AiModelConfig = {
  id: "gili-free",
  name: "Gemini Flash-Lite (Gratis)",
  provider: "gemini",
  description: `Mode gratis, ${GILI_FREE_DAILY_LIMIT} chat per hari`,
  tier: "Fast",
  inputCostPer1M: 0,
  outputCostPer1M: 0,
};

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

const FRIENDLY_ERRORS: Record<string, string> = {
  daily_limit: `Jatah gratis ${GILI_FREE_DAILY_LIMIT} chat hari ini sudah habis. Reset jam 00.00 WIB, atau pasang API key sendiri di pengaturan AI Chat.`,
  upstream_busy: "Server AI gratis sedang penuh. Coba lagi beberapa saat lagi.",
  upstream_error: "Server AI gratis sedang bermasalah. Coba lagi nanti.",
};

// Proxy errors arrive from the Rust stream bridge as "HTTP <status>: <json body>".
export function describeGiliFreeError(rawMessage: string): string {
  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart === -1) return rawMessage;
  try {
    const code = JSON.parse(rawMessage.slice(jsonStart))?.error?.code;
    return FRIENDLY_ERRORS[code] ?? rawMessage;
  } catch {
    return rawMessage;
  }
}
