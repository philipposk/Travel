// Travelpayouts affiliate API — Aviasales (flights) + Hotellook (hotels).
// Docs: https://support.travelpayouts.com/hc/en-us/categories/200358578
// Free affiliate program. Returns cached cheapest prices + affiliate URLs.

const FLIGHT_BASE = "https://api.travelpayouts.com/aviasales/v3";
const HOTEL_BASE = "https://engine.hotellook.com/api/v2";

export interface TPFlight {
  origin: string;
  destination: string;
  price: number;
  airline: string;
  flight_number: string;
  departure_at: string;
  return_at?: string;
  duration: number;
  link: string;
}

export async function searchTravelpayoutsFlights(
  token: string,
  marker: string,
  from: string,
  to: string,
  date: string,
  currency = "USD"
): Promise<TPFlight[]> {
  const url = new URL(`${FLIGHT_BASE}/prices_for_dates`);
  url.searchParams.set("origin", from);
  url.searchParams.set("destination", to);
  url.searchParams.set("departure_at", date);
  url.searchParams.set("currency", currency);
  url.searchParams.set("token", token);
  url.searchParams.set("marker", marker);
  url.searchParams.set("sorting", "price");
  url.searchParams.set("limit", "30");
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = (await res.json()) as { data: TPFlight[] };
  return (j.data || []).map((f) => ({
    ...f,
    link: `https://www.aviasales.com${f.link}?marker=${marker}`,
  }));
}

export interface TPHotel {
  hotelId: number;
  hotelName: string;
  location: { name: string; country: string; geo: { lat: number; lon: number } };
  priceFrom: number;
  priceAvg: number;
  stars: number;
  pricePercentile?: Record<string, number>;
}

export async function searchTravelpayoutsHotels(
  marker: string,
  location: string,
  checkIn: string,
  checkOut: string,
  guests = 2,
  currency = "USD"
): Promise<TPHotel[]> {
  const url = new URL(`${HOTEL_BASE}/cache.json`);
  url.searchParams.set("location", location);
  url.searchParams.set("checkIn", checkIn);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("adults", String(guests));
  url.searchParams.set("currency", currency);
  url.searchParams.set("limit", "30");
  const res = await fetch(url);
  if (!res.ok) return [];
  return ((await res.json()) as TPHotel[]) || [];
}

export function buildHotellookAffiliateUrl(
  hotelId: number,
  checkIn: string,
  checkOut: string,
  marker: string,
  adults = 2
): string {
  const u = new URL("https://search.hotellook.com/hotels");
  u.searchParams.set("hotelId", String(hotelId));
  u.searchParams.set("checkIn", checkIn);
  u.searchParams.set("checkOut", checkOut);
  u.searchParams.set("adults", String(adults));
  u.searchParams.set("marker", marker);
  return u.toString();
}
