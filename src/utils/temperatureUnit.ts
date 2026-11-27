import { emitCrossWindowEvent, listenCrossWindowEvent } from "./crossWindowSync";

export type TemperatureUnit = "celsius" | "fahrenheit";

export const TEMPERATURE_UNIT_STORAGE_KEY = "island_temperature_unit";
export const TEMPERATURE_UNIT_EVENT = "island_temperature_unit_changed";

export function normalizeTemperatureUnit(raw: unknown): TemperatureUnit {
  if (typeof raw === "string") {
    const clean = raw.trim().toLowerCase();
    if (clean === "fahrenheit" || clean === "f") {
      return "fahrenheit";
    }
  }
  return "celsius";
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function convertTemperatureFromCelsius(
  celsius: number,
  unit: TemperatureUnit
): number {
  return unit === "fahrenheit" ? celsiusToFahrenheit(celsius) : celsius;
}

export function temperatureUnitSymbol(unit: TemperatureUnit): "°C" | "°F" {
  return unit === "fahrenheit" ? "°F" : "°C";
}

export function formatTemperature(
  celsius: number,
  unit: TemperatureUnit,
  options?: { showUnit?: boolean; decimals?: number }
): string {
  const showUnit = options?.showUnit ?? true;
  const decimals = options?.decimals ?? 0;
  const converted = convertTemperatureFromCelsius(celsius, unit);
  if (!Number.isFinite(converted)) {
    return showUnit ? `--${temperatureUnitSymbol(unit)}` : "--°";
  }
  const factor = Math.pow(10, decimals);
  let rounded = Math.round(converted * factor) / factor;
  if (Object.is(rounded, -0) || rounded === 0) rounded = 0;
  const numStr = decimals > 0 ? rounded.toFixed(decimals) : String(rounded);
  return showUnit ? `${numStr}${temperatureUnitSymbol(unit)}` : `${numStr}°`;
}

export function parseCelsiusFallback(tempStr?: string): number | null {
  if (!tempStr) return null;
  const match = String(tempStr).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTemperatureUnit(): TemperatureUnit {
  try {
    if (typeof localStorage === "undefined") return "celsius";
    return normalizeTemperatureUnit(
      localStorage.getItem(TEMPERATURE_UNIT_STORAGE_KEY)
    );
  } catch {
    return "celsius";
  }
}

export function setTemperatureUnit(unit: TemperatureUnit): void {
  const normalized = normalizeTemperatureUnit(unit);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TEMPERATURE_UNIT_STORAGE_KEY, normalized);
    }
  } catch {}
  emitCrossWindowEvent(TEMPERATURE_UNIT_EVENT, normalized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gili_widget_mirror_sync"));
  }
}

export function subscribeTemperatureUnit(
  callback: (unit: TemperatureUnit) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const unsubCrossWindow = listenCrossWindowEvent<TemperatureUnit>(
    TEMPERATURE_UNIT_EVENT,
    () => callback(getTemperatureUnit())
  );
  const onStorage = (e: StorageEvent) => {
    if (e.key === TEMPERATURE_UNIT_STORAGE_KEY || e.key === null) {
      callback(getTemperatureUnit());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    unsubCrossWindow();
    window.removeEventListener("storage", onStorage);
  };
}
