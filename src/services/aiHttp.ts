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
  const isTauri =
    typeof window !== "undefined" &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

  const effectiveHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiliDesktop/4.6.2",
    ...(options.headers || {}),
  };

  if (isTauri) {
    const res = await invoke<AiHttpResponse>("ai_http_request", {
      url,
      method: options.method || "GET",
      headers: effectiveHeaders,
      body: options.body,
    });

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
}

export async function streamAiRequest({
  url,
  method = "POST",
  headers = {},
  body,
  signal,
  onChunk,
}: StreamAiRequestOptions): Promise<void> {
  const streamId = Math.random().toString(36).substring(2) + Date.now().toString(36);

  let unlistenChunk: (() => void) | null = null;
  let unlistenDone: (() => void) | null = null;
  let unlistenError: (() => void) | null = null;

  const isTauri =
    typeof window !== "undefined" &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

  const effectiveHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiliDesktop/4.6.2",
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
            rejectOnce(new Error(event.payload));
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
            rejectOnce(new Error(errMsg));
          });
        } catch (err) {
          rejectOnce(err instanceof Error ? err : new Error(String(err)));
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
  const res = await fetch(url, {
    method,
    headers: effectiveHeaders,
    body,
    signal,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
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
