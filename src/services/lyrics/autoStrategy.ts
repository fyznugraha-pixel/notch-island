import type { LyricsData, LyricsProvider } from "./types";
import { hasActualLyrics } from "./utils";
import { hasWordTimings } from "./wordTiming";
import { isAbortError } from "./lyricsHttp";

export interface ProviderOutcome {
  result: LyricsData | null;
  failed: boolean;
}

const PROVIDER_TIMEOUT_MS = 8000;
const SYLLABLE_UPGRADE_GRACE_MS = 900;
const LINE_FALLBACK_WAIT_MS = 2500;

function makeAbortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(makeAbortError());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider timeout")), ms);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(makeAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err) => {
        cleanup();
        reject(err);
      }
    );
  });
}

export async function runProvider(
  provider: LyricsProvider,
  artist: string,
  title: string,
  duration?: number,
  signal?: AbortSignal
): Promise<ProviderOutcome> {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      provider.fetchLyrics(artist, title, duration, signal),
      PROVIDER_TIMEOUT_MS,
      signal
    );
    console.debug(`[lyrics] ${provider.id} ${result ? "hit" : "miss"} in ${Date.now() - startedAt}ms`);
    return { result, failed: false };
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      return { result: null, failed: false };
    }
    console.debug(`[lyrics] ${provider.id} failed after ${Date.now() - startedAt}ms:`, err);
    return { result: null, failed: true };
  }
}

export function isUsableSynced(result: LyricsData | null | undefined): result is LyricsData {
  return !!result && result.synced && hasActualLyrics(result.lines);
}

function isWordTimedSynced(result: LyricsData | null | undefined): result is LyricsData {
  return isUsableSynced(result) && hasWordTimings(result.lines);
}

function isUsableLyrics(result: LyricsData | null | undefined): result is LyricsData {
  return !!result && (hasActualLyrics(result.lines) || Boolean(result.instrumental));
}

function pickBestCandidate(
  outcomes: (ProviderOutcome | null)[],
  allowPlain: boolean
): LyricsData | null {
  for (const outcome of outcomes) {
    if (isWordTimedSynced(outcome?.result)) return outcome.result;
  }
  for (const outcome of outcomes) {
    if (isUsableSynced(outcome?.result)) return outcome.result;
  }
  if (allowPlain) {
    for (const outcome of outcomes) {
      if (isUsableLyrics(outcome?.result)) return outcome.result;
    }
  }
  return null;
}

function hasReadyTierWinner(
  outcomes: (ProviderOutcome | null)[],
  readyPredicate: (result: LyricsData | null | undefined) => boolean
): boolean {
  for (const outcome of outcomes) {
    if (outcome === null) return false;
    if (readyPredicate(outcome.result)) return true;
  }
  return false;
}

async function resolvePrioritizedTier(
  providers: LyricsProvider[],
  artist: string,
  title: string,
  duration: number | undefined,
  signal: AbortSignal,
  options: {
    immediatePredicate: (result: LyricsData | null | undefined) => boolean;
    allowPlain: boolean;
    fastGraceMs: number;
    fallbackGraceMs: number;
  }
): Promise<{ chosen: LyricsData | null; settledAll: ProviderOutcome[] }> {
  if (providers.length === 0) {
    return { chosen: null, settledAll: [] };
  }

  const outcomes: (ProviderOutcome | null)[] = providers.map(() => null);
  const promises = providers.map((provider) =>
    runProvider(provider, artist, title, duration, signal)
  );

  await new Promise<void>((resolve) => {
    let remaining = promises.length;
    let fastTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const cleanup = () => {
      if (fastTimer) {
        clearTimeout(fastTimer);
        fastTimer = null;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      signal.removeEventListener("abort", finish);
    };

    const finish = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };

    if (signal.aborted) {
      finish();
      return;
    }
    signal.addEventListener("abort", finish, { once: true });

    promises.forEach((p, idx) => {
      p.then((outcome) => {
        outcomes[idx] = outcome;
        remaining -= 1;

        if (signal.aborted || remaining === 0 || hasReadyTierWinner(outcomes, options.immediatePredicate)) {
          finish();
          return;
        }

        if (outcomes.some((o) => options.immediatePredicate(o?.result))) {
          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          if (!fastTimer) {
            fastTimer = setTimeout(finish, options.fastGraceMs);
          }
          return;
        }

        if (outcomes.some((o) => isUsableLyrics(o?.result)) && !fastTimer && !fallbackTimer) {
          fallbackTimer = setTimeout(finish, options.fallbackGraceMs);
        }
      });
    });
  });

  const chosen = pickBestCandidate(outcomes, options.allowPlain);
  if (chosen) {
    return { chosen, settledAll: [] };
  }

  return { chosen: null, settledAll: await Promise.all(promises) };
}

export async function resolveAutoLyrics(
  providers: {
    betterlyrics: LyricsProvider;
    kugou: LyricsProvider;
    netease: LyricsProvider;
    lrclib: LyricsProvider;
    extra: LyricsProvider[];
  },
  artist: string,
  title: string,
  duration?: number,
  outerSignal?: AbortSignal
): Promise<{ lyrics: LyricsData | null; hadFailures: boolean }> {
  const autoController = new AbortController();
  const abortAll = () => autoController.abort();
  if (outerSignal?.aborted) {
    autoController.abort();
    return { lyrics: null, hadFailures: false };
  }
  outerSignal?.addEventListener("abort", abortAll, { once: true });

  try {
    const sig = autoController.signal;

    // Tier 1: Utamakan provider lirik per kata / syllable (Better Lyrics TTML -> KuGou KRC -> NetEase YRC)
    const primaryTier = await resolvePrioritizedTier(
      [providers.betterlyrics, providers.kugou, providers.netease],
      artist,
      title,
      duration,
      sig,
      {
        immediatePredicate: isWordTimedSynced,
        allowPlain: false,
        fastGraceMs: SYLLABLE_UPGRADE_GRACE_MS,
        fallbackGraceMs: LINE_FALLBACK_WAIT_MS,
      }
    );

    if (outerSignal?.aborted) {
      return { lyrics: null, hadFailures: false };
    }
    if (primaryTier.chosen) {
      autoController.abort();
      return { lyrics: primaryTier.chosen, hadFailures: false };
    }

    // Tier 2: Non-LRCLIB fallback (QQ Music synced -> Genius plain), plus any plain hit from Tier 1
    const secondaryTier = await resolvePrioritizedTier(
      providers.extra,
      artist,
      title,
      duration,
      sig,
      {
        immediatePredicate: isUsableSynced,
        allowPlain: true,
        fastGraceMs: SYLLABLE_UPGRADE_GRACE_MS,
        fallbackGraceMs: LINE_FALLBACK_WAIT_MS,
      }
    );

    if (outerSignal?.aborted) {
      return { lyrics: null, hadFailures: false };
    }
    if (secondaryTier.chosen) {
      autoController.abort();
      return { lyrics: secondaryTier.chosen, hadFailures: false };
    }

    const tierOnePlain = pickBestCandidate(primaryTier.settledAll, true);
    if (tierOnePlain) {
      autoController.abort();
      return { lyrics: tierOnePlain, hadFailures: false };
    }

    // Tier 3: LRCLIB hanya dipakai sebagai opsi terakhir ketika seluruh provider lain tidak memiliki lirik
    const lrclibOutcome = await runProvider(providers.lrclib, artist, title, duration, sig);
    if (outerSignal?.aborted) {
      return { lyrics: null, hadFailures: false };
    }
    if (isUsableLyrics(lrclibOutcome.result)) {
      return { lyrics: lrclibOutcome.result, hadFailures: false };
    }

    const settled = [...primaryTier.settledAll, ...secondaryTier.settledAll, lrclibOutcome];
    return { lyrics: null, hadFailures: settled.some((o) => o.failed) };
  } finally {
    autoController.abort();
    outerSignal?.removeEventListener("abort", abortAll);
  }
}
