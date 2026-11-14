export type CurrencyCode =
  | "IDR"
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "SGD"
  | "MYR"
  | "AUD"

export interface CurrencyPreset {
  label: string;
  valueInCurrency: number;
}

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  ratePerUsd: number;
  locale: string;
  decimals: number;
  presets: CurrencyPreset[];
}

export const CURRENCY_CONFIGS: Record<CurrencyCode, CurrencyConfig> = {
  IDR: {
    code: "IDR",
    symbol: "Rp",
    name: "Indonesian Rupiah",
    ratePerUsd: 16000,
    locale: "id-ID",
    decimals: 0,
    presets: [
      { label: "10k", valueInCurrency: 10000 },
      { label: "20k", valueInCurrency: 20000 },
      { label: "30k", valueInCurrency: 30000 },
      { label: "50k", valueInCurrency: 50000 },
      { label: "100k", valueInCurrency: 100000 },
    ],
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    ratePerUsd: 1.0,
    locale: "en-US",
    decimals: 2,
    presets: [
      { label: "$1", valueInCurrency: 1 },
      { label: "$2", valueInCurrency: 2 },
      { label: "$5", valueInCurrency: 5 },
      { label: "$10", valueInCurrency: 10 },
      { label: "$20", valueInCurrency: 20 },
    ],
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    name: "Euro",
    ratePerUsd: 0.95,
    locale: "de-DE",
    decimals: 2,
    presets: [
      { label: "€1", valueInCurrency: 1 },
      { label: "€2", valueInCurrency: 2 },
      { label: "€5", valueInCurrency: 5 },
      { label: "€10", valueInCurrency: 10 },
      { label: "€20", valueInCurrency: 20 },
    ],
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    name: "British Pound",
    ratePerUsd: 0.79,
    locale: "en-GB",
    decimals: 2,
    presets: [
      { label: "£1", valueInCurrency: 1 },
      { label: "£2", valueInCurrency: 2 },
      { label: "£5", valueInCurrency: 5 },
      { label: "£10", valueInCurrency: 10 },
      { label: "£20", valueInCurrency: 20 },
    ],
  },
  JPY: {
    code: "JPY",
    symbol: "¥",
    name: "Japanese Yen",
    ratePerUsd: 155.0,
    locale: "ja-JP",
    decimals: 0,
    presets: [
      { label: "¥150", valueInCurrency: 150 },
      { label: "¥300", valueInCurrency: 300 },
      { label: "¥750", valueInCurrency: 750 },
      { label: "¥1.5k", valueInCurrency: 1500 },
      { label: "¥3k", valueInCurrency: 3000 },
    ],
  },
  SGD: {
    code: "SGD",
    symbol: "S$",
    name: "Singapore Dollar",
    ratePerUsd: 1.35,
    locale: "en-SG",
    decimals: 2,
    presets: [
      { label: "S$1", valueInCurrency: 1 },
      { label: "S$2", valueInCurrency: 2 },
      { label: "S$5", valueInCurrency: 5 },
      { label: "S$10", valueInCurrency: 10 },
      { label: "S$20", valueInCurrency: 20 },
    ],
  },
  MYR: {
    code: "MYR",
    symbol: "RM",
    name: "Malaysian Ringgit",
    ratePerUsd: 4.45,
    locale: "ms-MY",
    decimals: 2,
    presets: [
      { label: "RM5", valueInCurrency: 5 },
      { label: "RM10", valueInCurrency: 10 },
      { label: "RM20", valueInCurrency: 20 },
      { label: "RM50", valueInCurrency: 50 },
      { label: "RM100", valueInCurrency: 100 },
    ],
  },
  AUD: {
    code: "AUD",
    symbol: "A$",
    name: "Australian Dollar",
    ratePerUsd: 1.55,
    locale: "en-AU",
    decimals: 2,
    presets: [
      { label: "A$1", valueInCurrency: 1 },
      { label: "A$2", valueInCurrency: 2 },
      { label: "A$5", valueInCurrency: 5 },
      { label: "A$10", valueInCurrency: 10 },
      { label: "A$20", valueInCurrency: 20 },
    ],
  },
};

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  "IDR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "SGD",
  "MYR",
  "AUD",
];

const CURRENCY_STORAGE_KEY = "island_ai_currency";
const BASE_USD_TO_IDR = 16000;

/**
 * Gets the current active currency code from localStorage.
 */
export function getActiveCurrency(): CurrencyCode {
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyCode;
    if (saved && CURRENCY_CONFIGS[saved]) {
      return saved;
    }
  } catch { }
  return "IDR";
}

/**
 * Saves the chosen currency and dispatches an update event for reactive UI re-renders.
 */
export function setActiveCurrency(code: CurrencyCode): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  } catch { }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("island_ai_currency_changed", { detail: code })
    );
  }
}

/**
 * Converts an IDR amount into the target currency value.
 */
export function convertIdrToCurrency(
  costIdr: number,
  targetCurrency: CurrencyCode
): number {
  if (targetCurrency === "IDR") return costIdr;
  const costUsd = costIdr / BASE_USD_TO_IDR;
  const config = CURRENCY_CONFIGS[targetCurrency] || CURRENCY_CONFIGS.USD;
  return costUsd * config.ratePerUsd;
}

/**
 * Converts a currency amount back into IDR (for storage in monthlyLimitIdr).
 */
export function convertCurrencyToIdr(
  amountInCurrency: number,
  sourceCurrency: CurrencyCode
): number {
  if (sourceCurrency === "IDR") return Math.round(amountInCurrency);
  const config = CURRENCY_CONFIGS[sourceCurrency] || CURRENCY_CONFIGS.USD;
  const costUsd = amountInCurrency / config.ratePerUsd;
  return Math.round(costUsd * BASE_USD_TO_IDR);
}

/**
 * Formats a currency amount into a clean, human-readable string with proper symbol & decimals.
 */
export function formatCurrencyAmount(
  amountInCurrency: number,
  currency: CurrencyCode
): string {
  const config = CURRENCY_CONFIGS[currency] || CURRENCY_CONFIGS.IDR;
  const { symbol, decimals, locale } = config;

  if (amountInCurrency === 0) {
    return decimals > 0 ? `${symbol}0.00` : `${symbol} 0`;
  }

  // Very small micro-costs (< 0.01 on decimal currencies, or < 1 on non-decimals)
  if (decimals > 0) {
    if (amountInCurrency < 0.0001 && amountInCurrency > 0) {
      return `< ${symbol}0.0001`;
    }
    if (amountInCurrency < 0.01) {
      return `${symbol}${amountInCurrency.toFixed(4)}`;
    }
    return `${symbol}${amountInCurrency.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  // Currencies without decimals (IDR, JPY)
  if (currency === "IDR") {
    if (amountInCurrency > 0 && amountInCurrency < 1) {
      return `< ${symbol} 1`;
    }
    return `${symbol} ${Math.round(amountInCurrency).toLocaleString(locale)}`;
  }

  if (currency === "JPY") {
    if (amountInCurrency < 1 && amountInCurrency > 0) {
      return `${symbol}${amountInCurrency.toFixed(2)}`;
    }
    return `${symbol}${Math.round(amountInCurrency).toLocaleString(locale)}`;
  }

  return `${symbol} ${Math.round(amountInCurrency).toLocaleString(locale)}`;
}

/**
 * Parses a localized manual budget string into a numeric value in the active currency.
 * Preserves grouping dots/commas cleanly for zero-decimal currencies such as IDR and JPY.
 */
export function parseCurrencyInput(rawValue: string, decimals: number): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (decimals === 0) {
    const digitsOnly = trimmed.replace(/[^\d]/g, "");
    if (!digitsOnly) return null;
    const parsed = Number(digitsOnly);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  let normalized = trimmed.replace(/[^\d.,]/g, "");
  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Handles comma decimal separators such as de-DE ("12,50" or "1.200,50")
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * High-level helper: takes cost in IDR, converts to target currency, and formats for UI display.
 */
export function formatIdrCostInCurrency(
  costIdr: number,
  currency: CurrencyCode = getActiveCurrency()
): string {
  const amountInCurrency = convertIdrToCurrency(costIdr, currency);
  return formatCurrencyAmount(amountInCurrency, currency);
}

