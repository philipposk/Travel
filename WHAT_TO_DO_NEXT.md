# What's Left

## ✅ Done (backend, all phases)

- P0: Pruned dead enterprise stubs · added `.env.example` with realistic free-tier keys
- P1: Duffel + Amadeus + Travelpayouts flights · Amadeus + Travelpayouts + Makcorps hotels
- P1: Geoapify + OpenTripMap POIs · Navitia + Transitous transit
- P2: AI itinerary generator (Gemini + Geoapify, Firestore-persisted)
- P2: Gmail OAuth email parser → structured bookings
- P2: Group trips + Splitwise-style expense splitter (logic + minimal-settlement algorithm)
- P3: Price watchlist + scheduled hourly poller + FCM push alerts
- P3: AES-GCM client-encrypted document vault
- P3: Trip journal w/ photo + GPS · ICS calendar export · geofenced browser notifs
- P4: One-shot destination intel (weather, climate, air, holidays, country facts, visa, carbon, Wikivoyage, static plugs/tipping/water/emergency)
- P5: Airalo Partner eSIM + affiliate URL fallback · Travelpayouts affiliate flow

## 🟡 Pending — frontend (deferred per user request)

To be rebuilt later with Claude Design. Backend exposes:

### onCall endpoints (functions/src/index.ts)
- `searchFlights` `createFlightOrder` `searchHotels` `searchExperiences`
- `searchTransit` `searchCars`
- `getDestinationIntel` `convertCurrency` `getPoiDetails`
- `generateAIItinerary` `generateAIPackingList`
- `importGmailBookings`
- `createGroupTrip` `inviteToGroupTrip` `settleUpGroupTrip`
- `listEsimPackages` `orderEsim`
- `createPriceWatch` `deletePriceWatch`
- `getTravelAssistantResponse` `scrapeTravelIntelligence`

### Client services (src/services)
- `documentVault.ts` — client-side AES-GCM crypto, requires UI for passphrase + file picker
- `tripJournal.ts` — needs photo upload UI + map view
- `icsExport.ts` — needs export button hooked into itinerary view
- `geofence.ts` — needs lifecycle binding (start on trip-active, stop on trip-end)
- `realBookingAggregator.ts` / `transportAPIs.ts` — already callable

### Scheduled
- `pollPriceWatches` — every 60 min, FCM push on price drop. No UI needed; alerts deliver via push.

## 🔑 Pre-deploy checklist

1. **Firebase project** — create + enable Auth, Firestore, Functions, Storage, Messaging
2. **Set function params/secrets**:
   ```
   firebase functions:secrets:set GEMINI_API_KEY
   firebase functions:secrets:set DUFFEL_API_TOKEN
   firebase functions:secrets:set AMADEUS_CLIENT_SECRET
   firebase functions:secrets:set TRAVELPAYOUTS_API_TOKEN
   firebase functions:secrets:set MAKCORPS_API_KEY
   firebase functions:secrets:set GEOAPIFY_API_KEY
   firebase functions:secrets:set OPENTRIPMAP_API_KEY
   firebase functions:secrets:set NAVITIA_API_KEY
   firebase functions:secrets:set AQICN_API_TOKEN
   firebase functions:secrets:set VISADB_API_KEY
   firebase functions:secrets:set CLIMATIQ_API_KEY
   firebase functions:secrets:set AIRALO_CLIENT_SECRET
   firebase functions:secrets:set YOUTUBE_API_KEY
   ```
   And non-secret params via `firebase functions:config:set ...` or directly in Functions params.

3. **Apply for approvals** (free, takes days):
   - Duffel account (test mode works immediately)
   - Travelpayouts affiliate
   - Airalo Partner program (slowest; affiliate URL works without)
   - VisaDB API access
   - Climatiq account

4. **Free no-approval keys** (sign-up form only):
   - Gemini · Geoapify · OpenTripMap · Navitia · AQICN · Makcorps · Amadeus Self-Service · YouTube · Unsplash · Pexels · Ticketmaster

5. **Firestore security rules** — write per-user + group-trip rules before deploy. See `firestore.rules` (TODO).

6. **Deploy**:
   ```
   cd functions && npm install && npm run build
   firebase deploy --only functions
   ```

7. **Storage rules** for document vault and trip journal — restrict to owning user.

## 🎯 Remaining backend gaps to revisit

- Firestore security rules file
- Storage security rules file
- FCM web push registration helper (client side, deferred w/ frontend)
- Stripe / payment integration for Duffel booking surcharge or markup
- Rate limiting on Cloud Functions (Firebase App Check)
- Sentry / error reporting

## 📊 Architecture summary

```
Client (TS + Vite + Firebase SDK)
  └── httpsCallable → Firebase Functions (Node 20)
                       ├── Duffel / Amadeus / Travelpayouts / Makcorps    (booking)
                       ├── Geoapify / OpenTripMap / Foursquare            (POI)
                       ├── Navitia / Transitous                           (transit)
                       ├── Open-Meteo / AQICN / Frankfurter               (env data)
                       ├── REST Countries / Nager.Date / VisaDB / Climatiq (intel)
                       ├── Wikivoyage MediaWiki                            (guide)
                       ├── Airalo                                          (eSIM)
                       ├── Gmail API                                       (email parser)
                       └── Gemini (gemini-1.5-pro + flash)                 (AI)
  Firestore   = users, itineraries, bookings, groupTrips, expenses, priceWatches, vault meta, journals
  Storage     = encrypted vault docs + journal photos
  Messaging   = FCM push for price-drop alerts
  Scheduler   = pollPriceWatches every 60 min
```
