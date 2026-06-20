// Navitia.io — global public transit routing.
// Docs: https://doc.navitia.io
// Free key. Coverage = many EU + global cities via OpenData.

const NAVITIA_BASE = "https://api.navitia.io/v1";

export interface NavitiaSection {
  type: string;
  mode?: string;
  duration: number; // seconds
  from?: { name: string; coord: { lat: number; lon: number } };
  to?: { name: string; coord: { lat: number; lon: number } };
  display_informations?: {
    network: string;
    commercial_mode: string;
    label: string;
    headsign: string;
  };
  departure_date_time?: string;
  arrival_date_time?: string;
}

export interface NavitiaJourney {
  duration: number;
  nb_transfers: number;
  departure_date_time: string;
  arrival_date_time: string;
  co2_emission?: { value: number; unit: string };
  sections: NavitiaSection[];
  fare?: { total?: { value: string; currency: string } };
}

export async function navitiaJourney(
  apiKey: string,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  departAt?: string
): Promise<NavitiaJourney[]> {
  const url = new URL(`${NAVITIA_BASE}/journeys`);
  url.searchParams.set("from", `${fromLon};${fromLat}`);
  url.searchParams.set("to", `${toLon};${toLat}`);
  if (departAt) url.searchParams.set("datetime", departAt.replace(/[-:]/g, "").replace(".000Z", ""));
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return [];
  const j = (await res.json()) as { journeys?: NavitiaJourney[] };
  return j.journeys || [];
}
