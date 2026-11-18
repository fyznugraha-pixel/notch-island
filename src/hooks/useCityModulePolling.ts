import { useCallback, useEffect, useRef } from "react";

interface UseCityModulePollingOptions<T> {
  initialCity: string;
  intervalMs?: number;
  fetcher: (city: string) => Promise<T | null>;
  onSuccess: (data: T, city: string, isManual: boolean) => void;
  onNotFound: () => void;
  onNetworkError: () => void;
  onLoadingChange: (loading: boolean) => void;
  onErrorClear: () => void;
}

// Keeps polling & online-retry pinned to the latest chosen city rather than initial mount closure.
export function useCityModulePolling<T>({
  initialCity,
  intervalMs = 30 * 60000,
  fetcher,
  onSuccess,
  onNotFound,
  onNetworkError,
  onLoadingChange,
  onErrorClear,
}: UseCityModulePollingOptions<T>) {
  const activeCityRef = useRef(initialCity);
  const needsRetryRef = useRef(false);
  const requestSeqRef = useRef(0);
  const handlersRef = useRef({
    fetcher,
    onSuccess,
    onNotFound,
    onNetworkError,
    onLoadingChange,
    onErrorClear,
  });
  handlersRef.current = {
    fetcher,
    onSuccess,
    onNotFound,
    onNetworkError,
    onLoadingChange,
    onErrorClear,
  };

  const runFetch = useCallback(async (targetCity: string, isManual = false) => {
    const city = targetCity.trim();
    if (!city) return;
    const seq = ++requestSeqRef.current;
    const h = handlersRef.current;
    h.onLoadingChange(true);
    h.onErrorClear();
    try {
      const next = await h.fetcher(city);
      if (seq !== requestSeqRef.current) return;
      if (next) {
        activeCityRef.current = city;
        needsRetryRef.current = false;
        h.onSuccess(next, city, isManual);
      } else {
        needsRetryRef.current =
          typeof navigator !== "undefined" && navigator.onLine === false;
        h.onNotFound();
      }
    } catch {
      if (seq !== requestSeqRef.current) return;
      if (isManual) {
        activeCityRef.current = city;
      }
      needsRetryRef.current = true;
      h.onNetworkError();
    } finally {
      if (seq === requestSeqRef.current) {
        h.onLoadingChange(false);
      }
    }
  }, []);

  useEffect(() => {
    runFetch(activeCityRef.current, false);
    const id = setInterval(() => {
      runFetch(activeCityRef.current, false);
    }, intervalMs);
    const handleOnline = () => {
      if (needsRetryRef.current) {
        runFetch(activeCityRef.current, false);
      }
    };
    window.addEventListener("online", handleOnline);
    return () => {
      requestSeqRef.current += 1;
      clearInterval(id);
      window.removeEventListener("online", handleOnline);
    };
  }, [intervalMs, runFetch]);

  const setActiveCity = useCallback((city: string) => {
    const trimmed = city.trim();
    if (trimmed) activeCityRef.current = trimmed;
  }, []);

  return { runFetch, activeCityRef, setActiveCity };
}
