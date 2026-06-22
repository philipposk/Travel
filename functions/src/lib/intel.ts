// Travel intelligence: weather, air, FX, holidays, country facts, visa, carbon, guide.
// All free APIs. Some need keys (AQICN, VisaDB, Climatiq); rest keyless.

// ── Open-Meteo: weather, no key ───────────────────────────────────────────
export interface WeatherDay {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipMm: number;
  weatherCode: number;
}
export async function openMeteoForecast(lat: number, lon: number, days = 7): Promise<WeatherDay[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code");
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("timezone", "auto");
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  const out: WeatherDay[] = [];
  const d = j.daily || {};
  for (let i = 0; i < (d.time || []).length; i++) {
    out.push({
      date: d.time[i],
      tempMaxC: d.temperature_2m_max[i],
      tempMinC: d.temperature_2m_min[i],
      precipMm: d.precipitation_sum[i],
      weatherCode: d.weather_code[i],
    });
  }
  return out;
}

// Destination timezone from Open-Meteo (keyless). Returns the IANA name and the
// current UTC offset in seconds so the client can show the *destination's*
// local time instead of the viewer's.
export interface DestinationTimezone { timezone: string; utcOffsetSeconds: number; }
export async function openMeteoTimezone(lat: number, lon: number): Promise<DestinationTimezone | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.timezone) return null;
  return { timezone: j.timezone, utcOffsetSeconds: Number(j.utc_offset_seconds) || 0 };
}

export interface ClimateMonth { month: number; avgTempC: number; precipMm: number; }
export async function openMeteoClimatology(lat: number, lon: number): Promise<ClimateMonth[]> {
  // Past 10 years monthly averages
  const end = new Date(); end.setFullYear(end.getFullYear() - 1);
  const start = new Date(end); start.setFullYear(end.getFullYear() - 10);
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("start_date", start.toISOString().slice(0, 10));
  url.searchParams.set("end_date", end.toISOString().slice(0, 10));
  url.searchParams.set("monthly", "temperature_2m_mean,precipitation_sum");
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  const monthly = j.monthly || {};
  const buckets: Record<number, { t: number[]; p: number[] }> = {};
  for (let i = 0; i < (monthly.time || []).length; i++) {
    const m = Number(monthly.time[i].slice(5, 7));
    buckets[m] = buckets[m] || { t: [], p: [] };
    buckets[m].t.push(monthly.temperature_2m_mean[i]);
    buckets[m].p.push(monthly.precipitation_sum[i]);
  }
  return Array.from({ length: 12 }, (_, i) => {
    const b = buckets[i + 1] || { t: [], p: [] };
    const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return { month: i + 1, avgTempC: avg(b.t), precipMm: avg(b.p) };
  });
}

// ── AQICN: air quality, free token ────────────────────────────────────────
export async function aqicnByGeo(token: string, lat: number, lon: number): Promise<{
  aqi: number; level: string; pollutant: string; updatedAt: string;
} | null> {
  const res = await fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${token}`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== "ok" || !j.data) return null;
  // Stations with no current reading return aqi as "-" (a string); reject those
  // rather than letting a non-numeric value flow into comparisons and the UI.
  const aqi = Number(j.data.aqi);
  if (!Number.isFinite(aqi)) return null;
  const level = aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "unhealthy for sensitive" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very unhealthy" : "hazardous";
  return { aqi, level, pollutant: j.data.dominentpol || "", updatedAt: j.data.time?.iso || "" };
}

// ── Frankfurter: FX rates, no key ─────────────────────────────────────────
// In-memory daily rate cache (per warm instance). ECB/Frankfurter rates change
// once per business day, so repeat conversions need no network round-trip.
const _fxCache = new Map<string, number>();
export async function fxRate(from: string, to: string, amount = 1): Promise<{ rate: number; converted: number } | null> {
  // Fetch the unit rate, then multiply — avoids dividing by a zero/blank amount
  // (which would yield Infinity/NaN for the per-unit rate).
  const qty = Number(amount) > 0 ? Number(amount) : 1;
  const day = new Date().toISOString().slice(0, 10);
  const ck = `${from}|${to}|${day}`;
  let rate = _fxCache.get(ck);
  if (rate == null) {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!res.ok) return null;
    const j = await res.json();
    const r = j.rates?.[to];
    if (typeof r !== "number") return null;
    rate = r;
    _fxCache.set(ck, rate);
  }
  return { rate, converted: rate * qty };
}

// ── Nager.Date: public holidays, no key ───────────────────────────────────
export interface Holiday { date: string; localName: string; name: string; types: string[]; }
export async function publicHolidays(countryCode: string, year: number): Promise<Holiday[]> {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
  if (!res.ok) return [];
  return (await res.json()) as Holiday[];
}

// ── REST Countries: facts, no key ─────────────────────────────────────────
export interface CountryFacts {
  name: string;
  capital: string[];
  region: string;
  population: number;
  currencies: Record<string, { name: string; symbol: string }>;
  languages: Record<string, string>;
  callingCode: string;
  drivingSide: "left" | "right";
  timezones: string[];
  flag: string;
  borders: string[];
}
export async function countryFacts(countryCode: string): Promise<CountryFacts | null> {
  const res = await fetch(`https://restcountries.com/v3.1/alpha/${countryCode}?fields=name,capital,region,population,currencies,languages,idd,car,timezones,flags,borders`);
  if (!res.ok) return null;
  const j = await res.json();
  return {
    name: j.name?.common || "",
    capital: j.capital || [],
    region: j.region || "",
    population: j.population || 0,
    currencies: j.currencies || {},
    languages: j.languages || {},
    callingCode: (j.idd?.root || "") + (j.idd?.suffixes?.[0] || ""),
    drivingSide: j.car?.side || "right",
    timezones: j.timezones || [],
    flag: j.flags?.png || "",
    borders: j.borders || [],
  };
}

// ── VisaDB: visa requirements ─────────────────────────────────────────────
export async function visaRequirement(apiKey: string, passportCC: string, destCC: string): Promise<{
  status: string; durationDays?: number; notes?: string;
} | null> {
  const res = await fetch(`https://visadb.io/api/visa/${passportCC}/${destCC}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const j = await res.json();
  return { status: j.status || j.visa_status, durationDays: j.duration_days, notes: j.notes };
}

// ── Climatiq: carbon emissions ────────────────────────────────────────────
export async function carbonFlight(
  apiKey: string,
  fromIata: string,
  toIata: string,
  passengers = 1,
  travelClass: "economy" | "premium_economy" | "business" | "first" = "economy"
): Promise<{ co2Kg: number } | null> {
  const res = await fetch("https://api.climatiq.io/travel/v1-preview1/flights", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      legs: [{ from: fromIata, to: toIata, passengers, travel_class: travelClass }],
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const co2 = Number(j.co2e ?? j.total_co2e ?? j.co2e_total);
  if (!Number.isFinite(co2)) return null;
  return { co2Kg: co2 };
}

// ── Wikivoyage: destination guide via MediaWiki API ───────────────────────
export async function wikivoyageSummary(destination: string): Promise<{
  extract: string; url: string; thumbnail?: string;
} | null> {
  const url = new URL("https://en.wikivoyage.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts|pageimages|info");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "500");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", destination);
  url.searchParams.set("origin", "*");
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const page = Object.values((j.query?.pages || {}) as Record<string, {
    extract?: string; fullurl?: string; thumbnail?: { source: string };
  }>)[0];
  if (!page?.extract) return null;
  return { extract: page.extract, url: page.fullurl || "", thumbnail: page.thumbnail?.source };
}
