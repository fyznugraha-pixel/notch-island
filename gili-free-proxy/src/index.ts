import { currentQuotaDay, incrementUsage, pruneOldUsage, readUsage } from "./quota";

interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  DAILY_LIMIT_PER_INSTALL: string;
  DAILY_LIMIT_PER_IP: string;
  MAX_OUTPUT_TOKENS: string;
}

const GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const INSTALL_ID_PATTERN = /^[a-f0-9-]{16,64}$/i;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_MESSAGES = 12;

type ErrorCode = "bad_request" | "daily_limit" | "upstream_busy" | "upstream_error";

function errorResponse(status: number, code: ErrorCode, message: string, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

interface ChatRequestBody {
  messages?: unknown;
  max_tokens?: number;
}

function buildUpstreamBody(body: ChatRequestBody, env: Env) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.filter((m: any) => m?.role === "system").slice(0, 1);
  const history = messages.filter((m: any) => m?.role !== "system").slice(-MAX_HISTORY_MESSAGES);
  const outputCap = Number(env.MAX_OUTPUT_TOKENS);
  const requested = Number(body.max_tokens) || outputCap;

  return {
    model: env.GEMINI_MODEL,
    messages: [...system, ...history],
    max_tokens: Math.min(requested, outputCap),
    stream: true,
  };
}

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const installId = request.headers.get("X-Gili-Install-Id") ?? "";
  if (!INSTALL_ID_PATTERN.test(installId)) {
    return errorResponse(400, "bad_request", "Install ID tidak valid.");
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, "bad_request", "Pesan terlalu besar untuk mode gratis.");
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "bad_request", "Body bukan JSON yang valid.");
  }

  const day = currentQuotaDay();
  const installKey = `install:${installId}`;
  const ipKey = `ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
  const installLimit = Number(env.DAILY_LIMIT_PER_INSTALL);

  const [installUsed, ipUsed] = await Promise.all([
    readUsage(env.DB, installKey, day),
    readUsage(env.DB, ipKey, day),
  ]);

  if (installUsed >= installLimit || ipUsed >= Number(env.DAILY_LIMIT_PER_IP)) {
    return errorResponse(429, "daily_limit", `Jatah gratis ${installLimit} chat hari ini sudah habis.`);
  }

  const upstream = await fetch(GEMINI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify(buildUpstreamBody(body, env)),
  });

  // Failed upstream calls are not charged against the user's quota.
  if (upstream.status === 429) {
    return errorResponse(429, "upstream_busy", "Server AI gratis sedang penuh. Coba lagi sebentar lagi.");
  }
  if (!upstream.ok) {
    console.error("gemini upstream error", upstream.status, await upstream.text());
    return errorResponse(502, "upstream_error", "Server AI gratis sedang bermasalah.");
  }

  ctx.waitUntil(incrementUsage(env.DB, [installKey, ipKey], day));

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || !pathname.endsWith("/chat/completions")) {
      return new Response("Not found", { status: 404 });
    }
    return handleChat(request, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const twoDaysAgo = currentQuotaDay(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await pruneOldUsage(env.DB, twoDaysAgo);
  },
};
