import { invoke } from "@tauri-apps/api/core";

interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** Thrown when a provider could not be reached (timeout, DNS, 403/5xx). A missing track is NOT an error. */
export class LyricsFetchError extends Error {}

export class LyricsAbortError extends Error {
  constructor() {
    super("Lyrics request aborted");
    this.name = "AbortError";
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof LyricsAbortError || (err instanceof Error && err.name === "AbortError");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new LyricsAbortError();
  }
}

export function rethrowIfFetchError(err: unknown): void {
  if (isAbortError(err) || err instanceof LyricsFetchError) throw err;
}

function invokeWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new LyricsAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new LyricsAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

/** Goes through the Rust backend only (allowlisted hosts, no CORS). Empty body means "not found". */
export async function fetchText(url: string, options: RequestOptions = {}): Promise<string | null> {
  throwIfAborted(options.signal);
  try {
    const text = await invokeWithAbort(
      invoke<string>("fetch_external_lyrics_api", {
        url,
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body,
      }),
      options.signal
    );
    return text || null;
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new LyricsFetchError(String(err));
  }
}

export async function fetchJson<T = any>(url: string, options: RequestOptions = {}): Promise<T | null> {
  const text = await fetchText(url, options);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

