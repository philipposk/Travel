// Third-party API health checks. The app fans out to 10 third-party
// providers, several of which need manual key approval/renewal (see
// WHAT_TO_DO_NEXT.md). If a key expires or a provider changes its API, the
// app's existing per-provider try/catch just falls back to AI-simulated /
// demo data — quietly, with nothing telling the owner a provider is down.
//
// checkAllProviders() pings each *configured* provider with the cheapest
// available request (reference/metadata endpoints where the provider offers
// one, rather than a real search) and reports pass/fail. Providers with no
// key/credential set are skipped, not reported as failures — that's an
// intentional "not set up yet" state, not a regression.

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { geoapifyGeocode } from "./geoapify";
import { searchOpenTripMap } from "./opentripmap";
import { aqicnByGeo, visaRequirement } from "./intel";

export interface ProviderCheckResult {
  provider: string;
  status: "ok" | "down" | "unconfigured";
  error?: string;
}

// A fixed, well-known coordinate/pair used for every geo-based probe (central
// Paris) so checks are deterministic and independent of any real user query.
const PROBE_LAT = 48.8566;
const PROBE_LON = 2.3522;

async function probe(name: string, isConfigured: boolean, run: () => Promise<void>): Promise<ProviderCheckResult> {
  if (!isConfigured) return { provider: name, status: "unconfigured" };
  try {
    await run();
    return { provider: name, status: "ok" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error(`healthcheck:${name}`, e);
    return { provider: name, status: "down", error };
  }
}

async function fetchOk(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export interface HealthCheckSecrets {
  duffelToken: string;
  amadeusId: string;
  amadeusSecret: string;
  tpToken: string;
  tpMarker: string;
  geoapifyKey: string;
  opentripmapKey: string;
  navitiaKey: string;
  aqicnToken: string;
  visadbKey: string;
  climatiqKey: string;
  airaloId: string;
  airaloSecret: string;
}

export async function checkAllProviders(s: HealthCheckSecrets): Promise<ProviderCheckResult[]> {
  const checks: Array<Promise<ProviderCheckResult>> = [
    // Duffel: list airlines, a free reference-data read (no search performed).
    probe("duffel", !!s.duffelToken, () => fetchOk("https://api.duffel.com/air/airlines?limit=1", {
      headers: { Authorization: `Bearer ${s.duffelToken}`, "Duffel-Version": "v2", Accept: "application/json" },
    })),

    // Amadeus: the OAuth token endpoint itself is free/unmetered — a
    // successful token response confirms both connectivity and credentials
    // without touching the flight/hotel search quota.
    probe("amadeus", !!(s.amadeusId && s.amadeusSecret), async () => {
      const res = await fetch("https://test.api.amadeus.com/v1/security/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials", client_id: s.amadeusId, client_secret: s.amadeusSecret,
        }).toString(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),

    // Travelpayouts: a minimal cached-price lookup (free tier, no per-call cost).
    probe("travelpayouts", !!(s.tpToken && s.tpMarker), () => fetchOk(
      `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=LON&destination=PAR&token=${s.tpToken}&marker=${s.tpMarker}&limit=1`
    )),

    // Geoapify: reuse the existing geocode helper with a fixed query.
    probe("geoapify", !!s.geoapifyKey, async () => {
      const r = await geoapifyGeocode(s.geoapifyKey, "Paris");
      if (!r) throw new Error("no result");
    }),

    // OpenTripMap: tiny-radius, limit-1 POI search around the probe point.
    probe("opentripmap", !!s.opentripmapKey, async () => {
      await searchOpenTripMap(s.opentripmapKey, PROBE_LAT, PROBE_LON, 500, "interesting_places", 1);
    }),

    // Navitia: /coverage lists supported regions — no from/to needed, so it
    // can't fail with a "no journey found" false negative like a real journey query.
    probe("navitia", !!s.navitiaKey, () => fetchOk("https://api.navitia.io/v1/coverage", {
      headers: { Authorization: s.navitiaKey },
    })),

    // AQICN: reuse the existing air-quality helper with a fixed coordinate.
    probe("aqicn", !!s.aqicnToken, async () => {
      const r = await aqicnByGeo(s.aqicnToken, PROBE_LAT, PROBE_LON);
      if (!r) throw new Error("no result");
    }),

    // VisaDB: a fixed passport/destination pair.
    probe("visadb", !!s.visadbKey, async () => {
      const r = await visaRequirement(s.visadbKey, "US", "FR");
      if (!r) throw new Error("no result");
    }),

    // Climatiq: /data-versions is metadata-only and doesn't consume estimate quota.
    probe("climatiq", !!s.climatiqKey, () => fetchOk("https://api.climatiq.io/data-versions", {
      headers: { Authorization: `Bearer ${s.climatiqKey}` },
    })),

    // Airalo: the OAuth token exchange alone, without listing packages.
    probe("airalo", !!(s.airaloId && s.airaloSecret), async () => {
      const res = await fetch("https://partners-api.airalo.com/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials", client_id: s.airaloId, client_secret: s.airaloSecret,
        }).toString(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ];

  return Promise.all(checks);
}

// ── Failure fingerprinting + owner alert ────────────────────────────────────
// Stores last-known status per provider so a health check that's been failing
// the same way for a week doesn't send a push every single day — only a
// *new* failure (first time down, or the failure category changed, e.g.
// 401 -> 5xx) re-alerts. A provider recovering from "down" also gets one
// one-time "back up" notice.

function fingerprint(result: ProviderCheckResult): string {
  if (result.status !== "down") return "";
  const msg = result.error || "";
  const httpMatch = msg.match(/HTTP (\d)\d\d/); // bucket by status class: 4xx/5xx
  if (httpMatch) return `http_${httpMatch[1]}xx`;
  if (/timeout|timed out/i.test(msg)) return "timeout";
  if (/network|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)) return "network";
  return "unknown";
}

interface ProviderHealthDoc {
  status: "ok" | "down" | "unconfigured";
  lastCheckedAt: string;
  lastError?: string;
  lastFailureFingerprint?: string;
  lastAlertedAt?: string;
  consecutiveFailures?: number;
}

export interface HealthAlert {
  provider: string;
  kind: "new_failure" | "recovered";
  error?: string;
}

/**
 * Persists each provider's status to Firestore (`providerHealth/{provider}`)
 * and returns the subset of results that represent a NEW state change worth
 * alerting the owner about (a fresh failure fingerprint, or a recovery from
 * a prior failure). Unconfigured providers never alert.
 */
export async function recordAndDedupeAlerts(results: ProviderCheckResult[]): Promise<HealthAlert[]> {
  const db = admin.firestore();
  const alerts: HealthAlert[] = [];

  await Promise.all(results.map(async (result) => {
    if (result.status === "unconfigured") return; // don't touch prior history

    const ref = db.doc(`providerHealth/${result.provider}`);
    const snap = await ref.get();
    const prev = snap.exists ? (snap.data() as ProviderHealthDoc) : null;
    const now = new Date().toISOString();

    if (result.status === "ok") {
      if (prev?.status === "down") {
        alerts.push({ provider: result.provider, kind: "recovered" });
      }
      await ref.set({ status: "ok", lastCheckedAt: now } as ProviderHealthDoc, { merge: true });
      return;
    }

    // status === "down"
    const fp = fingerprint(result);
    const isNewFailure = prev?.status !== "down" || prev?.lastFailureFingerprint !== fp;
    const update: ProviderHealthDoc = {
      status: "down",
      lastCheckedAt: now,
      lastError: result.error,
      lastFailureFingerprint: fp,
      consecutiveFailures: (prev?.consecutiveFailures || 0) + 1,
    };
    if (isNewFailure) {
      update.lastAlertedAt = now;
      alerts.push({ provider: result.provider, kind: "new_failure", error: result.error });
    } else {
      update.lastAlertedAt = prev?.lastAlertedAt;
    }
    await ref.set(update, { merge: true });
  }));

  return alerts;
}

/**
 * Looks up admin uids from `system/admins` (a small manually-maintained doc —
 * see PR description for the one-time setup) and returns every FCM token
 * registered under those uids via the app's existing push-registration flow
 * (users/{uid}/fcmTokens), reusing the same delivery plumbing as price-watch
 * alerts instead of adding a second registration path.
 */
export async function getOwnerFcmTokens(): Promise<string[]> {
  try {
    const db = admin.firestore();
    const adminsSnap = await db.doc("system/admins").get();
    const uids = (adminsSnap.data()?.uids as string[] | undefined) || [];
    if (!uids.length) return [];
    const tokenLists = await Promise.all(uids.map(async (uid) => {
      const tokensSnap = await db.collection(`users/${uid}/fcmTokens`).get();
      return tokensSnap.docs.map((d) => d.data().token as string).filter(Boolean);
    }));
    return tokenLists.flat();
  } catch (e) {
    logger.error("getOwnerFcmTokens", e);
    return [];
  }
}
