// OpenTripMap API — attractions, sights, monuments.
// Docs: https://dev.opentripmap.org/
// Free tier with key.

const OTM_BASE = "https://api.opentripmap.com/0.1/en";

export interface OTMPlace {
  xid: string;
  name: string;
  kinds: string;
  rate: number;
  lat: number;
  lon: number;
  wikidata?: string;
  preview?: string;
  description?: string;
}

export async function searchOpenTripMap(
  apiKey: string,
  lat: number,
  lon: number,
  radiusM = 5000,
  kinds = "interesting_places,museums,architecture,natural",
  limit = 30
): Promise<OTMPlace[]> {
  const url = new URL(`${OTM_BASE}/places/radius`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("kinds", kinds);
  url.searchParams.set("rate", "2");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apikey", apiKey);
  const res = await fetch(url);
  if (!res.ok) return [];
  return ((await res.json()) as OTMPlace[]) || [];
}

export async function getOpenTripMapDetails(apiKey: string, xid: string): Promise<{
  name: string;
  description?: string;
  image?: string;
  wikipedia?: string;
  address?: Record<string, string>;
} | null> {
  const url = `${OTM_BASE}/places/xid/${xid}?apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  return {
    name: j.name,
    description: j.wikipedia_extracts?.text || j.info?.descr,
    image: j.preview?.source,
    wikipedia: j.wikipedia,
    address: j.address,
  };
}
