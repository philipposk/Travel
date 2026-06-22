// Email parser — TripIt-style.
// Gmail OAuth (web flow, client-side stores refresh token; server uses access token).
// Extracts booking confirmations and structures them with Gemini.
import { GoogleGenerativeAI } from "@google/generative-ai";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
}

export interface ParsedBooking {
  type: "flight" | "hotel" | "car" | "train" | "bus" | "ferry" | "event" | "tour" | "other";
  confirmationCode?: string;
  provider: string;
  // flight
  from?: { iata?: string; name?: string };
  to?: { iata?: string; name?: string };
  departureLocal?: string;       // ISO local
  arrivalLocal?: string;
  flightNumber?: string;
  airline?: string;
  passengerNames?: string[];
  // hotel
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  address?: string;
  // common
  totalCost?: { amount: number; currency: string };
  notes?: string;
  raw?: string;
}

// List travel-related messages in user's mailbox using Gmail search.
export async function listTravelMessages(accessToken: string, query = ""): Promise<GmailMessageMeta[]> {
  const q = (
    query ||
    "category:travel OR booking confirmation OR reservation OR itinerary OR e-ticket"
  );
  const url = new URL(`${GMAIL_API}/users/me/messages`);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "50");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail list ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { messages?: GmailMessageMeta[] };
  return j.messages || [];
}

export async function getGmailMessage(accessToken: string, id: string): Promise<{
  subject: string; from: string; date: string; bodyText: string;
}> {
  const res = await fetch(`${GMAIL_API}/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail get ${res.status}`);
  const j = await res.json();
  const headers: Array<{ name: string; value: string }> = j.payload?.headers || [];
  const h = (n: string) => headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value || "";
  const bodyText = extractPlainText(j.payload);
  return { subject: h("subject"), from: h("from"), date: h("date"), bodyText };
}

function extractPlainText(part: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  if (Array.isArray(part.parts)) {
    return (part.parts as Parameters<typeof extractPlainText>[0][]).map(extractPlainText).join("\n");
  }
  if (part.body?.data) {
    // fallback: HTML stripped
    const html = Buffer.from(part.body.data, "base64url").toString("utf8");
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

export async function parseBookingEmail(
  gemini: GoogleGenerativeAI,
  subject: string,
  from: string,
  bodyText: string
): Promise<ParsedBooking | null> {
  const truncated = bodyText.slice(0, 6000);
  const prompt = `Extract travel booking details from this email. Return ONLY JSON, no prose.

Subject: ${subject}
From: ${from}
Body: ${truncated}

JSON schema (fields you don't know → null):
{
  "type": "flight"|"hotel"|"car"|"train"|"bus"|"ferry"|"event"|"tour"|"other",
  "confirmationCode": string|null,
  "provider": string,
  "from": {"iata":string|null,"name":string|null}|null,
  "to": {"iata":string|null,"name":string|null}|null,
  "departureLocal": "YYYY-MM-DDTHH:mm"|null,
  "arrivalLocal": "YYYY-MM-DDTHH:mm"|null,
  "flightNumber": string|null,
  "airline": string|null,
  "passengerNames": string[]|null,
  "hotelName": string|null,
  "checkIn": "YYYY-MM-DD"|null,
  "checkOut": "YYYY-MM-DD"|null,
  "address": string|null,
  "totalCost": {"amount":number,"currency":string}|null,
  "notes": string|null
}

If not a travel booking, return: {"type":"other","provider":"","notes":"not a booking"}`;

  const model = gemini.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const m = result.response.text().match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as ParsedBooking;
    // Validate the shape before it flows into Firestore as a "booking" — guards
    // against malformed or prompt-injected output.
    const allowed = ["flight", "hotel", "car", "train", "bus", "ferry", "event", "tour", "other"];
    if (!parsed || typeof parsed !== "object" || !allowed.includes(parsed.type)) return null;
    if (parsed.type === "other" && !parsed.confirmationCode) return null;
    return parsed;
  } catch {
    return null;
  }
}
