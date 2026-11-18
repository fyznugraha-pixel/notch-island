import { currentQuotaDay, decrementUsage, pruneOldUsage, tryConsumeQuota } from "./quota";

interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  DAILY_LIMIT_PER_INSTALL: string;
  DAILY_LIMIT_PER_IP: string;
  MAX_OUTPUT_TOKENS: string;
  ALLOWED_CORS_ORIGINS?: string;
  CLIENT_HMAC_SECRET?: string;
  REQUIRE_CF_IP?: string;
}

const GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_MESSAGES = 12;
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

const DEFAULT_DEV_CORS_ORIGINS = new Set([
  "http://localhost:1421",
  "http://127.0.0.1:1421",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "https://tauri.localhost",
  "http://tauri.localhost",
]);

function resolveAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin")?.trim();
  if (!origin) return null;
  if (DEFAULT_DEV_CORS_ORIGINS.has(origin)) return origin;
  if (env.ALLOWED_CORS_ORIGINS) {
    const extras = env.ALLOWED_CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (extras.includes(origin)) return origin;
  }
  return null;
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(request, env);
  if (!allowedOrigin) {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Gili-Install-Id, X-Gili-Timestamp, X-Gili-Signature",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

type ErrorCode = "bad_request" | "unauthorized" | "daily_limit" | "upstream_busy" | "upstream_error";

function errorResponse(
  request: Request,
  env: Env,
  status: number,
  code: ErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...buildCorsHeaders(request, env), ...extraHeaders },
  });
}

export function normalizeIpBucket(rawIp: string | null): string | null {
  const ip = rawIp?.trim();
  if (!ip) return null;
  if (!ip.includes(":")) {
    return `ip:${ip}`;
  }
  // Bucket IPv6 by /64 network prefix so host-bit rotation cannot evade IP caps.
  const withoutZone = ip.split("%")[0].toLowerCase();
  const halves = withoutZone.split("::");
  if (halves.length > 2) return `ip6:${withoutZone}`;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter(Boolean) : [];
  const missing = halves.length === 2 ? Math.max(0, 8 - left.length - right.length) : 0;
  const full = [...left, ...Array(missing).fill("0"), ...right].slice(0, 8);
  while (full.length < 4) full.push("0");
  const prefix = full
    .slice(0, 4)
    .map((part) => part.padStart(4, "0"))
    .join(":");
  return `ip6:${prefix}::/64`;
}

async function verifyClientHmac(
  secret: string,
  installId: string,
  timestampRaw: string,
  signatureHex: string,
  bodyBytes: Uint8Array
): Promise<boolean> {
  const ts = Number(timestampRaw);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_SKEW_MS) {
    return false;
  }
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) {
    return false;
  }
  const bodyHashBuf = await crypto.subtle.digest("SHA-256", bodyBytes);
  const bodyHashHex = Array.from(new Uint8Array(bodyHashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const payload = `${timestampRaw}.${installId}.${bodyHashHex}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = new Uint8Array(expectedBuf);
  if (expected.length !== 32) return false;

  let diff = 0;
  for (let i = 0; i < 32; i++) {
    const providedByte = parseInt(signatureHex.slice(i * 2, i * 2 + 2), 16);
    diff |= expected[i] ^ providedByte;
  }
  return diff === 0;
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
): Promise<{ ok: true; body: ChatRequestBody; rawBytes: Uint8Array } | { ok: false; status: number; message: string }> {
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
    return { ok: true, body: parsed as ChatRequestBody, rawBytes: combined };
  } catch {
    return { ok: false, status: 400, message: "Body bukan JSON yang valid." };
  }
}

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !resolveAllowedOrigin(request, env)) {
    return errorResponse(request, env, 403, "unauthorized", "Origin tidak diizinkan.");
  }

  const installId = request.headers.get("X-Gili-Install-Id") ?? "";
  if (!UUID_V4_PATTERN.test(installId)) {
    return errorResponse(request, env, 400, "bad_request", "Install ID tidak valid.");
  }

  const bodyResult = await readJsonBodyWithinLimit(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return errorResponse(request, env, bodyResult.status, "bad_request", bodyResult.message);
  }
  const body = bodyResult.body;

  if (env.CLIENT_HMAC_SECRET) {
    const timestampRaw = request.headers.get("X-Gili-Timestamp") ?? "";
    const signatureHex = request.headers.get("X-Gili-Signature") ?? "";
    const sigValid = await verifyClientHmac(
      env.CLIENT_HMAC_SECRET,
      installId,
      timestampRaw,
      signatureHex,
      bodyResult.rawBytes
    );
    if (!sigValid) {
      return errorResponse(request, env, 401, "unauthorized", "Tanda tangan klien tidak valid.");
    }
  }

  if (
    body.max_tokens !== undefined &&
    (typeof body.max_tokens !== "number" || !Number.isFinite(body.max_tokens) || body.max_tokens < 1)
  ) {
    return errorResponse(request, env, 400, "bad_request", "Parameter max_tokens tidak valid.");
  }

  const rawIp =
    request.headers.get("CF-Connecting-IP") ??
    (env.REQUIRE_CF_IP === "true" ? null : request.headers.get("X-Real-IP") ?? "unknown");
  const ipKey = normalizeIpBucket(rawIp);
  if (!ipKey) {
    return errorResponse(request, env, 400, "bad_request", "Alamat IP klien tidak terdeteksi.");
  }

  const day = currentQuotaDay();
  const installKey = `install:${installId.toLowerCase()}`;
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
    return errorResponse(request, env, 429, "daily_limit", `Jatah gratis ${installLimit} chat hari ini sudah habis.`);
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
    return errorResponse(request, env, 502, "upstream_error", "Server AI gratis sedang bermasalah.");
  }

  // Failed upstream calls are not charged against the user's quota.
  if (upstream.status === 429) {
    ctx.waitUntil(decrementUsage(env.DB, [installKey, ipKey], day));
    return errorResponse(request, env, 429, "upstream_busy", "Server AI gratis sedang penuh. Coba lagi sebentar lagi.");
  }
  if (!upstream.ok) {
    ctx.waitUntil(decrementUsage(env.DB, [installKey, ipKey], day));
    console.error("gemini upstream error", upstream.status, await upstream.text());
    return errorResponse(request, env, 502, "upstream_error", "Server AI gratis sedang bermasalah.");
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...buildCorsHeaders(request, env),
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      if (origin && !resolveAllowedOrigin(request, env)) {
        return new Response("Forbidden", { status: 403, headers: { Vary: "Origin" } });
      }
      return new Response(null, { status: 204, headers: buildCorsHeaders(request, env) });
    }
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || !pathname.endsWith("/chat/completions")) {
      return new Response("Not found", { status: 404, headers: buildCorsHeaders(request, env) });
    }
    return handleChat(request, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const twoDaysAgo = currentQuotaDay(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await pruneOldUsage(env.DB, twoDaysAgo);
  },
};
