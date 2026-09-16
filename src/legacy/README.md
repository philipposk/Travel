# src/legacy

Everything in here predates the June 2026 Firebase/Vite rebuild (see
`IMPROVEMENTS_V2.md`) and is **not imported from `src/main.ts`** — the app's
only entry point (`index.html` loads exactly one script: `/src/main.ts`).
Verified with a full grep of every `import` graph reachable from `main.ts`
before moving anything here; none of these files are referenced by it,
by each other outside this folder, or by `functions/src` (a separate build).

Several of these files construct `new GoogleGenerativeAI(apiKey)` directly
with a client-side Gemini key (`features/immigration.ts`,
`features/community.ts`, `services/aiAssistant.ts`, `travel.js` via
`import.meta.env.VITE_GEMINI_API_KEY`) — exactly the client-side-key exposure
the June audit fixed everywhere else by moving Gemini calls behind
authenticated Cloud Functions (`functions/src/index.ts`). **Do not wire any
of these back into `main.ts`** without first routing their AI calls through
a callable function the same way `identifyPlaceFromImage` / `chatWithAssistant`
/ etc. already do. `VITE_GEMINI_API_KEY` / `VITE_MAPS_API_KEY` are no longer
read anywhere in the shipped app for this reason.

The actual live implementations of booking search, transit, translation, and
travel-intelligence synthesis are the callable functions in
`functions/src/index.ts` (`searchFlights`, `searchHotels`, `searchExperiences`,
`searchTransit`, `translatePhrase`, `scrapeTravelIntelligence`, ...), called
directly from `src/main.ts` via `httpsCallable`. The client-side wrapper
services below were superseded by that direct wiring and were never hooked up.

| File | Why it's here |
|---|---|
| `features/immigration.ts` | Direct client-side Gemini client; superseded by `identifyPlaceFromText`/`getDestinationIntel` (visa) callables. |
| `features/community.ts` | Direct client-side Gemini client; the shipped community/discover UI in `main.ts` doesn't call it. |
| `features/contentCreator.ts` | No importers anywhere; not wired into any route. |
| `features/mapsRepository.ts` | No importers anywhere; superseded by the keyless OSM embed in `main.ts`. |
| `features/social.ts` | No importers anywhere; not wired into any route. |
| `features/booking.ts` | No importers anywhere; superseded by the direct `searchFlights`/`searchHotels`/etc. calls in `main.ts`. |
| `services/aiAssistant.ts` | Direct client-side Gemini client; superseded by the `chatWithAssistant` callable. |
| `services/airportService.ts` | No importers; airport info in `main.ts` comes from `getDestinationIntel`/static data instead. |
| `services/airportAlertsService.ts` | No importers; not wired into any route. |
| `services/bookingAggregator.ts` | No importers; superseded by direct callable wiring in `main.ts`. Imports `dataNormalizer.ts` and `realBookingAggregator.ts` below (kept together). |
| `services/bookingScraper.ts` | No importers; server-side scraping now happens in `functions/src` instead. |
| `services/bookingSearch.ts` | No importers; superseded by `searchFlights`/`searchHotels` callables. |
| `services/communityEditor.ts` | No importers. Its `role: 'admin'` field is unrelated to the real admin gate added in this PR (Firebase custom claim, see `src/admin.ts`) — don't confuse the two. |
| `services/dataNormalizer.ts` | Only used by `bookingAggregator.ts` above; dead by extension. |
| `services/notificationService.ts` | No importers; push notifications are wired directly in `main.ts` (FCM) instead. |
| `services/realBookingAggregator.ts` | No importers; see `bookingAggregator.ts`. |
| `services/reverseImageSearch.ts` | No importers; the shipped "Identify" flow uses Gemini Vision via the `identifyPlaceFromImage` callable instead. |
| `services/translator.ts` | No importers; superseded by the `translatePhrase` callable. |
| `services/transportAPIs.ts` | No importers; superseded by the `searchTransit` callable. |
| `services/travelIntelligence.ts` | No importers; superseded by the `scrapeTravelIntelligence` callable. |
| `travel.js` | Standalone prototype script (`#prettier-version`/`#ai-button` DOM hooks that don't exist in `index.html`); reads `import.meta.env.VITE_GEMINI_API_KEY` client-side. Not `<script>`-included anywhere. |
| `authSetup.ts` | Multi-provider auth helper (Google/Facebook/Twitter/GitHub/Apple + email/password); zero importers. `main.ts` implements its own Google/Facebook/Apple sign-in inline instead. |
