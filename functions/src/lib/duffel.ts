// Duffel API client — flight search + booking.
// Docs: https://duffel.com/docs/api
// Free test mode (sandbox=true). Production needs IATA-style account.

const DUFFEL_BASE = "https://api.duffel.com";

interface DuffelOfferRequest {
  slices: Array<{ origin: string; destination: string; departure_date: string }>;
  passengers: Array<{ type: "adult" | "child" | "infant_without_seat" }>;
  cabin_class: "economy" | "premium_economy" | "business" | "first";
}

export interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { iata_code: string; name: string };
  slices: Array<{
    duration: string;
    segments: Array<{
      origin: { iata_code: string };
      destination: { iata_code: string };
      departing_at: string;
      arriving_at: string;
      duration: string;
      marketing_carrier: { name: string };
      marketing_carrier_flight_number: string;
    }>;
  }>;
}

async function duffelFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DUFFEL_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Duffel-Version": "v2",
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Duffel ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function searchDuffelFlights(
  token: string,
  from: string,
  to: string,
  date: string,
  passengers: number,
  cabinClass: DuffelOfferRequest["cabin_class"] = "economy"
): Promise<DuffelOffer[]> {
  const body = {
    data: {
      slices: [{ origin: from, destination: to, departure_date: date }],
      passengers: Array.from({ length: passengers }, () => ({ type: "adult" as const })),
      cabin_class: cabinClass,
      return_offers: true,
    },
  };
  const result = await duffelFetch<{ data: { offers: DuffelOffer[] } }>(
    "/air/offer_requests?return_offers=true",
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
  return result.data.offers;
}

export async function createDuffelOrder(
  token: string,
  offerId: string,
  passengers: Array<{
    title: "mr" | "mrs" | "ms" | "miss" | "dr";
    given_name: string;
    family_name: string;
    born_on: string; // YYYY-MM-DD
    gender: "m" | "f";
    email: string;
    phone_number: string; // E.164
  }>
) {
  return duffelFetch<{ data: { id: string; booking_reference: string } }>(
    "/air/orders",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "instant",
          selected_offers: [offerId],
          passengers,
        },
      }),
    }
  );
}
