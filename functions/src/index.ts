// Firebase Functions entry. All server-side API calls live here.
// Frontend wiring is deferred — these onCall functions are the contract.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { defineString, defineSecret } from "firebase-functions/params";

import { searchDuffelFlights, createDuffelOrder } from "./lib/duffel";
import { searchAmadeusFlights, searchAmadeusHotels, searchAmadeusCars } from "./lib/amadeus";
import {
  searchTravelpayoutsFlights, searchTravelpayoutsHotels, buildHotellookAffiliateUrl,
} from "./lib/travelpayouts";
import { searchMakcorpsHotels } from "./lib/makcorps";
import { searchGeoapifyPlaces, geoapifyGeocode } from "./lib/geoapify";
import { searchOpenTripMap, getOpenTripMapDetails } from "./lib/opentripmap";
import { navitiaJourney } from "./lib/navitia";
import { transitousPlan } from "./lib/transitous";
import {
  openMeteoForecast, openMeteoClimatology, aqicnByGeo, fxRate, publicHolidays,
  countryFacts, visaRequirement, carbonFlight, wikivoyageSummary, openMeteoTimezone,
} from "./lib/intel";
import { getCountryStatic } from "./lib/countryStatic";
import { getAiraloPackages, createAiraloOrder, buildAiraloAffiliateUrl } from "./lib/airalo";
import { generateItinerary, generatePackingList } from "./lib/itinerary";
import { listTravelMessages, getGmailMessage, parseBookingEmail } from "./lib/emailParser";
import { computeBalances, minimalSettlements } from "./lib/groupTrips";
import { evaluatePriceCheck, buildAlertPayload, type PriceWatch } from "./lib/priceWatch";

admin.initializeApp();

// ── Params ──────────────────────────────────────────────────────────────────
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const mapsApiKey = defineString("MAPS_API_KEY", { default: "" });
const duffelToken = defineSecret("DUFFEL_API_TOKEN");
const amadeusId = defineString("AMADEUS_CLIENT_ID", { default: "" });
const amadeusSecret = defineSecret("AMADEUS_CLIENT_SECRET");
const tpToken = defineSecret("TRAVELPAYOUTS_API_TOKEN");
const tpMarker = defineString("TRAVELPAYOUTS_MARKER", { default: "" });
const makcorpsKey = defineSecret("MAKCORPS_API_KEY");
const geoapifyKey = defineSecret("GEOAPIFY_API_KEY");
const opentripmapKey = defineSecret("OPENTRIPMAP_API_KEY");
const navitiaKey = defineSecret("NAVITIA_API_KEY");
const aqicnToken = defineSecret("AQICN_API_TOKEN");
const visadbKey = defineSecret("VISADB_API_KEY");
const climatiqKey = defineSecret("CLIMATIQ_API_KEY");
const airaloId = defineString("AIRALO_CLIENT_ID", { default: "" });
const airaloSecret = defineSecret("AIRALO_CLIENT_SECRET");
const airaloRef = defineString("AIRALO_REF_CODE", { default: "" });
const youtubeKey = defineSecret("YOUTUBE_API_KEY");

function gemini(): GoogleGenerativeAI { return new GoogleGenerativeAI(geminiApiKey.value()); }
function requireAuth(req: { auth?: { uid?: string } }): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required");
  return req.auth.uid;
}

// ────────────────────────────────────────────────────────────────────────────
// FLIGHTS — Duffel + Amadeus + Travelpayouts in parallel, normalized
// ────────────────────────────────────────────────────────────────────────────
export const searchFlights = onCall(
  { secrets: [duffelToken, amadeusSecret, tpToken] },
  async (req) => {
    requireAuth(req);
    const { from, to, date, passengers = 1, cabinClass = "economy" } = req.data;
    if (!from || !to || !date) throw new HttpsError("invalid-argument", "from, to, date required");

    const tasks: Array<Promise<unknown[]>> = [];

    if (duffelToken.value()) {
      tasks.push(
        searchDuffelFlights(duffelToken.value(), from, to, date, passengers, cabinClass)
          .then((offers) => offers.map((o) => ({
            id: `duffel-${o.id}`,
            offerId: o.id,
            segments: o.slices[0]?.segments.map((s) => ({
              from: s.origin.iata_code,
              to: s.destination.iata_code,
              airline: s.marketing_carrier.name,
              flightNumber: s.marketing_carrier_flight_number,
              departure: s.departing_at,
              arrival: s.arriving_at,
              duration: s.duration,
            })) || [],
            totalPrice: Number(o.total_amount),
            currency: o.total_currency,
            totalDuration: o.slices[0]?.duration || "",
            layovers: (o.slices[0]?.segments.length || 1) - 1,
            source: "duffel",
          })))
          .catch((e) => { logger.error("duffel", e); return []; })
      );
    }

    if (amadeusId.value() && amadeusSecret.value()) {
      tasks.push(
        searchAmadeusFlights(amadeusId.value(), amadeusSecret.value(), from, to, date, passengers)
          .then((offers) => offers.map((o) => ({
            id: `amadeus-${o.id}`,
            offerId: o.id,
            segments: o.itineraries[0]?.segments.map((s) => ({
              from: s.departure.iataCode,
              to: s.arrival.iataCode,
              airline: s.carrierCode,
              flightNumber: s.number,
              departure: s.departure.at,
              arrival: s.arrival.at,
              duration: s.duration,
            })) || [],
            totalPrice: Number(o.price.total),
            currency: o.price.currency,
            totalDuration: o.itineraries[0]?.duration || "",
            layovers: (o.itineraries[0]?.segments.length || 1) - 1,
            source: "amadeus",
          })))
          .catch((e) => { logger.error("amadeus", e); return []; })
      );
    }

    if (tpToken.value() && tpMarker.value()) {
      tasks.push(
        searchTravelpayoutsFlights(tpToken.value(), tpMarker.value(), from, to, date)
          .then((flights) => flights.map((f) => ({
            id: `tp-${f.origin}-${f.destination}-${f.departure_at}`,
            segments: [{
              from: f.origin, to: f.destination, airline: f.airline,
              flightNumber: f.flight_number, departure: f.departure_at,
              arrival: f.departure_at, duration: String(f.duration),
            }],
            totalPrice: f.price,
            currency: "USD",
            totalDuration: `${f.duration}m`,
            layovers: 0,
            source: "travelpayouts",
            bookingUrl: f.link,
          })))
          .catch((e) => { logger.error("travelpayouts", e); return []; })
      );
    }

    const results = (await Promise.all(tasks)).flat();
    return { results: results.sort((a, b) => (a as { totalPrice: number }).totalPrice - (b as { totalPrice: number }).totalPrice) };
  }
);

export const createFlightOrder = onCall(
  { secrets: [duffelToken] },
  async (req) => {
    requireAuth(req);
    const { offerId, passengers } = req.data;
    if (!duffelToken.value()) throw new HttpsError("failed-precondition", "Duffel not configured");
    const result = await createDuffelOrder(duffelToken.value(), offerId, passengers);
    return {
      bookingRef: result.data.booking_reference,
      status: "confirmed",
      orderId: result.data.id,
    };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// HOTELS — Amadeus + Travelpayouts cache + Makcorps compare
// ────────────────────────────────────────────────────────────────────────────
export const searchHotels = onCall(
  { secrets: [amadeusSecret, makcorpsKey] },
  async (req) => {
    requireAuth(req);
    const { location, checkIn, checkOut, guests = 2, cityCode } = req.data;
    if (!checkIn || !checkOut) throw new HttpsError("invalid-argument", "checkIn/checkOut required");

    const results: unknown[] = [];

    // Amadeus (needs cityCode like NYC; falls through if missing)
    if (cityCode && amadeusId.value() && amadeusSecret.value()) {
      try {
        const offers = await searchAmadeusHotels(amadeusId.value(), amadeusSecret.value(), cityCode, checkIn, checkOut, guests);
        for (const o of offers) {
          const cheapest = o.offers?.[0];
          if (!cheapest) continue;
          results.push({
            id: `amadeus-${o.hotel.hotelId}`,
            name: o.hotel.name,
            location: `${o.hotel.latitude},${o.hotel.longitude}`,
            price: Number(cheapest.price.total),
            currency: cheapest.price.currency,
            rating: 0,
            reviews: 0,
            amenities: [],
            cancellationPolicy: cheapest.policies?.cancellation?.description?.text || "",
            source: "amadeus",
            url: "",
          });
        }
      } catch (e) { logger.error("amadeus hotels", e); }
    }

    // Travelpayouts (Hotellook cache)
    if (tpMarker.value() && location) {
      try {
        const hotels = await searchTravelpayoutsHotels(tpMarker.value(), location, checkIn, checkOut, guests);
        for (const h of hotels) {
          results.push({
            id: `tp-${h.hotelId}`,
            name: h.hotelName,
            location: h.location?.name || location,
            price: h.priceFrom,
            currency: "USD",
            rating: h.stars,
            reviews: 0,
            amenities: [],
            cancellationPolicy: "",
            source: "travelpayouts",
            url: buildHotellookAffiliateUrl(h.hotelId, checkIn, checkOut, tpMarker.value(), guests),
          });
        }
      } catch (e) { logger.error("tp hotels", e); }
    }

    // Makcorps (price compare)
    if (makcorpsKey.value() && location) {
      try {
        const prices = await searchMakcorpsHotels(makcorpsKey.value(), location, checkIn, checkOut, guests);
        for (const p of prices) {
          results.push({
            id: `makcorps-${p.hotelName}-${p.vendor}`,
            name: p.hotelName,
            location,
            price: p.price,
            currency: p.currency,
            rating: 0,
            reviews: 0,
            amenities: [],
            cancellationPolicy: "",
            source: "makcorps",
            url: p.url || "",
          });
        }
      } catch (e) { logger.error("makcorps", e); }
    }

    return { results };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// EXPERIENCES — uses Geoapify/OpenTripMap to surface POIs as bookable items
// ────────────────────────────────────────────────────────────────────────────
export const searchExperiences = onCall(
  { secrets: [geoapifyKey, opentripmapKey] },
  async (req) => {
    requireAuth(req);
    const { location } = req.data;
    if (!location) throw new HttpsError("invalid-argument", "location required");

    const results: unknown[] = [];
    if (geoapifyKey.value()) {
      const geo = await geoapifyGeocode(geoapifyKey.value(), location);
      if (geo) {
        const pois = await searchGeoapifyPlaces(
          geoapifyKey.value(),
          ["tourism.attraction", "entertainment.museum", "entertainment.activity_park"],
          geo.lat, geo.lon, 10000, 40
        );
        results.push(...pois.map((p) => ({
          id: `geoapify-${p.id}`,
          name: p.name,
          location: p.address,
          price: 0,
          currency: "USD",
          duration: "",
          rating: p.rating || 0,
          category: p.category,
          source: "geoapify",
          url: p.website || "",
        })));
      }
    }
    if (opentripmapKey.value()) {
      try {
        // OpenTripMap needs coords; reuse geoapify geocode if available
        const geo = geoapifyKey.value()
          ? await geoapifyGeocode(geoapifyKey.value(), location)
          : null;
        if (geo) {
          const otm = await searchOpenTripMap(opentripmapKey.value(), geo.lat, geo.lon);
          results.push(...otm.map((p) => ({
            id: `otm-${p.xid}`,
            name: p.name,
            location: "",
            price: 0,
            currency: "USD",
            duration: "",
            rating: p.rate,
            category: p.kinds.split(",")[0],
            source: "opentripmap",
            url: `https://opentripmap.com/en/card/${p.xid}`,
          })));
        }
      } catch (e) { logger.error("opentripmap", e); }
    }
    return { results };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// TRANSIT — Navitia + Transitous (multi-modal)
// ────────────────────────────────────────────────────────────────────────────
export const searchTransit = onCall(
  { secrets: [navitiaKey] },
  async (req) => {
    requireAuth(req);
    const { fromLat, fromLon, toLat, toLon, departAt } = req.data;
    if (
      typeof fromLat !== "number" || typeof fromLon !== "number" ||
      typeof toLat !== "number" || typeof toLon !== "number"
    ) throw new HttpsError("invalid-argument", "coords required");

    const results: unknown[] = [];

    if (navitiaKey.value()) {
      try {
        const journeys = await navitiaJourney(navitiaKey.value(), fromLat, fromLon, toLat, toLon, departAt);
        results.push(...journeys.map((j) => ({
          totalDuration: j.duration,
          co2Kg: j.co2_emission?.value,
          totalPrice: j.fare?.total ? { amount: Number(j.fare.total.value), currency: j.fare.total.currency } : undefined,
          segments: j.sections.map((s) => ({
            mode: s.mode || s.display_informations?.commercial_mode || s.type,
            operator: s.display_informations?.network || "",
            departure: s.departure_date_time,
            arrival: s.arrival_date_time,
            duration: s.duration,
            source: "navitia",
            from: s.from ? { lat: s.from.coord.lat, lon: s.from.coord.lon, name: s.from.name } : undefined,
            to: s.to ? { lat: s.to.coord.lat, lon: s.to.coord.lon, name: s.to.name } : undefined,
          })),
        })));
      } catch (e) { logger.error("navitia", e); }
    }

    try {
      const it = await transitousPlan(fromLat, fromLon, toLat, toLon, departAt);
      results.push(...it.map((i) => ({
        totalDuration: i.duration,
        segments: i.legs.map((l) => ({
          mode: l.mode,
          operator: l.agencyName || l.routeShortName || "",
          departure: l.startTime,
          arrival: l.endTime,
          duration: l.duration,
          source: "transitous",
          from: { lat: l.from.lat, lon: l.from.lon, name: l.from.name },
          to: { lat: l.to.lat, lon: l.to.lon, name: l.to.name },
        })),
      })));
    } catch (e) { logger.error("transitous", e); }

    return { results };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// TRAVEL INTEL PANEL — one call returns everything about a destination
// ────────────────────────────────────────────────────────────────────────────
export const getDestinationIntel = onCall(
  { secrets: [geoapifyKey, aqicnToken, visadbKey, climatiqKey] },
  async (req) => {
    requireAuth(req);
    const { destination, passportCC, fromIata } = req.data;
    if (!destination) throw new HttpsError("invalid-argument", "destination required");

    let geo: { lat: number; lon: number; formatted: string; country: string; countryCode: string } | null = null;
    if (geoapifyKey.value()) geo = await geoapifyGeocode(geoapifyKey.value(), destination);

    const cc = (geo?.countryCode || "").toUpperCase();
    const year = new Date().getFullYear();

    const [weather, climate, air, holidays, country, wiki, visa, carbon, timezone] = await Promise.all([
      geo ? openMeteoForecast(geo.lat, geo.lon, 7).catch(() => []) : Promise.resolve([]),
      geo ? openMeteoClimatology(geo.lat, geo.lon).catch(() => []) : Promise.resolve([]),
      geo && aqicnToken.value() ? aqicnByGeo(aqicnToken.value(), geo.lat, geo.lon).catch(() => null) : Promise.resolve(null),
      cc ? publicHolidays(cc, year).catch(() => []) : Promise.resolve([]),
      cc ? countryFacts(cc).catch(() => null) : Promise.resolve(null),
      wikivoyageSummary(destination).catch(() => null),
      passportCC && cc && visadbKey.value()
        ? visaRequirement(visadbKey.value(), passportCC, cc).catch(() => null)
        : Promise.resolve(null),
      fromIata && geo && climatiqKey.value()
        ? carbonFlight(climatiqKey.value(), fromIata, destination.slice(0, 3).toUpperCase()).catch(() => null)
        : Promise.resolve(null),
      geo ? openMeteoTimezone(geo.lat, geo.lon).catch(() => null) : Promise.resolve(null),
    ]);

    return {
      destination,
      geo,
      weather,
      climate,
      airQuality: air,
      publicHolidays: holidays,
      countryFacts: country,
      staticFacts: cc ? getCountryStatic(cc) : {},
      wikivoyage: wiki,
      visa,
      carbon,
      timezone,
    };
  }
);

export const convertCurrency = onCall(async (req) => {
  const { from, to, amount = 1 } = req.data;
  if (!from || !to) throw new HttpsError("invalid-argument", "from/to required");
  const r = await fxRate(from, to, amount);
  if (!r) throw new HttpsError("internal", "FX fetch failed");
  return r;
});

// ────────────────────────────────────────────────────────────────────────────
// ITINERARY GENERATOR
// ────────────────────────────────────────────────────────────────────────────
export const generateAIItinerary = onCall(
  { secrets: [geminiApiKey, geoapifyKey] },
  async (req) => {
    requireAuth(req);
    const it = await generateItinerary(gemini(), geoapifyKey.value(), req.data);
    // Persist to Firestore for the user
    const uid = req.auth!.uid;
    const id = admin.firestore().collection(`users/${uid}/itineraries`).doc().id;
    await admin.firestore().doc(`users/${uid}/itineraries/${id}`).set({ id, ...it });
    return { id, ...it };
  }
);

export const generateAIPackingList = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    requireAuth(req);
    const { destination, startDate, endDate, weatherSummary, activities } = req.data;
    return { list: await generatePackingList(gemini(), destination, startDate, endDate, weatherSummary, activities) };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// EMAIL PARSER — caller supplies Gmail access token from client OAuth flow
// ────────────────────────────────────────────────────────────────────────────
export const importGmailBookings = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    const uid = requireAuth(req);
    const { accessToken, query } = req.data;
    if (!accessToken) throw new HttpsError("invalid-argument", "accessToken required");

    // Verify the Gmail token actually belongs to the signed-in Firebase user.
    // Otherwise anyone holding a victim's gmail.readonly token could import that
    // victim's booking emails into their OWN account.
    try {
      const info = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!info.ok) throw new HttpsError("permission-denied", "Gmail token invalid");
      const tokenData = (await info.json()) as { email?: string; email_verified?: string };
      const fbUser = await admin.auth().getUser(uid);
      const fbEmail = (fbUser.email || "").toLowerCase();
      const tokenEmail = (tokenData.email || "").toLowerCase();
      if (!tokenEmail || !fbEmail || tokenEmail !== fbEmail) {
        throw new HttpsError("permission-denied", "Gmail account does not match your signed-in account");
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("permission-denied", "Could not verify Gmail token owner");
    }

    const msgs = await listTravelMessages(accessToken, query);
    const parsed: unknown[] = [];
    for (const m of msgs.slice(0, 25)) {
      try {
        const full = await getGmailMessage(accessToken, m.id);
        const booking = await parseBookingEmail(gemini(), full.subject, full.from, full.bodyText);
        if (booking) {
          const docId = admin.firestore().collection(`users/${uid}/bookings`).doc().id;
          await admin.firestore().doc(`users/${uid}/bookings/${docId}`).set({
            id: docId, source: "gmail", gmailMessageId: m.id, ...booking,
            importedAt: new Date().toISOString(),
          });
          parsed.push({ id: docId, ...booking });
        }
      } catch (e) { logger.error("parse email", m.id, e); }
    }
    return { imported: parsed.length, items: parsed };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// GROUP TRIPS
// ────────────────────────────────────────────────────────────────────────────
export const createGroupTrip = onCall(async (req) => {
  const uid = requireAuth(req);
  const { name, destination, startDate, endDate, baseCurrency = "USD" } = req.data;
  const id = admin.firestore().collection("groupTrips").doc().id;
  const userRec = await admin.auth().getUser(uid);
  const trip = {
    id, name, destination, startDate, endDate, baseCurrency,
    ownerUid: uid,
    memberUids: [uid],
    members: [{
      uid, displayName: userRec.displayName || "", email: userRec.email || "",
      role: "owner", joinedAt: new Date().toISOString(),
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await admin.firestore().doc(`groupTrips/${id}`).set(trip);
  return trip;
});

export const inviteToGroupTrip = onCall(async (req) => {
  const uid = requireAuth(req);
  const { tripId, email, role = "editor" } = req.data;
  const ref = admin.firestore().doc(`groupTrips/${tripId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Trip not found");
  if (snap.data()?.ownerUid !== uid) throw new HttpsError("permission-denied", "Only owner can invite");
  let invitedUid = "";
  try { invitedUid = (await admin.auth().getUserByEmail(email)).uid; } catch { /* not signed up yet */ }
  const inviteId = admin.firestore().collection(`groupTrips/${tripId}/invites`).doc().id;
  await admin.firestore().doc(`groupTrips/${tripId}/invites/${inviteId}`).set({
    id: inviteId, email, invitedUid, role, status: "pending",
    createdAt: new Date().toISOString(),
  });
  return { inviteId };
});

export const addGroupExpense = onCall(async (req) => {
  const uid = requireAuth(req);
  const { tripId, description, amount, currency = "USD", splitMethod = "equal", splits, category, date } = req.data;
  if (!tripId || !description || !amount) throw new HttpsError("invalid-argument", "tripId, description, amount required");
  const tripSnap = await admin.firestore().doc(`groupTrips/${tripId}`).get();
  if (!tripSnap.exists) throw new HttpsError("not-found", "Trip not found");
  const trip = tripSnap.data();
  if (!trip?.memberUids?.includes(uid)) throw new HttpsError("permission-denied", "Not a member");

  let amountBaseCurrency = amount;
  if (currency !== trip.baseCurrency) {
    try {
      const r = await fxRate(currency, trip.baseCurrency, amount);
      if (r) amountBaseCurrency = r.converted;
    } catch (e) { logger.warn("fx convert", e); }
  }

  const memberUids: string[] = trip.memberUids;
  const finalSplits = splits && splits.length
    ? splits
    : memberUids.map((u) => ({ uid: u, share: 1 }));

  const id = admin.firestore().collection(`groupTrips/${tripId}/expenses`).doc().id;
  const expense = {
    id, tripId, paidBy: uid, description,
    amount: Number(amount), currency, amountBaseCurrency,
    splitMethod, splits: finalSplits,
    category: category || "other",
    date: date || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  await admin.firestore().doc(`groupTrips/${tripId}/expenses/${id}`).set(expense);
  return expense;
});

export const settleUpGroupTrip = onCall(async (req) => {
  requireAuth(req);
  const { tripId } = req.data;
  const tripSnap = await admin.firestore().doc(`groupTrips/${tripId}`).get();
  if (!tripSnap.exists) throw new HttpsError("not-found", "Trip not found");
  const members = tripSnap.data()?.members || [];
  const expSnap = await admin.firestore().collection(`groupTrips/${tripId}/expenses`).get();
  const expenses = expSnap.docs.map((d) => d.data() as Parameters<typeof computeBalances>[1][0]);
  const balances = computeBalances(members, expenses);
  const settlements = minimalSettlements(balances);
  return { balances, settlements };
});

// ────────────────────────────────────────────────────────────────────────────
// AIRALO eSIM
// ────────────────────────────────────────────────────────────────────────────
export const listEsimPackages = onCall(
  { secrets: [airaloSecret] },
  async (req) => {
    requireAuth(req);
    const { countryCode } = req.data;
    if (!countryCode) throw new HttpsError("invalid-argument", "countryCode required");
    if (airaloId.value() && airaloSecret.value()) {
      try {
        const pkgs = await getAiraloPackages(airaloId.value(), airaloSecret.value(), countryCode);
        return { packages: pkgs, affiliateUrl: airaloRef.value() ? buildAiraloAffiliateUrl(countryCode, airaloRef.value()) : null };
      } catch (e) { logger.error("airalo", e); }
    }
    return { packages: [], affiliateUrl: airaloRef.value() ? buildAiraloAffiliateUrl(countryCode, airaloRef.value()) : null };
  }
);

export const orderEsim = onCall(
  { secrets: [airaloSecret] },
  async (req) => {
    requireAuth(req);
    const { packageId, quantity = 1, description = "" } = req.data;
    return await createAiraloOrder(airaloId.value(), airaloSecret.value(), packageId, quantity, description);
  }
);

// ────────────────────────────────────────────────────────────────────────────
// CARS
// ────────────────────────────────────────────────────────────────────────────
export const searchCars = onCall(
  { secrets: [amadeusSecret] },
  async (req) => {
    requireAuth(req);
    const { pickupCode, pickupDate, dropoffDate } = req.data;
    if (!amadeusId.value() || !amadeusSecret.value()) return { results: [] };
    const data = await searchAmadeusCars(amadeusId.value(), amadeusSecret.value(), pickupCode, pickupDate, dropoffDate);
    return { results: data };
  }
);

// ────────────────────────────────────────────────────────────────────────────
// PRICE WATCHLIST
// ────────────────────────────────────────────────────────────────────────────
export const createPriceWatch = onCall(async (req) => {
  const uid = requireAuth(req);
  const id = admin.firestore().collection(`users/${uid}/priceWatches`).doc().id;
  const watch: PriceWatch = {
    id, uid, active: true, history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currency: req.data.currency || "USD",
    ...req.data,
  };
  await admin.firestore().doc(`users/${uid}/priceWatches/${id}`).set(watch);
  return watch;
});

export const deletePriceWatch = onCall(async (req) => {
  const uid = requireAuth(req);
  await admin.firestore().doc(`users/${uid}/priceWatches/${req.data.id}`).delete();
  return { ok: true };
});

// Scheduled poller — runs every hour
export const pollPriceWatches = onSchedule(
  {
    schedule: "every 60 minutes",
    secrets: [duffelToken, amadeusSecret, tpToken],
  },
  async () => {
    const db = admin.firestore();
    const userDocs = await db.collectionGroup("priceWatches").where("active", "==", true).get();
    logger.info(`Polling ${userDocs.size} price watches`);

    for (const docSnap of userDocs.docs) {
      const watch = docSnap.data() as PriceWatch;
      try {
        let newPrice = Infinity;
        let source = "";
        if (watch.kind === "flight" && watch.from && watch.to && watch.date) {
          if (duffelToken.value()) {
            const offers = await searchDuffelFlights(
              duffelToken.value(), watch.from, watch.to, watch.date,
              watch.passengers || 1, watch.cabinClass || "economy"
            );
            const min = offers.reduce((m, o) => Math.min(m, Number(o.total_amount)), Infinity);
            if (min < newPrice) { newPrice = min; source = "duffel"; }
          }
          if (amadeusId.value() && amadeusSecret.value()) {
            const offers = await searchAmadeusFlights(
              amadeusId.value(), amadeusSecret.value(), watch.from, watch.to, watch.date, watch.passengers || 1
            );
            const min = offers.reduce((m, o) => Math.min(m, Number(o.price.total)), Infinity);
            if (min < newPrice) { newPrice = min; source = "amadeus"; }
          }
        } else if (watch.kind === "hotel" && watch.location && watch.checkIn && watch.checkOut) {
          if (tpMarker.value()) {
            const hotels = await searchTravelpayoutsHotels(
              tpMarker.value(), watch.location, watch.checkIn, watch.checkOut, watch.guests || 2
            );
            const min = hotels.reduce((m, h) => Math.min(m, h.priceFrom), Infinity);
            if (min < newPrice) { newPrice = min; source = "travelpayouts"; }
          }
        }

        if (!isFinite(newPrice)) continue;

        const result = evaluatePriceCheck(watch, newPrice, source);
        const update: Partial<PriceWatch> = {
          lastPrice: newPrice,
          lowestPrice: result.isNewLow ? newPrice : watch.lowestPrice,
          history: [...(watch.history || []).slice(-100), { at: new Date().toISOString(), price: newPrice, source }],
          updatedAt: new Date().toISOString(),
        };
        await docSnap.ref.update(update);

        if ((result.triggered || result.isNewLow) && watch.fcmToken) {
          const payload = buildAlertPayload({ ...watch, ...update } as PriceWatch, result);
          await admin.messaging().send({
            token: watch.fcmToken,
            notification: { title: payload.title, body: payload.body },
            data: payload.data,
          });
        }
      } catch (e) {
        logger.error(`watch ${watch.id} failed`, e);
      }
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// LEGACY — preserved for existing UI
// ────────────────────────────────────────────────────────────────────────────
export const getTravelAssistantResponse = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    requireAuth(req);
    const { locationQuery } = req.data;
    const model = gemini().getGenerativeModel({ model: "gemini-1.5-pro" });
    const linksPrompt = `Provide official government website links for visas and tourist information for ${locationQuery}. Format as HTML <a> tags.`;
    const linksResult = await model.generateContent(linksPrompt);
    const essentialLinks = linksResult.response.text();

    const geo = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationQuery)}&key=${mapsApiKey.value()}`);
    const geoData = await geo.json();
    if (geoData.status !== "OK" || !geoData.results.length) throw new HttpsError("not-found", "Could not find location");
    const location = geoData.results[0].geometry.location;

    let aqi = "";
    try {
      const airRes = await fetch(`https://airquality.googleapis.com/v1/currentConditions:lookup?key=${mapsApiKey.value()}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location }),
      });
      const airJson = await airRes.json();
      aqi = `${airJson.indexes[0].aqiDisplay} (${airJson.indexes[0].category})`;
    } catch (e) { logger.warn("aqi failed", e); }

    return { essentialLinks, location, aqi };
  }
);

export const scrapeTravelIntelligence = onCall(
  { secrets: [geminiApiKey, youtubeKey] },
  async (req) => {
    requireAuth(req);
    const { location, sources } = req.data;
    const intelligence: Record<string, unknown> = { location, reddit: [], youtube: [], scrapedAt: new Date().toISOString() };

    if (!sources || sources.includes("reddit")) {
      try {
        const r = await fetch(`https://www.reddit.com/r/travel/search.json?q=${encodeURIComponent(location)}&limit=10&sort=relevance`, { headers: { "User-Agent": "TravelApp/1.0" } });
        const j = await r.json();
        intelligence.reddit = (j.data?.children || []).map((p: { data: Record<string, unknown> }) => ({
          title: p.data.title, content: p.data.selftext, url: `https://reddit.com${p.data.permalink}`,
          score: p.data.score, subreddit: p.data.subreddit,
        }));
      } catch (e) { logger.error("reddit", e); }
    }

    if ((!sources || sources.includes("youtube")) && youtubeKey.value()) {
      try {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(`travel ${location} tips`)}&type=video&maxResults=10&key=${youtubeKey.value()}`);
        const j = await r.json();
        intelligence.youtube = (j.items || []).map((it: { id: { videoId: string }; snippet: Record<string, unknown> }) => ({
          title: it.snippet.title, description: it.snippet.description,
          url: `https://youtube.com/watch?v=${it.id.videoId}`,
          channel: it.snippet.channelTitle,
        }));
      } catch (e) { logger.error("youtube", e); }
    }

    const model = gemini().getGenerativeModel({ model: "gemini-1.5-flash" });
    const synthesisPrompt = `Synthesize travel info for ${location} from Reddit + YouTube:
${JSON.stringify((intelligence.reddit as unknown[]).slice(0, 5))}
${JSON.stringify((intelligence.youtube as unknown[]).slice(0, 5))}

Return JSON: { scams, transportation, simCards, currency, culture, safety }`;
    try {
      const s = await model.generateContent(synthesisPrompt);
      const m = s.response.text().match(/\{[\s\S]*\}/);
      if (m) intelligence.synthesized = JSON.parse(m[0]);
    } catch (e) { logger.error("synth", e); }

    return intelligence;
  }
);

// ────────────────────────────────────────────────────────────────────────────
// IDENTIFY PLACE FROM IMAGE (Gemini Vision)
// ────────────────────────────────────────────────────────────────────────────
export const identifyPlaceFromImage = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    requireAuth(req);
    const { imageBase64, mimeType, hint } = req.data;
    if (!imageBase64) throw new HttpsError("invalid-argument", "imageBase64 required");
    const model = gemini().getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `Identify this travel location. ${hint ? `Hint from user: "${hint}".` : ""}
Return ONLY JSON, no markdown:
{
  "name": "common name (e.g. 'Reichstag, Berlin')",
  "shortMatch": "what is visible (e.g. 'Glass cupola, Reichstag building')",
  "country": "country name",
  "countryCode": "ISO 3166-1 alpha-2",
  "region": "continent or region",
  "city": "city",
  "district": "neighborhood if known",
  "lat": number,
  "lon": number,
  "confidence": number 0-100,
  "description": "2-sentence about why this place matters",
  "iataAirport": "nearest major IATA code or null"
}
If you cannot recognise it confidently, set confidence < 40 and best guess country.`;
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType: mimeType || "image/jpeg" } },
    ]);
    const text = result.response.text();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new HttpsError("internal", "No JSON in vision response");
    try {
      return JSON.parse(m[0]);
    } catch {
      throw new HttpsError("internal", "Vision JSON parse failed");
    }
  }
);

// Identify from text-only description (no image)
export const identifyPlaceFromText = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    requireAuth(req);
    const { description } = req.data;
    if (!description) throw new HttpsError("invalid-argument", "description required");
    const model = gemini().getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `User described a place: "${description}".
Return ONLY JSON matching the schema below. If multiple matches plausible, pick the most likely:
{ "name": string, "shortMatch": string, "country": string, "countryCode": string,
  "region": string, "city": string, "district": string|null,
  "lat": number, "lon": number, "confidence": number, "description": string,
  "iataAirport": string|null }`;
    const r = await model.generateContent(prompt);
    const m = r.response.text().match(/\{[\s\S]*\}/);
    if (!m) throw new HttpsError("internal", "No JSON");
    return JSON.parse(m[0]);
  }
);

// ────────────────────────────────────────────────────────────────────────────
// ASSISTANT CHAT
// ────────────────────────────────────────────────────────────────────────────
export const chatWithAssistant = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    requireAuth(req);
    const { history, message, context } = req.data as {
      history?: Array<{ role: "user" | "model"; text: string }>;
      message: string;
      context?: { destination?: string; lat?: number; lon?: number; countryCode?: string };
    };
    if (!message) throw new HttpsError("invalid-argument", "message required");
    const model = gemini().getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: `You are Atlas, a calm, concrete AI travel companion.
Style: direct, no fluff, no emoji, never apologise. Use short sentences and bullet lists.
You can: identify places, compare flight/hotel prices, look up visas & entry rules, plan
day-by-day itineraries, suggest local transit, translate, surface scams to avoid.
If user asks for a booking, instruct them to use the Bookings tab or offer to start a trip.
${context?.destination ? `Current destination context: ${context.destination}` : ""}
${context?.countryCode ? `Country: ${context.countryCode}` : ""}
Keep replies under 120 words unless asked for detail.`,
    });
    const chat = model.startChat({
      history: (history || []).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    });
    const r = await chat.sendMessage(message);
    return { reply: r.response.text() };
  }
);

// Translate via Gemini
export const translatePhrase = onCall(
  { secrets: [geminiApiKey] },
  async (req) => {
    requireAuth(req);
    const { text, target, context } = req.data;
    if (!text || !target) throw new HttpsError("invalid-argument", "text and target required");
    const model = gemini().getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Translate "${text}" into ${target}.
${context ? `Context: ${context}.` : ""}
Return ONLY JSON:
{ "translation": string, "pronunciation": string, "literal": string, "formality": "polite"|"casual"|"neutral", "notes": string }`;
    const r = await model.generateContent(prompt);
    const m = r.response.text().match(/\{[\s\S]*\}/);
    if (!m) return { translation: r.response.text() };
    return JSON.parse(m[0]);
  }
);

// Get POI details (used by itinerary card hover)
export const getPoiDetails = onCall(
  { secrets: [opentripmapKey] },
  async (req) => {
    requireAuth(req);
    const { xid } = req.data;
    if (!opentripmapKey.value()) return { details: null };
    return { details: await getOpenTripMapDetails(opentripmapKey.value(), xid) };
  }
);
