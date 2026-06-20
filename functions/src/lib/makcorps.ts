// Makcorps API — hotel price comparison across major OTAs.
// Docs: https://docs.makcorps.com
// Free tier limited but covers price-compare use case.

const MAKCORPS_BASE = "https://api.makcorps.com";

export interface MakcorpsHotelPrice {
  hotelName: string;
  vendor: string; // "booking", "expedia", "hotels", etc.
  price: number;
  currency: string;
  url?: string;
}

export async function searchMakcorpsHotels(
  apiKey: string,
  cityName: string,
  checkIn: string,
  checkOut: string,
  guests = 2,
  currency = "USD"
): Promise<MakcorpsHotelPrice[]> {
  const url = new URL(`${MAKCORPS_BASE}/free/${encodeURIComponent(cityName)}`);
  url.searchParams.set("checkin", checkIn);
  url.searchParams.set("checkout", checkOut);
  url.searchParams.set("adults", String(guests));
  url.searchParams.set("currency", currency);
  url.searchParams.set("api_key", apiKey);
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  // Response shape: [{ "1": [{ "vendor1": [{ "price": "...", "vendor1_price": "$..." }] }] }]
  const flat: MakcorpsHotelPrice[] = [];
  for (const entry of Array.isArray(json) ? json : []) {
    for (const idx of Object.values(entry as Record<string, unknown>)) {
      const arr = Array.isArray(idx) ? idx : [];
      for (const row of arr) {
        const r = row as Record<string, string>;
        const name = r.name || r.hotelName || "";
        for (const [k, v] of Object.entries(r)) {
          if (k.endsWith("_price") && typeof v === "string") {
            const vendor = k.replace("_price", "");
            const price = Number(v.replace(/[^\d.]/g, ""));
            if (price > 0) flat.push({ hotelName: name, vendor, price, currency });
          }
        }
      }
    }
  }
  return flat;
}
