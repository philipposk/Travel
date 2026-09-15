// Per-user daily call caps for callable functions that hit paid third-party
// APIs (Gemini, Duffel, Amadeus, Geoapify, ...). Without this, an authenticated
// abuser — or a runaway client-side retry loop — can call an expensive
// function an unbounded number of times per day with no cost backstop.
//
// One Firestore document per uid per day (`rateLimits/{uid}_{date}`) holds a
// map of per-function counts. Each call increments its own entry inside a
// single `runTransaction`, so concurrent requests can't race past the cap —
// the read-check-write happens atomically against the same document.
//
// Anonymous Firebase sessions (auto-created for the logged-out "Identify"
// flow) are capped well below signed-in users: anyone can create a fresh
// anonymous session for free, so a per-uid cap alone wouldn't stop an
// abuser from just minting a new uid per request.

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

export const DAILY_LIMITS: Record<string, { signedIn: number; anonymous: number }> = {
  // Gemini Vision / chat — most expensive per-call, capped tightest.
  identifyPlaceFromImage: { signedIn: 40, anonymous: 5 },
  identifyPlaceFromText: { signedIn: 40, anonymous: 5 },
  chatWithAssistant: { signedIn: 60, anonymous: 8 },
  generateAIItinerary: { signedIn: 10, anonymous: 1 },
  generateAIPackingList: { signedIn: 15, anonymous: 2 },
  translatePhrase: { signedIn: 80, anonymous: 10 },
  scrapeTravelIntelligence: { signedIn: 20, anonymous: 3 },
  getTravelAssistantResponse: { signedIn: 20, anonymous: 3 },
  // Booking search fan-outs (Duffel/Amadeus/Travelpayouts/Geoapify/OpenTripMap/Navitia).
  searchFlights: { signedIn: 40, anonymous: 5 },
  searchHotels: { signedIn: 40, anonymous: 5 },
  searchExperiences: { signedIn: 40, anonymous: 5 },
  searchTransit: { signedIn: 40, anonymous: 5 },
  searchCars: { signedIn: 30, anonymous: 4 },
  // Third-party intel fan-out (Geoapify/AQICN/VisaDB/Climatiq) — cached 6h
  // server-side already, but still metered as a backstop against cache misses.
  getDestinationIntel: { signedIn: 60, anonymous: 10 },
  getPoiDetails: { signedIn: 60, anonymous: 10 },
  listEsimPackages: { signedIn: 30, anonymous: 5 },
};

function todayKey(): string {
  // UTC calendar day. Resets at 00:00 UTC regardless of caller timezone —
  // simple and consistent, matching the FX/holiday date handling elsewhere.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically increments today's call count for `fnName` under `uid` and
 * throws `resource-exhausted` once the daily cap for that uid's tier
 * (signed-in vs anonymous) is hit. No-op for functions not present in
 * DAILY_LIMITS.
 */
export async function enforceDailyLimit(uid: string, isAnonymous: boolean, fnName: string): Promise<void> {
  const limits = DAILY_LIMITS[fnName];
  if (!limits) return;
  const cap = isAnonymous ? limits.anonymous : limits.signedIn;

  const ref = admin.firestore().doc(`rateLimits/${uid}_${todayKey()}`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const counts = (snap.exists ? (snap.data()?.counts as Record<string, number> | undefined) : undefined) || {};
    const current = counts[fnName] ?? 0;
    if (current >= cap) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily limit reached for this feature (${cap}/day for ${isAnonymous ? "guest" : "signed-in"} accounts). Try again tomorrow.`
      );
    }
    tx.set(ref, {
      uid,
      date: todayKey(),
      counts: { ...counts, [fnName]: current + 1 },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Optional Firestore TTL policy target (see intelCache) — safe to add a
      // TTL rule on this field in the console for auto-cleanup after a few days.
      expireAt: Date.now() + 3 * 24 * 3600 * 1000,
    }, { merge: true });
  });
}
