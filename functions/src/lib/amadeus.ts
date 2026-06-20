// Amadeus Self-Service API client. Free tier on test endpoint.
// Docs: https://developers.amadeus.com/self-service

const AMADEUS_BASE = "https://test.api.amadeus.com";

let cachedToken: { token: string; expiresAt: number } | null = null;
// Cache the in-flight request, not just the resolved token, so concurrent
// flight+hotel+car calls share one token fetch instead of racing (and
// potentially clobbering the cache with a stale token).
let inFlightToken: Promise<string> | null = null;

async function getAmadeusToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  if (inFlightToken) return inFlightToken;
  inFlightToken = (async () => {
    try {
      const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        // URL-encode credentials so secrets containing +, &, =, / don't corrupt the body.
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      if (!res.ok) throw new Error(`Amadeus auth ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { access_token: string; expires_in: number };
      cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
      return data.access_token;
    } finally {
      inFlightToken = null;
    }
  })();
  return inFlightToken;
}

export interface AmadeusFlightOffer {
  id: string;
  price: { total: string; currency: string };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: { iataCode: string; at: string };
      arrival: { iataCode: string; at: string };
      carrierCode: string;
      number: string;
      duration: string;
    }>;
  }>;
}

export async function searchAmadeusFlights(
  clientId: string,
  clientSecret: string,
  from: string,
  to: string,
  date: string,
  passengers: number
): Promise<AmadeusFlightOffer[]> {
  const token = await getAmadeusToken(clientId, clientSecret);
  const url = new URL(`${AMADEUS_BASE}/v2/shopping/flight-offers`);
  url.searchParams.set("originLocationCode", from);
  url.searchParams.set("destinationLocationCode", to);
  url.searchParams.set("departureDate", date);
  url.searchParams.set("adults", String(passengers));
  url.searchParams.set("max", "20");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Amadeus flights ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: AmadeusFlightOffer[] };
  return json.data || [];
}

export interface AmadeusHotelOffer {
  hotel: { hotelId: string; name: string; latitude: number; longitude: number };
  offers: Array<{
    id: string;
    price: { total: string; currency: string };
    policies?: { cancellation?: { description?: { text: string } } };
    room?: { description?: { text: string } };
  }>;
}

export async function searchAmadeusHotels(
  clientId: string,
  clientSecret: string,
  cityCode: string,
  checkIn: string,
  checkOut: string,
  guests: number
): Promise<AmadeusHotelOffer[]> {
  const token = await getAmadeusToken(clientId, clientSecret);

  // Step 1: hotel IDs by city
  const listUrl = new URL(`${AMADEUS_BASE}/v1/reference-data/locations/hotels/by-city`);
  listUrl.searchParams.set("cityCode", cityCode);
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) return [];
  const list = (await listRes.json()) as { data: Array<{ hotelId: string }> };
  const hotelIds = (list.data || []).slice(0, 25).map((h) => h.hotelId).join(",");
  if (!hotelIds) return [];

  // Step 2: offers
  const offerUrl = new URL(`${AMADEUS_BASE}/v3/shopping/hotel-offers`);
  offerUrl.searchParams.set("hotelIds", hotelIds);
  offerUrl.searchParams.set("checkInDate", checkIn);
  offerUrl.searchParams.set("checkOutDate", checkOut);
  offerUrl.searchParams.set("adults", String(guests));
  const offerRes = await fetch(offerUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!offerRes.ok) return [];
  const json = (await offerRes.json()) as { data: AmadeusHotelOffer[] };
  return json.data || [];
}

export async function searchAmadeusCars(
  clientId: string,
  clientSecret: string,
  pickupCode: string,
  pickupDate: string,
  dropoffDate: string
) {
  const token = await getAmadeusToken(clientId, clientSecret);
  // Amadeus Cars uses transfer search endpoint
  const url = new URL(`${AMADEUS_BASE}/v1/shopping/transfer-offers`);
  url.searchParams.set("startLocationCode", pickupCode);
  url.searchParams.set("startDateTime", `${pickupDate}T10:00:00`);
  url.searchParams.set("endDateTime", `${dropoffDate}T10:00:00`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  return ((await res.json()) as { data?: unknown[] })?.data || [];
}
