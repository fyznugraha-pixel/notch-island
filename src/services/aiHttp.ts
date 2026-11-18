import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface AiHttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

export interface AiHttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

export interface StreamAiRequestOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

const GILI_SHELF_PORT = "8731";

export function redactSensitiveUrlParams(message: string): string {
  return message.replace(/([?&](?:key|api_key|token|access_token)=)[^&\s"')\]>,]+/gi, "$1[REDACTED]");
}

function isDisallowedIpv4Literal(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (a > 255 || b > 255 || c > 255 || d > 255) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // Cloud metadata & link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // Multicast / reserved
  return false;
}

export function validateAiHttpUrl(rawUrl: string): void {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes("\\")) {
    throw new Error("URL endpoint AI tidak valid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("URL endpoint AI tidak valid.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Skema URL endpoint AI harus HTTPS atau HTTP lokal.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL endpoint AI tidak boleh mengandung kredensial.");
  }

  const host = parsed.hostname.toLowerCase();
  const isExplicitLoopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);

  if (isExplicitLoopback) {
    if (parsed.port === GILI_SHELF_PORT) {
      throw new Error("Akses ke port layanan internal Gili diblokir.");
    }
    return;
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Endpoint AI jarak jauh wajib menggunakan HTTPS.");
  }

  if (
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    throw new Error("Akses ke host metadata atau internal diblokir.");
  }

  if (isDisallowedIpv4Literal(host) || host.startsWith("[fe80:") || host.startsWith("[fc") || host.startsWith("[fd") || host === "[::]") {
    throw new Error("Akses ke alamat IP privat atau metadata diblokir.");
  }
}

export function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Request aborted", "AbortError") as unknown as Error;
  }
  const err = new Error("Request aborted");
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

export function createSseLineConsumer(
  onLine: (line: string) => void,
  shouldStop?: () => boolean
) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (shouldStop?.()) break;
        onLine(line);
      }
    },
    flush(tailChunk = "") {
      buffer += tailChunk;
      if (!buffer) return;
      const lines = buffer.split(/\r?\n/);
      buffer = "";
      for (const line of lines) {
        if (shouldStop?.()) break;
        if (line) onLine(line);
      }
    },
  };
}

export async function aiFetch(
  url: string,
  options: AiHttpRequestOptions = {}
): Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}> {
  validateAiHttpUrl(url);

  const isTauri =
    typeof window !== "undefined" &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

  const effectiveHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiliDesktop/5.1.2",
    ...(options.headers || {}),
  };

  if (isTauri) {
    let res: AiHttpResponse;
    try {
      res = await invoke<AiHttpResponse>("ai_http_request", {
        url,
        method: options.method || "GET",
        headers: effectiveHeaders,
        body: options.body,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(redactSensitiveUrlParams(msg));
    }

    return {
      ok: res.ok,
      status: res.status,
      text: async () => res.body,
      json: async () => {
        try {
          return JSON.parse(res.body);
        } catch {
          return {};
        }
      },
    };
  }

  // Fallback for non-Tauri dev environment
  try {
    const browserRes = await fetch(url, {
      method: options.method || "GET",
      headers: effectiveHeaders,
      body: options.body,
    });
    return {
      ok: browserRes.ok,
      status: browserRes.status,
      text: () => browserRes.text(),
      json: () => browserRes.json(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(redactSensitiveUrlParams(msg));
  }
}

export async function streamAiRequest({
  url,
  method = "POST",
  headers = {},
  body,
  signal,
  onChunk,
}: StreamAiRequestOptions): Promise<void> {
  validateAiHttpUrl(url);

  const streamId = Math.random().toString(36).substring(2) + Date.now().toString(36);

  let unlistenChunk: (() => void) | null = null;
  let unlistenDone: (() => void) | null = null;
  let unlistenError: (() => void) | null = null;

  const isTauri =
    typeof window !== "undefined" &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

  const effectiveHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiliDesktop/5.1.2",
    ...headers,
  };

  if (isTauri) {
    let onAbort: (() => void) | null = null;
    try {
      await new Promise<void>(async (resolve, reject) => {
        let settled = false;

        const rejectOnce = (err: Error) => {
          if (settled) return;
          settled = true;
          if (onAbort) signal?.removeEventListener("abort", onAbort);
          reject(err);
        };

        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          if (onAbort) signal?.removeEventListener("abort", onAbort);
          resolve();
        };

        const cancelBackendStream = () => {
          invoke("cancel_ai_http_stream", { streamId, stream_id: streamId }).catch(() => {});
        };

        if (signal?.aborted) {
          cancelBackendStream();
          rejectOnce(createAbortError());
          return;
        }

        onAbort = () => {
          cancelBackendStream();
          rejectOnce(createAbortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
          unlistenChunk = await listen<string>(`ai-stream-chunk:${streamId}`, (event) => {
            if (!settled && !signal?.aborted) {
              onChunk(event.payload);
            }
          });
          if (settled || signal?.aborted) {
            cancelBackendStream();
            rejectOnce(createAbortError());
            return;
          }

          unlistenDone = await listen(`ai-stream-done:${streamId}`, () => {
            resolveOnce();
          });
          if (settled || signal?.aborted) {
            cancelBackendStream();
            rejectOnce(createAbortError());
            return;
          }

          unlistenError = await listen<string>(`ai-stream-error:${streamId}`, (event) => {
            rejectOnce(new Error(redactSensitiveUrlParams(String(event.payload ?? ""))));
          });
          if (settled || signal?.aborted) {
            cancelBackendStream();
            rejectOnce(createAbortError());
            return;
          }

          invoke("ai_http_stream", {
            streamId,
            stream_id: streamId,
            url,
            method,
            headers: effectiveHeaders,
            body,
          }).catch((e) => {
            if (signal?.aborted) {
              rejectOnce(createAbortError());
              return;
            }
            const errMsg = typeof e === "string" ? e : (e as any)?.message || "Gagal memulai streaming AI";
            rejectOnce(new Error(redactSensitiveUrlParams(errMsg)));
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          rejectOnce(new Error(redactSensitiveUrlParams(msg)));
        }
      });
    } finally {
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
      }
      if (typeof unlistenChunk === "function") {
        (unlistenChunk as () => void)();
      }
      if (typeof unlistenDone === "function") {
        (unlistenDone as () => void)();
      }
      if (typeof unlistenError === "function") {
        (unlistenError as () => void)();
      }
    }
    return;
  }

  // Non-Tauri fallback (browser dev mode only)
  if (signal?.aborted) throw createAbortError();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: effectiveHeaders,
      body,
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(redactSensitiveUrlParams(msg));
  }

  if (!res.ok) {
    throw new Error(redactSensitiveUrlParams(`HTTP ${res.status}: ${await res.text()}`));
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (reader) {
    const lineConsumer = createSseLineConsumer(onChunk, () => Boolean(signal?.aborted));
    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        throw createAbortError();
      }
      const { done, value } = await reader.read();
      if (done) {
        lineConsumer.flush(decoder.decode());
        break;
      }
      lineConsumer.push(decoder.decode(value, { stream: true }));
    }
  }
}
