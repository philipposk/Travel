// AI itinerary generator. Combines Gemini (structuring) + Geoapify (POI lookup).
import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchGeoapifyPlaces, geoapifyGeocode, type GeoapifyPlace } from "./geoapify";

export interface ItineraryActivity {
  time: string;            // "09:00"
  title: string;
  description: string;
  category: string;        // restaurant | attraction | transit | hotel | free
  location?: { name: string; lat: number; lon: number };
  durationMin: number;
  estimatedCost?: { amount: number; currency: string };
  poiId?: string;          // Geoapify ID if matched
  bookingUrl?: string;
}

export interface ItineraryDay {
  day: number;
  date: string;            // YYYY-MM-DD
  theme: string;
  activities: ItineraryActivity[];
  estimatedDailyCost: number;
  notes?: string;
}

export interface Itinerary {
  destination: string;
  countryCode?: string;
  centerLat?: number;
  centerLon?: number;
  startDate: string;
  endDate: string;
  travelers: number;
  budget: { tier: "shoestring" | "mid" | "luxury"; currency: string };
  interests: string[];
  days: ItineraryDay[];
  totalEstimatedCost: number;
  currency: string;
  generatedAt: string;
}

export interface GenerateOptions {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budgetTier: "shoestring" | "mid" | "luxury";
  currency: string;
  interests: string[];     // e.g. ["food", "history", "nightlife"]
  pace?: "relaxed" | "balanced" | "packed";
}

const CATEGORY_MAP: Record<string, string[]> = {
  food: ["catering.restaurant", "catering.cafe", "catering.fast_food"],
  history: ["heritage", "tourism.sights", "religion"],
  nature: ["natural", "leisure.park"],
  art: ["entertainment.museum", "entertainment.culture"],
  nightlife: ["adult", "entertainment.nightclub", "catering.bar"],
  shopping: ["commercial.shopping_mall", "commercial.marketplace"],
  beach: ["beach"],
  adventure: ["sport"],
};

export async function generateItinerary(
  gemini: GoogleGenerativeAI,
  geoapifyKey: string,
  opts: GenerateOptions
): Promise<Itinerary> {
  // 1. Geocode destination
  const geo = await geoapifyGeocode(geoapifyKey, opts.destination);
  if (!geo) throw new Error(`Could not geocode: ${opts.destination}`);

  // 2. Pull candidate POIs per interest
  const cats = opts.interests.flatMap((i) => CATEGORY_MAP[i] || []);
  const pois: GeoapifyPlace[] = cats.length
    ? await searchGeoapifyPlaces(geoapifyKey, cats, geo.lat, geo.lon, 8000, 80)
    : await searchGeoapifyPlaces(geoapifyKey, ["tourism.sights", "catering.restaurant"], geo.lat, geo.lon, 8000, 80);

  // 3. Build prompt
  // Count days from date-only UTC midnights so a DST transition (a 23h/25h
  // local day) can't shift the count by one.
  const toUTCDay = (s: string) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  const dayCount = Math.max(
    1,
    Math.round((toUTCDay(opts.endDate) - toUTCDay(opts.startDate)) / 86_400_000) + 1
  );
  const poiSummary = pois.slice(0, 60).map((p) => `- ${p.name} (${p.category}) @ ${p.lat},${p.lon} [id:${p.id}]`).join("\n");
  const prompt = `You are a travel planner. Generate a ${dayCount}-day itinerary for ${opts.destination}.

Travelers: ${opts.travelers}
Budget tier: ${opts.budgetTier} (${opts.currency})
Interests: ${opts.interests.join(", ") || "general sightseeing"}
Pace: ${opts.pace || "balanced"}
Start: ${opts.startDate}
End: ${opts.endDate}

Available POIs in area (pick from these for known activities; you may also add generic activities):
${poiSummary}

Return ONLY valid JSON matching this TypeScript shape, no prose, no markdown fences:
{
  "days": [
    {
      "day": number,
      "date": "YYYY-MM-DD",
      "theme": string,
      "activities": [
        {
          "time": "HH:MM",
          "title": string,
          "description": string,
          "category": "restaurant"|"attraction"|"transit"|"hotel"|"free",
          "poiId": string | null,
          "location": { "name": string, "lat": number, "lon": number } | null,
          "durationMin": number,
          "estimatedCost": { "amount": number, "currency": "${opts.currency}" }
        }
      ],
      "estimatedDailyCost": number,
      "notes": string
    }
  ]
}`;

  const model = gemini.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Itinerary model returned no JSON");
  let parsed: { days: ItineraryDay[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { days: ItineraryDay[] };
  } catch {
    throw new Error("Itinerary model returned malformed JSON");
  }
  if (!Array.isArray(parsed.days)) throw new Error("Itinerary model returned no days");

  // 4. Backfill POI coords from id if model omitted
  const poiIndex = new Map(pois.map((p) => [p.id, p]));
  for (const day of parsed.days) {
    for (const act of (day.activities || [])) {
      if (act.poiId && !act.location) {
        const p = poiIndex.get(act.poiId);
        if (p) act.location = { name: p.name, lat: p.lat, lon: p.lon };
      }
    }
  }

  const totalCost = parsed.days.reduce((s, d) => s + (d.estimatedDailyCost || 0), 0);

  return {
    destination: opts.destination,
    countryCode: geo.countryCode,
    centerLat: geo.lat,
    centerLon: geo.lon,
    startDate: opts.startDate,
    endDate: opts.endDate,
    travelers: opts.travelers,
    budget: { tier: opts.budgetTier, currency: opts.currency },
    interests: opts.interests,
    days: parsed.days,
    totalEstimatedCost: totalCost,
    currency: opts.currency,
    generatedAt: new Date().toISOString(),
  };
}

// Packing list generator using weather + activities.
export async function generatePackingList(
  gemini: GoogleGenerativeAI,
  destination: string,
  startDate: string,
  endDate: string,
  weatherSummary: string,
  activities: string[]
): Promise<{ category: string; items: string[] }[]> {
  const model = gemini.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: { responseMimeType: "application/json" },
  });
  const prompt = `Generate a packing list for ${destination} from ${startDate} to ${endDate}.
Weather: ${weatherSummary}
Activities: ${activities.join(", ")}

Return ONLY JSON array: [{"category":"...", "items":["..."]}]`;
  const res = await model.generateContent(prompt);
  const m = res.response.text().match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
