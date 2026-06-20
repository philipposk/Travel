// Geoapify Places API — POI search by category around a coordinate or in a bbox.
// Docs: https://apidocs.geoapify.com/docs/places/
// Free tier: 3000 requests/day.

const GEOAPIFY_BASE = "https://api.geoapify.com/v2";

export interface GeoapifyPlace {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lon: number;
  website?: string;
  phone?: string;
  rating?: number;
  openingHours?: string;
}

export async function searchGeoapifyPlaces(
  apiKey: string,
  categories: string[], // e.g. ["catering.restaurant", "tourism.attraction"]
  lat: number,
  lon: number,
  radiusM = 3000,
  limit = 30
): Promise<GeoapifyPlace[]> {
  const url = new URL(`${GEOAPIFY_BASE}/places`);
  url.searchParams.set("categories", categories.join(","));
  url.searchParams.set("filter", `circle:${lon},${lat},${radiusM}`);
  url.searchParams.set("bias", `proximity:${lon},${lat}`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = (await res.json()) as {
    features: Array<{
      properties: Record<string, unknown> & {
        place_id: string;
        name?: string;
        categories: string[];
        formatted: string;
        lat: number;
        lon: number;
        website?: string;
        phone?: string;
        opening_hours?: string;
      };
    }>;
  };
  return (j.features || []).map((f) => ({
    id: f.properties.place_id,
    name: f.properties.name || "Unknown",
    category: f.properties.categories?.[0] || "",
    address: f.properties.formatted,
    lat: f.properties.lat,
    lon: f.properties.lon,
    website: f.properties.website,
    phone: f.properties.phone,
    openingHours: f.properties.opening_hours,
  }));
}

export async function geoapifyGeocode(
  apiKey: string,
  text: string
): Promise<{ lat: number; lon: number; formatted: string; country: string; countryCode: string } | null> {
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", text);
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const f = j.features?.[0];
  if (!f) return null;
  return {
    lat: f.properties.lat,
    lon: f.properties.lon,
    formatted: f.properties.formatted,
    country: f.properties.country,
    countryCode: f.properties.country_code?.toUpperCase() || "",
  };
}
