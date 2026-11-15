import { currentQuotaDay, decrementUsage, pruneOldUsage, tryConsumeQuota } from "./quota";

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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Gili-Install-Id",
  "Access-Control-Max-Age": "86400",
};

type ErrorCode = "bad_request" | "daily_limit" | "upstream_busy" | "upstream_error";

function errorResponse(status: number, code: ErrorCode, message: string, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
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
  const outputCap = Math.max(1, Number(env.MAX_OUTPUT_TOKENS) || 1024);
  const rawRequested = Number(body.max_tokens);
  const requested =
    Number.isFinite(rawRequested) && rawRequested >= 1 ? Math.floor(rawRequested) : outputCap;

  return {
    model: env.GEMINI_MODEL,
    messages: [...system, ...history],
    max_tokens: Math.max(1, Math.min(requested, outputCap)),
    stream: true,
  };
}

async function readJsonBodyWithinLimit(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; body: ChatRequestBody } | { ok: false; status: number; message: string }> {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, message: "Pesan terlalu besar untuk mode gratis." };
  }
  if (!request.body) {
    return { ok: false, status: 400, message: "Body kosong." };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413, message: "Pesan terlalu besar untuk mode gratis." };
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder().decode(combined);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, status: 400, message: "Body bukan objek JSON yang valid." };
    }
    return { ok: true, body: parsed as ChatRequestBody };
  } catch {
    return { ok: false, status: 400, message: "Body bukan JSON yang valid." };
  }
}

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const installId = request.headers.get("X-Gili-Install-Id") ?? "";
  if (!INSTALL_ID_PATTERN.test(installId)) {
    return errorResponse(400, "bad_request", "Install ID tidak valid.");
  }

  const bodyResult = await readJsonBodyWithinLimit(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return errorResponse(bodyResult.status, "bad_request", bodyResult.message);
  }
  const body = bodyResult.body;

  if (
    body.max_tokens !== undefined &&
    (typeof body.max_tokens !== "number" || !Number.isFinite(body.max_tokens) || body.max_tokens < 1)
  ) {
    return errorResponse(400, "bad_request", "Parameter max_tokens tidak valid.");
  }

  const day = currentQuotaDay();
  const installKey = `install:${installId}`;
  const ipKey = `ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
  const installLimit = Number(env.DAILY_LIMIT_PER_INSTALL);
  const ipLimit = Number(env.DAILY_LIMIT_PER_IP);

  const allowed = await tryConsumeQuota(
    env.DB,
    [
      { subject: installKey, limit: installLimit },
      { subject: ipKey, limit: ipLimit },
    ],
    day
  );

  if (!allowed) {
    return errorResponse(429, "daily_limit", `Jatah gratis ${installLimit} chat hari ini sudah habis.`);
  }

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify(buildUpstreamBody(body, env)),
    });
  } catch (err) {
    ctx.waitUntil(decrementUsage(env.DB, [installKey, ipKey], day));
    console.error("gemini upstream fetch error", err);
    return errorResponse(502, "upstream_error", "Server AI gratis sedang bermasalah.");
  }

  // Failed upstream calls are not charged against the user's quota.
  if (upstream.status === 429) {
    ctx.waitUntil(decrementUsage(env.DB, [installKey, ipKey], day));
    return errorResponse(429, "upstream_busy", "Server AI gratis sedang penuh. Coba lagi sebentar lagi.");
  }
  if (!upstream.ok) {
    ctx.waitUntil(decrementUsage(env.DB, [installKey, ipKey], day));
    console.error("gemini upstream error", upstream.status, await upstream.text());
    return errorResponse(502, "upstream_error", "Server AI gratis sedang bermasalah.");
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || !pathname.endsWith("/chat/completions")) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }
    return handleChat(request, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const twoDaysAgo = currentQuotaDay(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await pruneOldUsage(env.DB, twoDaysAgo);
  },
};
