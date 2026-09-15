#!/usr/bin/env node
// Verifies a fresh clone (or a pre-deploy checkout) actually has what it
// needs before the app silently runs in demo/AI-fallback mode. No
// dependencies — plain Node + a tiny .env parser.
//
// Usage: node scripts/check-env.mjs   (wired as `npm run check-env`)
//
// What it does:
//  1. Parses .env.local for the VITE_FIREBASE_* keys the client needs to
//     boot Firebase at all. Missing one of these = hard failure (exit 1),
//     since without them the app can't sign in or read/write Firestore.
//  2. Warns (does not fail) about optional client keys and about the
//     server-side feature keys .env.local conventionally collects for local
//     `firebase emulators:start` use, explaining in plain language what
//     falls back to demo/omitted data without each one.
//  3. Read-only, best-effort: shells out to `firebase functions:secrets:access`
//     for each secret Cloud Functions actually reads via defineSecret(), to
//     report which are set in the *deployed* project's Secret Manager. Never
//     prints a secret's value. Skipped gracefully if the Firebase CLI isn't
//     installed or isn't authenticated — this is a convenience check, not a
//     requirement to run this script.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_LOCAL_PATH = join(ROOT, ".env.local");

// ── tiny .env parser (no dependency) ────────────────────────────────────────
function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function has(env, key) {
  return typeof env[key] === "string" && env[key].length > 0;
}

// ── section helpers ─────────────────────────────────────────────────────────
let hadFailure = false;
function section(title) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
}
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg) { console.log(`  \x1b[33m!\x1b[0m ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); hadFailure = true; }
function info(msg) { console.log(`    ${msg}`); }

// ── 1. Client boot check ─────────────────────────────────────────────────────
const REQUIRED_CLIENT_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const OPTIONAL_CLIENT_KEYS = [
  { key: "VITE_FIREBASE_VAPID_KEY", falls_back: "Push notifications (price-drop alerts) are disabled; everything else works." },
  { key: "VITE_GMAIL_OAUTH_CLIENT_ID", falls_back: "The \"Import bookings from Gmail\" flow is hidden/non-functional." },
];

section("1. Client boot config (.env.local)");
if (!existsSync(ENV_LOCAL_PATH)) {
  fail(".env.local not found. Copy .env.example to .env.local and fill in the [REQUIRED] keys.");
} else {
  const env = parseEnvFile(ENV_LOCAL_PATH);
  const missingRequired = REQUIRED_CLIENT_KEYS.filter((k) => !has(env, k));
  if (missingRequired.length === 0) {
    ok("All VITE_FIREBASE_* keys needed to boot are present.");
  } else {
    fail(`Missing required key(s): ${missingRequired.join(", ")}`);
    info("Without these, initializeApp() is skipped and the app runs with Firebase entirely disabled (no auth, no data).");
  }
  for (const { key, falls_back } of OPTIONAL_CLIENT_KEYS) {
    if (has(env, key)) ok(`${key} set.`);
    else { warn(`${key} not set.`); info(falls_back); }
  }
}

// ── 2. Server-side feature keys (informational, local-dev convenience) ──────
// These are NOT read by Vite (not VITE_-prefixed) — Cloud Functions reads
// them via defineSecret()/defineString() from Secret Manager / deploy-time
// params, not from this file. .env.local is just the one place the setup
// docs ask a dev to collect every key, so checking it here catches "I forgot
// to get this key" early, before a deploy or emulator run surfaces it as a
// silently-demo-mode feature.
const FEATURE_KEYS = [
  { key: "GEMINI_API_KEY", falls_back: "Identify (photo/text), the AI chat assistant, itinerary generator, packing list, translator, and travel-intelligence synthesis all return errors instead of results — there is no server-side AI fallback." },
  { key: "DUFFEL_API_TOKEN", falls_back: "Flight search skips Duffel results (Amadeus/Travelpayouts still run if configured)." },
  { key: "AMADEUS_CLIENT_ID", falls_back: "Amadeus flight/hotel/car search is skipped." },
  { key: "AMADEUS_CLIENT_SECRET", falls_back: "Amadeus flight/hotel/car search is skipped." },
  { key: "TRAVELPAYOUTS_API_TOKEN", falls_back: "Travelpayouts flight results and affiliate links are skipped." },
  { key: "TRAVELPAYOUTS_MARKER", falls_back: "Travelpayouts hotel results and affiliate links are skipped." },
  { key: "MAKCORPS_API_KEY", falls_back: "Makcorps hotel price-compare results are skipped." },
  { key: "GEOAPIFY_API_KEY", falls_back: "POI/experience search, itinerary place lookups, and destination geocoding (feeding weather/holidays/visa/carbon) are skipped." },
  { key: "OPENTRIPMAP_API_KEY", falls_back: "OpenTripMap attraction results are skipped from Experiences search." },
  { key: "NAVITIA_API_KEY", falls_back: "Navitia transit journeys are skipped (keyless Transitous results still show)." },
  { key: "AQICN_API_TOKEN", falls_back: "Air-quality fact is omitted from the destination intel panel." },
  { key: "VISADB_API_KEY", falls_back: "Visa requirement lookup is omitted from destination intel." },
  { key: "CLIMATIQ_API_KEY", falls_back: "Flight carbon-footprint estimate is omitted from destination intel." },
  { key: "AIRALO_CLIENT_ID", falls_back: "eSIM package listing/ordering is skipped (affiliate link still shows if AIRALO_REF_CODE is set)." },
  { key: "AIRALO_CLIENT_SECRET", falls_back: "eSIM package listing/ordering is skipped (affiliate link still shows if AIRALO_REF_CODE is set)." },
  { key: "AIRALO_REF_CODE", falls_back: "The eSIM affiliate-link fallback has no referral code attached." },
  { key: "YOUTUBE_API_KEY", falls_back: "Travel-intelligence video results are skipped (Reddit results still show)." },
  { key: "MAPS_API_KEY", falls_back: "The legacy getTravelAssistantResponse assistant-links function (geocoding + air quality) fails." },
];

section("2. Server-side feature keys (local dev reference — warn only)");
if (existsSync(ENV_LOCAL_PATH)) {
  const env = parseEnvFile(ENV_LOCAL_PATH);
  let allSet = true;
  for (const { key, falls_back } of FEATURE_KEYS) {
    if (has(env, key)) { ok(`${key} set.`); continue; }
    allSet = false;
    warn(`${key} not set.`);
    info(falls_back);
  }
  if (allSet) ok("All optional feature keys are present — no demo-mode fallbacks expected locally.");
} else {
  warn("Skipped — .env.local not found.");
}

// ── 3. Live Secret Manager check (read-only, best-effort) ───────────────────
// Only the keys Cloud Functions actually wraps in defineSecret() live in
// Secret Manager; the rest (AMADEUS_CLIENT_ID, TRAVELPAYOUTS_MARKER,
// MAPS_API_KEY, AIRALO_CLIENT_ID, AIRALO_REF_CODE) are defineString() params
// supplied at deploy time instead, so they're not checked here.
const DEPLOYED_SECRETS = [
  "GEMINI_API_KEY", "DUFFEL_API_TOKEN", "AMADEUS_CLIENT_SECRET",
  "TRAVELPAYOUTS_API_TOKEN", "MAKCORPS_API_KEY", "GEOAPIFY_API_KEY",
  "OPENTRIPMAP_API_KEY", "NAVITIA_API_KEY", "AQICN_API_TOKEN",
  "VISADB_API_KEY", "CLIMATIQ_API_KEY", "AIRALO_CLIENT_SECRET", "YOUTUBE_API_KEY",
];

section("3. Deployed Firebase Secret Manager (read-only, requires `firebase login`)");

function firebaseCliAvailable() {
  const res = spawnSync("firebase", ["--version"], { encoding: "utf8", timeout: 10_000 });
  return res.status === 0;
}

if (!firebaseCliAvailable()) {
  warn("Firebase CLI not found or not runnable — skipping live secret check.");
  info("Install with `npm install -g firebase-tools`, then `firebase login`, and re-run `npm run check-env`.");
} else {
  for (const name of DEPLOYED_SECRETS) {
    // NOTE: `firebase functions:secrets:access` prints the secret's VALUE to
    // stdout. We deliberately never log `res.stdout` — only whether the call
    // succeeded — so this script can't leak a live secret into CI logs.
    const res = spawnSync("firebase", ["functions:secrets:access", name], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (res.error) {
      warn(`${name}: could not check (${res.error.code || res.error.message}).`);
    } else if (res.status === 0 && res.stdout && res.stdout.trim().length > 0) {
      ok(`${name} is set in Secret Manager.`);
    } else {
      warn(`${name} is NOT set (or you're not authenticated/authorized for this project).`);
    }
  }
  info("Set a missing one with: firebase functions:secrets:set <NAME>");
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log();
if (hadFailure) {
  console.log("\x1b[31mcheck-env: FAILED — fix the required client keys above before running the app.\x1b[0m");
  process.exit(1);
} else {
  console.log("\x1b[32mcheck-env: passed (warnings above, if any, are informational).\x1b[0m");
  process.exit(0);
}
