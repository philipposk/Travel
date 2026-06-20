# improve/v2 — audit fixes

Branch off `main`. No existing code deleted; only fixed and extended.
A multi-agent audit produced 49 findings across security, correctness, and UX.
This pass fixes the security + correctness + accessibility findings.

## Security
- **XSS (stored):** added `esc()` (HTML-escape) + `safeUrl()` / `safeImgUrl()` (scheme allow-list) and applied them to every `innerHTML` / `insertAdjacentHTML` site that injects third-party data — scam pills, community Reddit/YouTube titles + links, visa notes, translations, packing list, itinerary, holidays, country facts, flight/hotel/eSIM cards, trip rail, journal, group members/expenses, imported bookings, error messages. `src/main.ts`.
- **Unauthenticated paid functions:** added `requireAuth(req)` to all 15 callable functions that hit paid APIs (Gemini Vision/chat/translate/itinerary/packing, Duffel, Amadeus, Geoapify, AQICN, YouTube, Airalo, etc.). `functions/src/index.ts`.
- **Anonymous auth bridge:** the landing-page "Identify" still works for logged-out visitors via best-effort `signInAnonymously`; anonymous sessions are treated as logged-out in the UI (`realUser()`), so they don't unlock saved trips / vault / group trips. *Requires Anonymous auth enabled in the Firebase console.*
- **Gmail token owner check:** `importGmailBookings` now verifies the supplied Gmail access token's email matches the signed-in Firebase user's email (via Google `tokeninfo`) before reading any mail — closes a cross-user data-exfiltration hole.

## Correctness
- **Vault delete order:** delete Firestore metadata first, then Storage blob — avoids a user-visible "doc exists but 404s" state.
- **Listener leaks:** `refreshWatchList` and `bindTripRail` now unsubscribe their previous `onSnapshot` before re-subscribing; FCM `onMessage` registered once (guarded flag).
- **Booking aggregator index bug:** categories resolved via named promises so a skipped flight search can't shift hotels into the flights slot.
- **ICS export:** date built from local Y/M/D (no UTC day-shift); RFC 5545 line folding fixed to true 75-octet budget; UIDs made unique per activity.
- **Hotel watch:** hotel price watch now defaults to a 1-night stay instead of `checkOut === checkIn`.
- **`onSnapshotOnce` / `getDocsOnce`:** added error callbacks so a permission/network error resolves instead of hanging the UI forever.
- **Coordinate hemisphere:** shows N/S and E/W from the sign instead of always "N / E".
- **Guards:** `i.weather?.[0]`, journal `e.lon` null check, hotel star clamp, holiday date compared at local midnight.
- **Journal photos:** uploaded in parallel instead of sequentially.
- **Geofence:** `start()` stops any existing watch first.

## Accessibility / UX
- Replaced `window.confirm` / `window.prompt` (sign-out, trip delete, vault delete, vault passphrase, eSIM country code) with a focus-trapped, keyboard-navigable `uiDialog` (Esc/Enter, restores focus).
- Identify + flight-search buttons disable during in-flight requests; failed text-identify now shows an error state in the panel, not just a toast.
- Result tabs: `role="tab"`, `aria-selected`, roving `tabindex`, `aria-controls`/`aria-labelledby`, Arrow-key navigation.
- Tools menu: `aria-haspopup`/`aria-expanded`, `role="menu"`/`menuitem`, Arrow/Esc keyboard handling.
- Primary nav + footer links given real `href`s (middle-click / open-in-new-tab work).
- Sample images given descriptive `alt` + button `aria-label`.
- Footer "About" / "Privacy" now open real info dialogs; hero badge reflects demo mode.
- Booking forms collapse to a single column under 520px.
- Visible focus rings for keyboard users.

## New features / enhancements
- **Real destination local time:** `getDestinationIntel` now returns the destination's IANA timezone + UTC offset (Open-Meteo, keyless); the Essentials card shows the destination's actual clock instead of the viewer's. `functions/src/lib/intel.ts`, `functions/src/index.ts`, `src/main.ts`.
- **Currency converter:** new tools-menu item + sheet wired to the existing keyless `convertCurrency` (ECB mid-market rates). Live conversion + unit rate. `index.html`, `src/main.ts`.
- **Image upload validation:** non-image or >20 MB files are rejected with a clear toast before any encode/upload, on both the file picker and drag-drop paths.

## Verification
- `tsc --noEmit` (frontend) — clean
- `functions` `tsc --noEmit` — clean
- `vite build` — clean
- Live preview: no console errors; dialog, tabs ARIA, badge confirmed working.
