import { invoke } from "@tauri-apps/api/core";

interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

/** Thrown when a provider could not be reached (timeout, DNS, 403/5xx). A missing track is NOT an error. */
export class LyricsFetchError extends Error {}

export function rethrowIfFetchError(err: unknown): void {
  if (err instanceof LyricsFetchError) throw err;
}

/** Goes through the Rust backend only (allowlisted hosts, no CORS). Empty body means "not found". */
export async function fetchText(url: string, options: RequestOptions = {}): Promise<string | null> {
  try {
    const text = await invoke<string>("fetch_external_lyrics_api", {
      url,
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
    });
    return text || null;
  } catch (err) {
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

