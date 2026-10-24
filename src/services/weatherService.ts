export interface WeatherLocation {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  source: "custom" | "gps" | "ip";
}

export interface GeocodingCity {
  id: number;
  name: string;
  admin1?: string;
  admin2?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
}

export interface WeatherData {
  temp: string;
  code: number;
  locationName: string;
  source: "custom" | "gps" | "ip";
}

const STORAGE_KEY = "island_weather_custom_city";
const CACHE_WEATHER_KEY = "island_cached_weather_data";
const CACHE_LOC_KEY = "island_cached_weather_location";
export const WEATHER_LOCATION_EVENT = "island_weather_location_changed";

export function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_WEATHER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cache cuaca valid selama 15 menit agar selalu sinkron dengan kondisi nyata
    if (parsed && parsed.temp && (Date.now() - (parsed.cachedAt || 0) < 15 * 60 * 1000)) {
      return parsed;
    }
  } catch {}
  return null;
}

export function saveCachedWeather(data: WeatherData) {
  try {
    localStorage.setItem(CACHE_WEATHER_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {}
}

export function clearWeatherCache(): void {
  try {
    localStorage.removeItem(CACHE_WEATHER_KEY);
  } catch {}
}

export function getSavedCustomCity(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
      return { ...parsed, source: "custom" };
    }
  } catch {}
  return null;
}

export function saveCustomCity(city: WeatherLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(WEATHER_LOCATION_EVENT));
    }
  } catch (err) {
    console.error("Failed to save custom weather city:", err);
  }
}

export function clearCustomCity() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(WEATHER_LOCATION_EVENT));
    }
  } catch (err) {
    console.error("Failed to clear custom weather city:", err);
  }
}

export function subscribeWeatherChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(WEATHER_LOCATION_EVENT, callback);
  return () => window.removeEventListener(WEATHER_LOCATION_EVENT, callback);
}

function getGpsCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let hasResolved = false;
    const timer = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(null);
      }
    }, 4500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!hasResolved) {
          hasResolved = true;
          clearTimeout(timer);
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      },
      () => {
        if (!hasResolved) {
          hasResolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      },
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 600000 }
    );
  });
}

async function getIpCoordinates(): Promise<WeatherLocation | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json", {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);

    if (isNaN(lat) || isNaN(lon)) return null;

    return {
      name: data.city || data.region || "Local Area",
      admin1: data.region,
      country: data.country,
      latitude: lat,
      longitude: lon,
      source: "ip",
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export function getSavedLastLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_LOC_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {}
  return null;
}

export function saveLastLocation(loc: WeatherLocation) {
  try {
    localStorage.setItem(CACHE_LOC_KEY, JSON.stringify(loc));
  } catch {}
}

export async function resolveWeatherLocation(): Promise<WeatherLocation> {
  // 1. Check user manual override
  const custom = getSavedCustomCity();
  if (custom) return custom;

  // 2. Fast path: check last saved location so we don't wait 4.5s on boot
  const lastLoc = getSavedLastLocation();
  if (lastLoc) {
    // Refresh location asynchronously in background without blocking
    setTimeout(async () => {
      try {
        const gps = await getGpsCoordinates();
        if (gps) {
          const isNearby =
            Math.abs(gps.latitude - lastLoc.latitude) < 0.15 &&
            Math.abs(gps.longitude - lastLoc.longitude) < 0.15;
          const existingCityName =
            lastLoc.name && lastLoc.name !== "Current Location" && lastLoc.name !== "GPS Location"
              ? lastLoc.name
              : null;
          let resolvedName = isNearby && existingCityName ? existingCityName : null;
          if (!resolvedName) {
            const ipLoc = await getIpCoordinates();
            resolvedName = ipLoc?.name || existingCityName || "GPS Location";
          }
          saveLastLocation({
            name: resolvedName,
            admin1: lastLoc.admin1,
            country: lastLoc.country,
            latitude: gps.latitude,
            longitude: gps.longitude,
            source: "gps",
          });
          return;
        }

        const ipLoc = await getIpCoordinates();
        if (ipLoc) {
          saveLastLocation(ipLoc);
        }
      } catch {}
    }, 100);
    return lastLoc;
  }

  // 3. Try browser / Wi-Fi Geolocation
  const gps = await getGpsCoordinates();
  if (gps) {
    const ipLoc = await getIpCoordinates();
    const loc: WeatherLocation = {
      name: ipLoc?.name || "GPS Location",
      admin1: ipLoc?.admin1,
      country: ipLoc?.country,
      latitude: gps.latitude,
      longitude: gps.longitude,
      source: "gps",
    };
    saveLastLocation(loc);
    return loc;
  }

  // 4. Fallback to IP Geolocation
  const ipLoc = await getIpCoordinates();
  if (ipLoc) {
    saveLastLocation(ipLoc);
    return ipLoc;
  }

  // 5. Default fallback (Jakarta)
  return {
    name: "Jakarta",
    country: "Indonesia",
    latitude: -6.2088,
    longitude: 106.8456,
    source: "ip",
  };
}

export async function fetchCurrentWeather(location?: WeatherLocation): Promise<WeatherData | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const loc = location || (await resolveWeatherLocation());
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,precipitation,rain,showers,snowfall,is_day&current_weather=true`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json();
    const current = data.current || data.current_weather;
    if (!current) return null;

    let code = current.weather_code !== undefined ? current.weather_code : current.weathercode;
    const precip = current.precipitation !== undefined ? current.precipitation : 0;

    // Filter WMO 51 (gerimis sangat tipis/embun tropis di bawah 0.25mm) agar tidak memicu animasi hujan palsu
    if (code === 51 && precip < 0.25) {
      code = 2; // Berawan sebagian
    }

    const tempVal = current.temperature_2m !== undefined ? current.temperature_2m : current.temperature;

    const result: WeatherData = {
      temp: `${Math.round(tempVal)}°`,
      code,
      locationName: loc.name,
      source: loc.source,
    };
    saveCachedWeather(result);
    return result;
  } catch (err) {
    clearTimeout(timer);
    console.error("fetchCurrentWeather error:", err);
    return null;
  }
}

export async function searchCities(query: string, lang = "id"): Promise<GeocodingCity[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      trimmed
    )}&count=6&language=${lang}&format=json`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results.map((r: any) => ({
      id: r.id,
      name: r.name,
      admin1: r.admin1,
      admin2: r.admin2,
      country: r.country,
      countryCode: r.country_code,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch (err) {
    clearTimeout(timer);
    console.error("searchCities error:", err);
    return [];
  }
}
