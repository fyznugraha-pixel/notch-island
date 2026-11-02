export interface CurrencyRatesResponse {
  rates: Record<string, number>;
  timeLastUpdate: string;
  source: string;
}

const CACHE_KEY = "gili_currency_rates_v2";
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  IDR: 18144,
  EUR: 0.945,
  SGD: 1.34,
  JPY: 154.2,
  MYR: 4.45,
  GBP: 0.79,
  AUD: 1.55,
  CNY: 7.23,
  KRW: 1395,
};

export const SUPPORTED_CURRENCIES = [
  "USD",
  "IDR",
  "EUR",
  "SGD",
  "JPY",
  "MYR",
  "GBP",
  "AUD",
  "CNY",
  "KRW",
];

export async function getLiveCurrencyRates(
  forceRefresh = false
): Promise<CurrencyRatesResponse> {
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          Date.now() - parsed.timestamp < CACHE_DURATION_MS &&
          parsed.rates?.IDR
        ) {
          return {
            rates: parsed.rates,
            timeLastUpdate: parsed.timeLastUpdate || "Tersimpan",
            source: "open.er-api.com (Cache)",
          };
        }
      }
    } catch {}
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates.IDR === "number") {
        let dateLabel = "Hari ini";
        if (data.time_last_update_utc) {
          const parsedDate = new Date(data.time_last_update_utc);
          if (!isNaN(parsedDate.getTime())) {
            dateLabel = parsedDate.toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
          }
        }
        const payload: CurrencyRatesResponse = {
          rates: data.rates,
          timeLastUpdate: dateLabel,
          source: "open.er-api.com (Live)",
        };
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ...payload, timestamp: Date.now() })
          );
        } catch {}
        return payload;
      }
    }
  } catch (err) {
    console.warn("Using offline fallback currency rates:", err);
  }

  return {
    rates: DEFAULT_RATES,
    timeLastUpdate: "Offline (perkiraan)",
    source: "Default",
  };
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  const fromRate = rates[from] || 1;
  const toRate = rates[to] || 1;
  return (amount / fromRate) * toRate;
}

