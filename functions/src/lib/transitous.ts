// Transitous — community-run public-transport routing. No key.
// Docs: https://api.transitous.org/

const TRANSITOUS_BASE = "https://api.transitous.org/api/v1";

export interface TransitousLeg {
  mode: string;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  startTime: string;
  endTime: string;
  duration: number;
  routeShortName?: string;
  agencyName?: string;
}

export interface TransitousItinerary {
  duration: number;
  startTime: string;
  endTime: string;
  walkDistance: number;
  legs: TransitousLeg[];
}

export async function transitousPlan(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  departAt?: string
): Promise<TransitousItinerary[]> {
  const url = new URL(`${TRANSITOUS_BASE}/plan`);
  url.searchParams.set("fromPlace", `${fromLat},${fromLon}`);
  url.searchParams.set("toPlace", `${toLat},${toLon}`);
  if (departAt) url.searchParams.set("time", new Date(departAt).toISOString());
  url.searchParams.set("arriveBy", "false");
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = (await res.json()) as { itineraries?: TransitousItinerary[] };
  return j.itineraries || [];
}
