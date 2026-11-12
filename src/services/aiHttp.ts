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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiliDesktop/4.6.1",
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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiliDesktop/4.6.1",
    ...headers,
  };

  if (isTauri) {
    try {
      await new Promise<void>(async (resolve, reject) => {
        if (signal?.aborted) {
          return reject(new Error("Request aborted"));
        }

        const onAbort = () => reject(new Error("Request aborted"));
        signal?.addEventListener("abort", onAbort, { once: true });

        unlistenChunk = await listen<string>(`ai-stream-chunk:${streamId}`, (event) => {
          onChunk(event.payload);
        });

        unlistenDone = await listen(`ai-stream-done:${streamId}`, () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        });

        unlistenError = await listen<string>(`ai-stream-error:${streamId}`, (event) => {
          signal?.removeEventListener("abort", onAbort);
          reject(new Error(event.payload));
        });

        invoke("ai_http_stream", {
          streamId,
          stream_id: streamId,
          url,
          method,
          headers: effectiveHeaders,
          body,
        }).catch((e) => {
          signal?.removeEventListener("abort", onAbort);
          const errMsg = typeof e === "string" ? e : (e as any)?.message || "Gagal memulai streaming AI";
          reject(new Error(errMsg));
        });
      });
    } finally {
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
  if (signal?.aborted) throw new Error("Request aborted");
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        onChunk(line);
      }
    }
  }
}
