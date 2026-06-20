// Atlas — frontend entry. Wires the Atlas mockup UI to the Firebase Functions
// backend built in /functions/src/index.ts. Frontend logic only — every external
// API call goes through httpsCallable. No keys live in client code.

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFirestore,
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { getMessaging, getToken, onMessage, isSupported as fcmSupported } from "firebase/messaging";
import { DocumentVault, type VaultDocMeta, type DocKind } from "./services/documentVault";
import { downloadICS, type ICSEvent } from "./services/icsExport";
import { TripJournal, type JournalEntry } from "./services/tripJournal";
import { GeofenceWatcher, type Geofence } from "./services/geofence";

// ── Firebase init ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: ReturnType<typeof initializeApp> | null = null;
let functionsReady = false;
try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    functionsReady = true;
  }
} catch (e) {
  console.warn("Firebase init failed:", e);
}

const fn = functionsReady ? getFunctions(app!) : null;
const auth = functionsReady ? getAuth(app!) : null;
const db = functionsReady ? getFirestore(app!) : null;

// ── Helpers ─────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string) =>
  Array.from(document.querySelectorAll<T>(s));

function call<TIn, TOut>(name: string, data: TIn): Promise<TOut> {
  if (!fn) return Promise.reject(new Error("Firebase not configured. Add VITE_FIREBASE_* keys to .env.local"));
  return httpsCallable<TIn, TOut>(fn, name)(data).then((r) => r.data);
}

// A real (non-anonymous) signed-in user, or null. Anonymous sessions exist only
// to give callable functions an auth context; they shouldn't unlock personal
// features like saved trips, the vault, or group trips.
function realUser() {
  const u = auth?.currentUser;
  return u && !u.isAnonymous ? u : null;
}

function toast(message: string, kind: "ok" | "err" | "info" = "info") {
  const wrap = $("#toastWrap")!;
  const el = document.createElement("div");
  el.className = `toast ${kind === "err" ? "err" : kind === "ok" ? "ok" : ""}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// Escape any string that originates outside our own code before it is placed
// into an HTML template string. Third-party API text (Reddit/YouTube titles,
// Gemini-synthesised copy, VisaDB notes, translations) is untrusted and would
// otherwise be a stored-XSS vector when injected via innerHTML/insertAdjacentHTML.
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow http(s) links from third-party data into href attributes. Anything
// else (javascript:, data:, etc.) collapses to "#" so a malicious booking URL
// can't run script on click.
function safeUrl(u: unknown): string {
  const s = String(u ?? "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  return "#";
}

// For <img src>: also permit data:image and blob: (used by locally captured
// covers) but still block javascript:/other schemes.
function safeImgUrl(u: unknown): string {
  const s = String(u ?? "").trim();
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s) || /^blob:/i.test(s)) return s;
  return "";
}

// Accessible replacements for the native window.confirm / window.prompt, which
// are unstyled, block the main thread, are often suppressed by popup blockers,
// and are awkward for screen-reader / keyboard users. These render a focus-
// trapped dialog and resolve a Promise.
type DialogOpts = { title: string; message?: string; confirmText?: string; cancelText?: string; input?: { label: string; type?: "text" | "password"; placeholder?: string } };
function uiDialog(opts: DialogOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "ui-dialog-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", opts.title);
    overlay.innerHTML = `
      <div class="ui-dialog">
        <h4>${esc(opts.title)}</h4>
        ${opts.message ? `<p>${esc(opts.message)}</p>` : ""}
        ${opts.input ? `<label class="ui-dialog-field">${esc(opts.input.label)}<input type="${opts.input.type || "text"}" placeholder="${esc(opts.input.placeholder || "")}" autocomplete="${opts.input.type === "password" ? "current-password" : "off"}"></label>` : ""}
        <div class="ui-dialog-actions">
          <button class="btn ghost" data-d="cancel">${esc(opts.cancelText || "Cancel")}</button>
          <button class="btn clay" data-d="ok">${esc(opts.confirmText || "Confirm")}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector<HTMLInputElement>("input");
    const prev = document.activeElement as HTMLElement | null;
    (input || overlay.querySelector<HTMLButtonElement>('[data-d="ok"]'))?.focus();
    const close = (val: string | null) => {
      overlay.remove();
      prev?.focus?.();
      resolve(val);
    };
    overlay.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t === overlay) return close(null);
      const act = t.closest<HTMLElement>("[data-d]")?.dataset.d;
      if (act === "cancel") close(null);
      if (act === "ok") close(input ? input.value : "ok");
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter" && input) { e.preventDefault(); close(input.value); }
    });
  });
}
function uiConfirm(title: string, message?: string, confirmText = "Confirm"): Promise<boolean> {
  return uiDialog({ title, message, confirmText }).then((v) => v !== null);
}
function uiPrompt(title: string, label: string, type: "text" | "password" = "text"): Promise<string | null> {
  return uiDialog({ title, input: { label, type } });
}

function fileToBase64(file: File): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      const m = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return reject(new Error("Bad file"));
      resolve({ mime: m[1], data: m[2] });
    };
    reader.readAsDataURL(file);
  });
}

function urlToBase64(url: string): Promise<{ data: string; mime: string }> {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Fetch ${r.status}`);
      const mime = r.headers.get("content-type") || "image/jpeg";
      return r.blob().then((blob) => ({ blob, mime }));
    })
    .then(
      ({ blob, mime }) =>
        new Promise<{ data: string; mime: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => {
            const result = String(reader.result || "");
            const m = result.match(/^data:[^;]+;base64,(.+)$/);
            if (!m) return reject(new Error("Bad data"));
            resolve({ data: m[1], mime });
          };
          reader.readAsDataURL(blob);
        })
    );
}

// ── Types ───────────────────────────────────────────────────────────────────
interface IdentifyResult {
  name: string; shortMatch: string; country: string; countryCode: string;
  region: string; city: string; district?: string | null;
  lat: number; lon: number; confidence: number;
  description: string; iataAirport?: string | null;
}

interface FlightResult {
  id: string; offerId?: string; segments: Array<{
    from: string; to: string; airline: string; flightNumber: string;
    departure: string; arrival: string; duration: string;
  }>;
  totalPrice: number; currency: string; totalDuration: string; layovers: number;
  source: string; bookingUrl?: string;
}

interface HotelResult {
  id: string; name: string; location: string; price: number; currency: string;
  rating: number; reviews: number; source: string; url: string;
}

interface DestinationIntel {
  destination: string;
  geo: { lat: number; lon: number; formatted: string; country: string; countryCode: string } | null;
  weather: Array<{ date: string; tempMaxC: number; tempMinC: number; precipMm: number; weatherCode: number }>;
  climate: Array<{ month: number; avgTempC: number; precipMm: number }>;
  airQuality: { aqi: number; level: string; pollutant: string; updatedAt: string } | null;
  publicHolidays: Array<{ date: string; localName: string; name: string }>;
  countryFacts: {
    name: string; capital: string[]; currencies: Record<string, { name: string; symbol: string }>;
    languages: Record<string, string>; callingCode: string;
  } | null;
  staticFacts: { plugs?: string[]; voltage?: string; tapWaterSafe?: boolean; tippingPercent?: string; emergency?: Record<string, string>; driving?: string };
  wikivoyage: { extract: string; url: string; thumbnail?: string } | null;
  visa: { status: string; durationDays?: number; notes?: string } | null;
  carbon: { co2Kg: number } | null;
  timezone: { timezone: string; utcOffsetSeconds: number } | null;
}

// ── Router ──────────────────────────────────────────────────────────────────
type Route = "discover" | "bookings" | "airports" | "visas" | "translate" | "community";

function go(route: Route) {
  $$("[data-route]").forEach((el) => el.classList.toggle("active", el.getAttribute("data-route") === route));
  $$<HTMLAnchorElement>("nav.primary a").forEach((a) => a.classList.toggle("active", a.dataset.nav === route));
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", `#${route}`);
}

function initRouter() {
  document.body.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-nav]");
    if (t && t.dataset.nav) {
      ev.preventDefault();
      go(t.dataset.nav as Route);
    }
    const a = (ev.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (a && a.dataset.action) {
      // Action anchors carry href="#" for keyboard/right-click affordance; stop
      // the hash navigation that would otherwise jump the page to the top.
      if (a.tagName === "A") ev.preventDefault();
      handleAction(a.dataset.action);
    }
  });
  const initial = (location.hash.replace("#", "") || "discover") as Route;
  if (["discover", "bookings", "airports", "visas", "translate", "community"].includes(initial)) go(initial);
}

function handleAction(action: string) {
  if (action === "create-itinerary" || action === "open-itinerary-form") {
    openItinForm();
  } else if (action === "open-itineraries") {
    openSheet("itinListSheet"); refreshItineraries();
  } else if (action === "open-vault") {
    openSheet("vaultSheet"); refreshVaultList();
  } else if (action === "open-journal") {
    toast("Trip journal opens once you have an active trip.", "info");
  } else if (action === "open-watches") {
    openSheet("watchSheet"); refreshWatchList();
  } else if (action === "open-esim") {
    openSheet("esimSheet"); refreshEsim();
  } else if (action === "open-fx") {
    openSheet("fxSheet"); initFxOnce();
  } else if (action === "open-inbox") {
    openSheet("inboxSheet"); refreshInbox();
  } else if (action === "install-app") {
    promptInstall();
  } else if (action === "open-about") {
    uiDialog({
      title: "About Atlas",
      message: "Atlas turns a single photo into a whole trip: identify any place, then plan flights, visas, gate info, local phrases and the scams to avoid. Built on Gemini, Google Maps, Duffel, Amadeus and a dozen open travel APIs.",
      confirmText: "Got it", cancelText: "Close",
    });
  } else if (action === "open-privacy") {
    uiDialog({
      title: "Privacy",
      message: "Your trips, documents and journal stay in your own account. Vault files are encrypted in your browser before upload — we never see the contents. Gmail import only reads travel confirmations, in real time, and is never stored beyond the parsed booking. No data is sold.",
      confirmText: "Got it", cancelText: "Close",
    });
  }
  closeToolsMenu();
}

function openSheet(id: string) { $(`#${id}`)!.classList.add("is-open"); }
function closeSheet(id: string) { $(`#${id}`)!.classList.remove("is-open"); }
function closeToolsMenu() {
  const m = $("#toolsMenu");
  if (m) m.style.display = "none";
  $("#toolsBtn")?.setAttribute("aria-expanded", "false");
}

// ── Identify flow ───────────────────────────────────────────────────────────
let currentIdentified: IdentifyResult | null = null;
// Last destination intel, kept so other features (e.g. the packing list) can
// reuse its real weather instead of a hardcoded "varied climate" placeholder.
let lastIntel: DestinationIntel | null = null;

// Disable the identify controls while a request is in flight so a user can't
// fire several overlapping calls (whose responses would arrive out of order).
function setIdentifyBusy(busy: boolean) {
  const btn = $<HTMLButtonElement>("#identifyBtn");
  if (btn) btn.disabled = busy;
  $$<HTMLButtonElement>(".sample").forEach((b) => { b.disabled = busy; });
}

async function identifyFromImage(opts: { url?: string; file?: File; hint?: string }) {
  const result = $("#result")!;
  $("#resultMatch")!.textContent = "Identifying…";
  $("#resultConf")!.textContent = "Analyzing";
  result.classList.add("is-open");
  setIdentifyBusy(true);
  setTimeout(() => window.scrollTo({ top: result.offsetTop - 56, behavior: "smooth" }), 40);

  try {
    let payload: { data: string; mime: string };
    let displayUrl: string;
    if (opts.file) {
      payload = await fileToBase64(opts.file);
      displayUrl = URL.createObjectURL(opts.file);
    } else if (opts.url) {
      payload = await urlToBase64(opts.url);
      displayUrl = opts.url;
    } else {
      throw new Error("No image provided");
    }
    $<HTMLImageElement>("#resultImg")!.src = displayUrl;

    const r = await call<{ imageBase64: string; mimeType: string; hint?: string }, IdentifyResult>(
      "identifyPlaceFromImage",
      { imageBase64: payload.data, mimeType: payload.mime, hint: opts.hint }
    );
    paintIdentify(r);
    loadIntelAndPaint(r);
  } catch (e) {
    console.error(e);
    $("#resultMatch")!.textContent = "Couldn't identify this one";
    $("#resultConf")!.textContent = "0%";
    toast(`Identify failed: ${(e as Error).message}`, "err");
  } finally {
    setIdentifyBusy(false);
  }
}

async function identifyFromText(text: string) {
  const result = $("#result")!;
  result.classList.add("is-open");
  $<HTMLImageElement>("#resultImg")!.src = "/assets/reichstag.jpeg";
  $("#resultMatch")!.textContent = `Searching for "${text}"…`;
  $("#resultConf")!.textContent = "Thinking";
  setIdentifyBusy(true);
  setTimeout(() => window.scrollTo({ top: result.offsetTop - 56, behavior: "smooth" }), 40);
  try {
    const r = await call<{ description: string }, IdentifyResult>("identifyPlaceFromText", {
      description: text,
    });
    paintIdentify(r);
    loadIntelAndPaint(r);
  } catch (e) {
    // Surface failure in the panel itself, not just a toast, so the stale
    // placeholder match/name don't read as a successful result.
    $("#resultMatch")!.textContent = "Couldn't find that place";
    $("#resultConf")!.textContent = "0%";
    toast(`Search failed: ${(e as Error).message}`, "err");
  } finally {
    setIdentifyBusy(false);
  }
}

function paintIdentify(r: IdentifyResult) {
  currentIdentified = r;
  $("#resultMatch")!.textContent = r.shortMatch;
  $("#resultConf")!.textContent = `${Math.round(r.confidence)}% match`;
  $("#resultName")!.textContent = r.name;
  $("#resultCountry")!.textContent = `${r.country} · ${r.region}`;
  const latDir = r.lat >= 0 ? "N" : "S";
  const lonDir = r.lon >= 0 ? "E" : "W";
  $("#resultCoords")!.textContent = [
    `${Math.abs(r.lat).toFixed(4)}° ${latDir}, ${Math.abs(r.lon).toFixed(4)}° ${lonDir}`,
    r.district || r.city,
  ].filter(Boolean).join(" · ");
  $("#mapName")!.textContent = r.name;
  $("#mapSub")!.textContent = `${r.city || r.country}`;
  $("#stampCount")!.textContent = "Identified · ready to plan";
  paintMap(r.lat, r.lon, r.name);
  pushRecent(r);
}

// ── Recent identifications (localStorage, works without sign-in) ─────────────
const RECENT_KEY = "atlas.recent";
function loadRecent(): IdentifyResult[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(r: IdentifyResult) {
  try {
    const list = loadRecent().filter((x) => x.name !== r.name);
    list.unshift(r);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch { /* storage full / disabled — non-fatal */ }
  renderRecent();
}
function initRecent() {
  $("#clearRecent")?.addEventListener("click", () => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* noop */ }
    renderRecent();
  });
  renderRecent();
}
function renderRecent() {
  const section = $("#recentSection");
  const strip = $("#recentStrip");
  if (!section || !strip) return;
  const list = loadRecent();
  if (!list.length) { section.style.display = "none"; return; }
  section.style.display = "";
  strip.innerHTML = list.map((r, i) =>
    `<button class="pill recent-chip" data-recent="${i}">${esc(r.shortMatch || r.name)}</button>`
  ).join("");
  strip.querySelectorAll<HTMLButtonElement>("[data-recent]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = loadRecent()[Number(b.dataset.recent)];
      if (!r) return;
      paintIdentify(r);
      loadIntelAndPaint(r);
      const result = $("#result"); result?.classList.add("is-open");
      setTimeout(() => result && window.scrollTo({ top: result.offsetTop - 56, behavior: "smooth" }), 40);
    })
  );
}

// Swap the decorative map placeholder for a real, keyless OpenStreetMap embed
// centred on the identified place (no API key, no billing, no exposed key).
function paintMap(lat: number, lon: number, name: string) {
  const mock = $("#mapMock");
  if (!mock || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const d = 0.02; // ~2km bounding box
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  let frame = mock.querySelector<HTMLIFrameElement>("iframe.map-live");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.className = "map-live";
    frame.loading = "lazy";
    frame.setAttribute("title", `Map of ${name}`);
    mock.insertBefore(frame, mock.firstChild);
  }
  frame.src = src;
  frame.setAttribute("title", `Map of ${name}`);
  mock.classList.add("has-live");

  const full = $<HTMLButtonElement>("#openFullMap");
  if (full) full.onclick = () => window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`, "_blank", "noopener");
}

async function loadIntelAndPaint(r: IdentifyResult) {
  $("#aboutText")!.textContent = r.description || "—";
  $("#aboutPills")!.innerHTML = "";

  try {
    const intel = await call<{ destination: string }, DestinationIntel>("getDestinationIntel", {
      destination: r.name,
    });
    paintIntel(intel);
  } catch (e) {
    console.error("intel", e);
    toast("Couldn't load destination intel.", "err");
  }
}

function fmtTemp(c?: number): string {
  if (c == null) return "—";
  return `${Math.round(c)}°`;
}

const WEATHER_CODES: Record<number, string> = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Showers", 81: "Heavy showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunder hail", 99: "Severe thunder",
};

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

function renderForecast(days: DestinationIntel["weather"]) {
  const card = $("#forecastCard");
  const strip = $("#forecastStrip");
  if (!card || !strip) return;
  if (!days?.length) { card.style.display = "none"; return; }
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  strip.innerHTML = days.slice(0, 7).map((d) => {
    const [y, m, dd] = String(d.date).split("-").map(Number);
    const label = dow[new Date(y, (m || 1) - 1, dd || 1).getDay()] || "";
    return `
      <div class="forecast-day">
        <div class="fc-dow">${esc(label)}</div>
        <div class="fc-ico" title="${esc(WEATHER_CODES[d.weatherCode] || "")}">${weatherEmoji(d.weatherCode)}</div>
        <div class="fc-hi">${Math.round(d.tempMaxC)}°</div>
        <div class="fc-lo">${Math.round(d.tempMinC)}°</div>
      </div>`;
  }).join("");
  card.style.display = "";
}

function paintIntel(i: DestinationIntel) {
  lastIntel = i;
  renderForecast(i.weather);
  // Pre-fill the translator's target with the destination's main language,
  // unless the user already typed their own target.
  const mainLang = i.countryFacts?.languages ? Object.values(i.countryFacts.languages)[0] : null;
  const tgt = $<HTMLInputElement>("#translateTarget");
  if (mainLang && tgt && (!tgt.value.trim() || tgt.value.trim() === "German")) tgt.value = mainLang;
  const cc = i.geo?.countryCode || "";
  const today = i.weather?.[0];
  // Show the destination's actual local time when we know its timezone; fall
  // back to the viewer's clock (clearly labelled) only if we don't.
  if (i.timezone?.timezone) {
    const dest = new Date().toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", timeZone: i.timezone.timezone,
    });
    $("#factTime")!.innerHTML = `${esc(dest)} <small>local</small>`;
  } else {
    const myTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    $("#factTime")!.innerHTML = `${esc(myTime)} <small>your time</small>`;
  }
  $("#factWeather")!.innerHTML = today
    ? `${fmtTemp(today.tempMaxC)} <small>${WEATHER_CODES[today.weatherCode] || "—"}</small>`
    : "— <small>no data</small>";
  const currency = i.countryFacts?.currencies ? Object.entries(i.countryFacts.currencies)[0] : null;
  $("#factCurrency")!.innerHTML = currency
    ? `${esc(currency[0])} <small>${esc(currency[1].symbol)} — ${esc(currency[1].name)}</small>`
    : "—";
  const lang = i.countryFacts?.languages ? Object.values(i.countryFacts.languages)[0] : null;
  $("#factLang")!.textContent = lang ? `${lang}` : "—";

  $("#visaPill")!.style.display = "none";

  const pills = $("#aboutPills")!;
  pills.innerHTML = "";
  if (i.airQuality) {
    const aq = i.airQuality;
    const kind = aq.aqi <= 50 ? "good" : aq.aqi <= 100 ? "" : "warn";
    pills.insertAdjacentHTML("beforeend", `<span class="pill ${kind}">Air ${aq.aqi} · ${aq.level}</span>`);
  }
  if (i.carbon) {
    pills.insertAdjacentHTML("beforeend", `<span class="pill">CO₂ ${Math.round(i.carbon.co2Kg)}kg/flight</span>`);
  }

  if (i.wikivoyage?.extract) {
    $("#aboutText")!.textContent = i.wikivoyage.extract.slice(0, 360) + "…";
  }

  const climate = $("#climateList")!;
  climate.innerHTML = "";
  if (i.climate?.length === 12) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const best = [...i.climate].sort((a, b) => Math.abs(22 - a.avgTempC) - Math.abs(22 - b.avgTempC)).slice(0, 3);
    climate.insertAdjacentHTML("beforeend", `<li>Best time: <strong>${best.map((m) => months[m.month - 1]).join(", ")}</strong></li>`);
    const hottest = i.climate.reduce((a, b) => (b.avgTempC > a.avgTempC ? b : a));
    const coldest = i.climate.reduce((a, b) => (b.avgTempC < a.avgTempC ? b : a));
    climate.insertAdjacentHTML("beforeend", `<li>Warmest: ${months[hottest.month - 1]} avg <strong>${Math.round(hottest.avgTempC)}°</strong></li>`);
    climate.insertAdjacentHTML("beforeend", `<li>Coolest: ${months[coldest.month - 1]} avg <strong>${Math.round(coldest.avgTempC)}°</strong></li>`);
  } else {
    climate.insertAdjacentHTML("beforeend", "<li class='tag'>No climate data yet.</li>");
  }

  const customs = $("#customsList")!;
  customs.innerHTML = "";
  if (i.publicHolidays?.length) {
    // Compare on local midnight so a holiday happening today isn't dropped by a
    // UTC-parsed timestamp landing "before" the current instant.
    const todayKey = new Date();
    todayKey.setHours(0, 0, 0, 0);
    const upcoming = i.publicHolidays
      .filter((h) => {
        const [y, m, d] = String(h.date).split("-").map(Number);
        return new Date(y, (m || 1) - 1, d || 1) >= todayKey;
      })
      .slice(0, 4);
    upcoming.forEach((h) => customs.insertAdjacentHTML("beforeend", `<li><strong>${esc(h.date)}</strong> — ${esc(h.localName)} (${esc(h.name)})</li>`));
  }
  if (cc) {
    customs.insertAdjacentHTML("beforeend", `<li>Country code: ${esc(cc)} · Calling +${esc(i.countryFacts?.callingCode?.replace(/\+/g, "") || "—")}</li>`);
  }
  if (!customs.children.length) customs.insertAdjacentHTML("beforeend", "<li class='tag'>No data.</li>");

  const good = $("#goodToKnow")!;
  good.innerHTML = "";
  const s = i.staticFacts;
  if (s.tippingPercent) good.insertAdjacentHTML("beforeend", `<li>Tipping: <strong>${s.tippingPercent}</strong></li>`);
  if (s.plugs) good.insertAdjacentHTML("beforeend", `<li>Plug type: <strong>${s.plugs.join(", ")}</strong> · ${s.voltage || ""}</li>`);
  if (typeof s.tapWaterSafe === "boolean") good.insertAdjacentHTML("beforeend", `<li>Tap water: <strong>${s.tapWaterSafe ? "safe to drink" : "not recommended"}</strong></li>`);
  if (s.driving) good.insertAdjacentHTML("beforeend", `<li>Drive on the <strong>${s.driving}</strong></li>`);
  if (s.emergency) {
    const e = s.emergency;
    const num = e.universal || e.police || e.ambulance || "—";
    good.insertAdjacentHTML("beforeend", `<li>Emergency: <strong>${num}</strong></li>`);
  }
  if (!good.children.length) good.insertAdjacentHTML("beforeend", "<li class='tag'>No data.</li>");

  loadCommunitySynth(currentIdentified?.name || "");

  if (currentIdentified?.iataAirport) {
    $("#airportName")!.textContent = `${currentIdentified.iataAirport} · Nearest major airport`;
    $("#airportInfo")!.innerHTML = `<li>IATA: <strong>${currentIdentified.iataAirport}</strong></li><li class="tag">Live wait times require gate-level data feeds (premium).</li>`;
  }
  const alerts = $("#airportAlerts")!;
  alerts.innerHTML = "";
  if (i.airQuality) {
    const kind = i.airQuality.aqi <= 50 ? "good" : i.airQuality.aqi <= 100 ? "" : "warn";
    alerts.insertAdjacentHTML("beforeend", `<span class="pill ${kind}">Air quality ${i.airQuality.aqi}</span>`);
  }
  if (today) {
    alerts.insertAdjacentHTML("beforeend", `<span class="pill">${WEATHER_CODES[today.weatherCode] || "Weather"} ${Math.round(today.tempMaxC)}°/${Math.round(today.tempMinC)}°</span>`);
  }
}

async function loadCommunitySynth(destination: string) {
  if (!destination) return;
  const pills = $("#scamPills")!;
  const footer = $("#scamFooter")!;
  pills.innerHTML = "";
  footer.textContent = "Loading community tips…";
  try {
    const r = await call<{ location: string }, { synthesized?: { scams?: string[] } }>(
      "scrapeTravelIntelligence",
      { location: destination }
    );
    const scams = r.synthesized?.scams || [];
    scams.slice(0, 5).forEach((s) => pills.insertAdjacentHTML("beforeend", `<span class="pill warn">${esc(s)}</span>`));
    footer.textContent = scams.length ? "Atlas flags these in your live map as you walk." : "No notable scams flagged.";
  } catch {
    footer.textContent = "Community feed unavailable right now.";
  }
}

// ── Flights / Hotels rendering ─────────────────────────────────────────────
async function searchFlights(opts: { from: string; to: string; date: string; passengers?: number; cabinClass?: string }) {
  return call<typeof opts, { results: FlightResult[] }>("searchFlights", opts);
}

function renderFlightQuotes(target: HTMLElement, results: FlightResult[]) {
  target.innerHTML = "";
  if (!results.length) {
    target.insertAdjacentHTML("beforeend", "<div class='empty'>No flights found. Check IATA codes + date.</div>");
    return;
  }
  results.slice(0, 6).forEach((f, i) => {
    const seg = f.segments[0];
    const tag = i === 0 ? "best" : "";
    const stops = f.layovers === 0 ? "Direct" : `${f.layovers} stop${f.layovers > 1 ? "s" : ""}`;
    const html = `
      <a class="quote ${tag}" href="${esc(safeUrl(f.bookingUrl))}" target="_blank" rel="noopener">
        <div class="src"><strong>${esc(seg?.airline || f.source)}</strong> · ${stops}<small>${esc(seg?.from)} → ${esc(seg?.to)} · ${esc(seg?.duration || f.totalDuration)}</small></div>
        <div class="price">${esc(f.currency)} ${Math.round(f.totalPrice)}</div>
      </a>`;
    target.insertAdjacentHTML("beforeend", html);
  });
}

function renderHotels(target: HTMLElement, hotels: HotelResult[]) {
  target.innerHTML = "";
  if (!hotels.length) {
    target.insertAdjacentHTML("beforeend", "<div class='empty'>No hotels found. Try a different city or dates.</div>");
    return;
  }
  hotels.slice(0, 12).forEach((h) => {
    const html = `
      <a class="quote" href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener">
        <div class="src"><strong>${esc(h.name)}</strong>${h.rating ? ` · ${"★".repeat(Math.max(0, Math.min(5, Math.round(h.rating))))}` : ""}<small>${esc(h.source)} · ${esc(h.location)}</small></div>
        <div class="price">${esc(h.currency)} ${Math.round(h.price)}</div>
      </a>`;
    target.insertAdjacentHTML("beforeend", html);
  });
}

interface ExperienceResult {
  id: string; name: string; location?: string; price?: number; currency?: string;
  duration?: string; rating?: number; category?: string; source: string; url?: string;
}
function renderExperiences(target: HTMLElement, items: ExperienceResult[]) {
  target.innerHTML = "";
  if (!items.length) {
    target.insertAdjacentHTML("beforeend", "<div class='empty'>Nothing found here yet. Try a bigger nearby city.</div>");
    return;
  }
  items.slice(0, 18).forEach((x) => {
    const meta = [x.category, x.location].filter(Boolean).map(esc).join(" · ");
    const html = `
      <a class="quote" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">
        <div class="src"><strong>${esc(x.name)}</strong>${x.rating ? ` · ${"★".repeat(Math.max(0, Math.min(5, Math.round(x.rating))))}` : ""}<small>${meta || esc(x.source)}</small></div>
        <div class="price">${x.price ? `${esc(x.currency || "USD")} ${Math.round(x.price)}` : "Free / varies"}</div>
      </a>`;
    target.insertAdjacentHTML("beforeend", html);
  });
}

// Amadeus transfer-offer objects vary; render defensively from common fields.
interface CarResult {
  id?: string;
  vehicle?: { description?: string; category?: string };
  serviceProvider?: { name?: string };
  quotation?: { monetaryAmount?: string; currencyCode?: string };
  start?: { locationCode?: string };
}
function renderCars(target: HTMLElement, cars: CarResult[]) {
  target.innerHTML = "";
  if (!cars.length) {
    target.insertAdjacentHTML("beforeend", "<div class='empty'>No transfers/cars found, or Amadeus isn't configured.</div>");
    return;
  }
  cars.slice(0, 12).forEach((c) => {
    const name = c.vehicle?.description || c.vehicle?.category || c.serviceProvider?.name || "Vehicle";
    const provider = c.serviceProvider?.name || "Provider";
    const price = c.quotation?.monetaryAmount;
    const cur = c.quotation?.currencyCode || "";
    const html = `
      <div class="quote">
        <div class="src"><strong>${esc(name)}</strong><small>${esc(provider)}${c.start?.locationCode ? ` · ${esc(c.start.locationCode)}` : ""}</small></div>
        <div class="price">${price ? `${esc(cur)} ${esc(price)}` : "—"}</div>
      </div>`;
    target.insertAdjacentHTML("beforeend", html);
  });
}

async function searchHotels(opts: { location: string; cityCode?: string; checkIn: string; checkOut: string; guests?: number }) {
  return call<typeof opts, { results: HotelResult[] }>("searchHotels", opts);
}

// ── Tabs ────────────────────────────────────────────────────────────────────
function initTabs() {
  const strip = $(".tab-strip");
  if (!strip) return;
  const btns = Array.from(strip.querySelectorAll<HTMLButtonElement>(".tab-btn"));
  const select = (btn: HTMLButtonElement) => {
    btns.forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    const panel = $(`#t-${btn.dataset.tab}`);
    panel?.classList.add("active");
  };
  btns.forEach((btn, idx) => {
    // Wire up the ARIA relationships screen readers need to announce the tabs.
    btn.setAttribute("role", "tab");
    btn.id = btn.id || `tab-${btn.dataset.tab}`;
    const panel = $(`#t-${btn.dataset.tab}`);
    if (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", btn.id);
    }
    btn.setAttribute("aria-selected", btn.classList.contains("active") ? "true" : "false");
    btn.tabIndex = btn.classList.contains("active") ? 0 : -1;
    btn.addEventListener("click", () => select(btn));
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = btns[(idx + dir + btns.length) % btns.length];
      next.focus();
      select(next);
    });
  });
}

// ── Samples + upload + identify input ──────────────────────────────────────
const SAMPLES: Record<string, { url: string; hint: string }> = {
  beach: { url: "/assets/beach.jpeg", hint: "lifeguard tower, palm trees, ocean" },
  reichstag: { url: "/assets/reichstag.jpeg", hint: "glass cupola, Reichstag Berlin" },
  waterfall: { url: "/assets/waterfall.jpeg", hint: "indoor waterfall, conservatory, Singapore" },
};

function initIdentify() {
  $$<HTMLButtonElement>(".sample").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.id!;
      $$(".sample").forEach((s) => s.classList.toggle("is-active", s === btn));
      const s = SAMPLES[id];
      if (s) identifyFromImage({ url: s.url, hint: s.hint });
    })
  );

  $<HTMLButtonElement>("#identifyBtn")!.addEventListener("click", () => {
    const v = $<HTMLInputElement>("#searchInput")!.value.trim();
    if (!v) {
      toast("Paste an image URL or describe a place.", "info");
      return;
    }
    if (/^https?:\/\//.test(v) && /\.(jpe?g|png|webp|heic)(\?|$)/i.test(v)) {
      identifyFromImage({ url: v });
    } else {
      identifyFromText(v);
    }
  });
  $<HTMLInputElement>("#searchInput")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $<HTMLButtonElement>("#identifyBtn")!.click();
  });

  const drop = $("#uploadDrop")!;
  const fileInput = $<HTMLInputElement>("#fileInput")!;
  // Guard against non-image files (and absurdly large ones) before we waste a
  // base64 encode + an upload round-trip.
  const acceptImage = (f: File): boolean => {
    if (!f.type.startsWith("image/")) { toast("That's not an image file.", "err"); return false; }
    if (f.size > 20 * 1024 * 1024) { toast("Image is over 20MB.", "err"); return false; }
    return true;
  };
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f && acceptImage(f)) identifyFromImage({ file: f });
  });
  ["dragover", "dragenter"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("dragging");
    })
  );
  drop.addEventListener("drop", (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f && acceptImage(f)) identifyFromImage({ file: f });
  });
}

// ── Result panel side-actions ──────────────────────────────────────────────
function initResultActions() {
  $("#openMapsBtn")!.addEventListener("click", () => {
    if (!currentIdentified) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${currentIdentified.lat},${currentIdentified.lon}`;
    window.open(url, "_blank", "noopener");
  });
  $("#shareBtn")!.addEventListener("click", async () => {
    if (!currentIdentified) return;
    const url = location.href.split("#")[0];
    const text = `Atlas identified ${currentIdentified.name}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Atlas", text, url }); } catch { /* dismissed */ }
    } else {
      await navigator.clipboard.writeText(`${text} — ${url}`);
      toast("Link copied", "ok");
    }
  });
  $("#saveToTrip")!.addEventListener("click", async () => {
    const u = realUser();
    if (!u) { openAuth(); return; }
    if (!currentIdentified || !db) return;
    const tripId = doc(collection(db, `users/${u.uid}/trips`)).id;
    await setDoc(doc(db, `users/${u.uid}/trips/${tripId}`), {
      id: tripId,
      name: currentIdentified.name,
      destination: currentIdentified.name,
      cover: $<HTMLImageElement>("#resultImg")!.src,
      countryCode: currentIdentified.countryCode,
      lat: currentIdentified.lat,
      lon: currentIdentified.lon,
      status: "idea",
      createdAt: new Date().toISOString(),
    });
    toast("Saved to your trips", "ok");
  });

  $<HTMLButtonElement>("#flightSearchBtn")!.addEventListener("click", async (ev) => {
    if (!currentIdentified) { toast("Identify a place first.", "info"); return; }
    const from = $<HTMLInputElement>("#originIata")!.value.trim().toUpperCase();
    const date = $<HTMLInputElement>("#flightDate")!.value;
    const to = currentIdentified.iataAirport;
    if (!from || !date || !to) { toast("Need origin IATA, date, and destination must have an airport.", "info"); return; }
    const btn = ev.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    $("#flightsTag")!.textContent = `Searching ${from} → ${to} on ${date}…`;
    $("#flightQuotes")!.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div><div class='skeleton'></div>`;
    try {
      const r = await searchFlights({ from, to, date });
      $("#flightsTag")!.textContent = `Compared ${r.results.length} offers · ${from} → ${to}`;
      renderFlightQuotes($("#flightQuotes")!, r.results);
    } catch (e) {
      toast(`Flight search failed: ${(e as Error).message}`, "err");
      $("#flightsTag")!.textContent = "Search failed.";
      $("#flightQuotes")!.innerHTML = "";
    } finally {
      btn.disabled = false;
    }
  });

  $<HTMLButtonElement>("#visaCheckBtn")!.addEventListener("click", async () => {
    if (!currentIdentified) return;
    const passport = $<HTMLInputElement>("#passportInput")!.value.trim().toUpperCase();
    if (!passport) { toast("Enter passport country code (e.g. US).", "info"); return; }
    try {
      const r = await call<{ destination: string; passportCC: string }, DestinationIntel>(
        "getDestinationIntel",
        { destination: currentIdentified.name, passportCC: passport }
      );
      if (r.visa) {
        $("#visaText")!.innerHTML = `<strong>${esc(r.visa.status)}</strong>${r.visa.durationDays ? ` · ${esc(r.visa.durationDays)} days` : ""}${r.visa.notes ? ` — ${esc(r.visa.notes)}` : ""}`;
        const pill = $("#visaPill")!;
        pill.style.display = "inline-flex";
        pill.textContent = `${r.visa.status}${r.visa.durationDays ? ` · ${r.visa.durationDays}d` : ""} (${passport})`;
      } else {
        $("#visaText")!.textContent = "Couldn't fetch visa data. VisaDB key may be missing.";
      }
    } catch (e) {
      toast(`Visa lookup failed: ${(e as Error).message}`, "err");
    }
  });
}

// ── Bookings page ──────────────────────────────────────────────────────────
function initBookings() {
  $<HTMLFormElement>("#flightForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const out = $("#bookingResults")!;
    out.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div><div class='skeleton'></div>`;
    try {
      const r = await searchFlights({
        from: String(fd.get("from")).toUpperCase(),
        to: String(fd.get("to")).toUpperCase(),
        date: String(fd.get("date")),
        passengers: Number(fd.get("passengers")) || 1,
        cabinClass: String(fd.get("cabinClass")),
      });
      renderFlightQuotes(out, r.results);
    } catch (err) {
      out.innerHTML = `<div class='empty'>${esc((err as Error).message)}</div>`;
    }
  });

  $<HTMLFormElement>("#hotelForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const out = $("#hotelResults")!;
    out.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div><div class='skeleton'></div>`;
    try {
      const r = await searchHotels({
        location: String(fd.get("location")),
        cityCode: String(fd.get("cityCode") || "").toUpperCase() || undefined,
        checkIn: String(fd.get("checkIn")),
        checkOut: String(fd.get("checkOut")),
        guests: Number(fd.get("guests")) || 2,
      });
      renderHotels(out, r.results);
    } catch (err) {
      out.innerHTML = `<div class='empty'>${esc((err as Error).message)}</div>`;
    }
  });

  $<HTMLFormElement>("#carForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const out = $("#carResults")!;
    out.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div>`;
    try {
      const r = await call<{ pickupCode: string; pickupDate: string; dropoffDate: string }, { results: CarResult[] }>(
        "searchCars",
        {
          pickupCode: String(fd.get("cityCode")).toUpperCase(),
          pickupDate: String(fd.get("pickUp")),
          dropoffDate: String(fd.get("dropOff")),
        }
      );
      renderCars(out, r.results || []);
    } catch (err) {
      out.innerHTML = `<div class='empty'>${esc((err as Error).message)}</div>`;
    }
  });

  $<HTMLFormElement>("#experienceForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const out = $("#experienceResults")!;
    out.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div>`;
    try {
      const r = await call<{ location: string; date?: string }, { results: ExperienceResult[] }>(
        "searchExperiences",
        { location: String(fd.get("location")), date: String(fd.get("date") || "") || undefined }
      );
      renderExperiences(out, r.results || []);
    } catch (err) {
      out.innerHTML = `<div class='empty'>${esc((err as Error).message)}</div>`;
    }
  });
}

// ── Airports page ──────────────────────────────────────────────────────────
function initAirports() {
  $("#airportLookup")!.addEventListener("click", async () => {
    const code = $<HTMLInputElement>("#airportInput")!.value.trim().toUpperCase();
    if (!code) return;
    const panel = $("#airportPanel")!;
    panel.innerHTML = `<div class='skeleton'></div>`;
    try {
      const intel = await call<{ destination: string }, DestinationIntel>("getDestinationIntel", {
        destination: code,
      });
      panel.innerHTML = `
        <div class="insight-card">
          <h4>${esc(code)}</h4>
          <ul>
            ${intel.geo ? `<li>Coordinates: ${intel.geo.lat.toFixed(3)}, ${intel.geo.lon.toFixed(3)}</li>` : ""}
            ${intel.weather?.[0] ? `<li>Today: ${esc(WEATHER_CODES[intel.weather[0].weatherCode] || "")} · ${Math.round(intel.weather[0].tempMaxC)}°/${Math.round(intel.weather[0].tempMinC)}°</li>` : ""}
            ${intel.airQuality ? `<li>Air quality: ${intel.airQuality.aqi} · ${esc(intel.airQuality.level)}</li>` : ""}
            <li class='tag'>Live gate / wait-time data requires a partnership feed (premium).</li>
          </ul>
        </div>`;
    } catch (e) {
      panel.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
    }
  });
}

// ── Visas page ─────────────────────────────────────────────────────────────
function initVisas() {
  $("#visaSearchBtn")!.addEventListener("click", async () => {
    const pp = $<HTMLInputElement>("#visaPassport")!.value.trim().toUpperCase();
    const dst = $<HTMLInputElement>("#visaDest")!.value.trim().toUpperCase();
    if (!pp || !dst) { toast("Enter both passport and destination ISO codes.", "info"); return; }
    const panel = $("#visaPanel")!;
    panel.innerHTML = `<div class='skeleton'></div>`;
    try {
      const r = await call<{ destination: string; passportCC: string }, DestinationIntel>(
        "getDestinationIntel",
        { destination: dst, passportCC: pp }
      );
      const visa = r.visa;
      const facts = r.countryFacts;
      const stat = r.staticFacts;
      panel.innerHTML = `
        <div class="insight-card">
          <h4>Visa for ${esc(pp)} passport → ${esc(dst)}</h4>
          <p>${visa ? `<strong>${esc(visa.status)}</strong>${visa.durationDays ? ` · up to ${esc(visa.durationDays)} days` : ""}${visa.notes ? ` — ${esc(visa.notes)}` : ""}` : "VisaDB data unavailable. Check official embassy site."}</p>
        </div>
        <div class="insight-card" style="margin-top:12px">
          <h4>Country</h4>
          <ul>
            ${facts ? `<li><strong>${esc(facts.name)}</strong> · capital ${esc(facts.capital?.[0] || "—")}</li>` : ""}
            ${facts?.callingCode ? `<li>Calling code: ${esc(facts.callingCode)}</li>` : ""}
            ${stat.plugs ? `<li>Plugs: ${esc(stat.plugs.join(", "))} · ${esc(stat.voltage)}</li>` : ""}
            ${stat.tippingPercent ? `<li>Tipping: ${esc(stat.tippingPercent)}</li>` : ""}
            ${stat.emergency ? `<li>Emergency: ${esc(stat.emergency.universal || stat.emergency.police || "—")}</li>` : ""}
            ${typeof stat.tapWaterSafe === "boolean" ? `<li>Tap water: ${stat.tapWaterSafe ? "safe" : "not recommended"}</li>` : ""}
          </ul>
        </div>
        ${r.publicHolidays?.length ? `<div class="insight-card" style="margin-top:12px"><h4>Upcoming holidays</h4><ul>${r.publicHolidays.slice(0,6).map(h => `<li>${esc(h.date)} — ${esc(h.localName)}</li>`).join("")}</ul></div>` : ""}`;
    } catch (e) {
      panel.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
    }
  });
}

// ── Translate ──────────────────────────────────────────────────────────────
async function runTranslate() {
  const text = $<HTMLInputElement>("#translateText")!.value.trim();
  const target = $<HTMLInputElement>("#translateTarget")!.value.trim();
  if (!text || !target) return;
  const panel = $("#translatePanel")!;
  panel.innerHTML = `<div class='skeleton'></div>`;
  try {
    const r = await call<{ text: string; target: string }, {
      translation: string; pronunciation?: string; literal?: string; formality?: string; notes?: string;
    }>("translatePhrase", { text, target });
    panel.innerHTML = `
      <div class="insight-card">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
          <h4 style="margin:0">${esc(target)}</h4>
          <button class="copy-btn" id="copyTranslation" data-copy="${esc(r.translation)}">Copy</button>
        </div>
        <p class="serif" style="font-size:24px;line-height:1.2;margin-top:8px">${esc(r.translation)}</p>
        ${r.pronunciation ? `<p style="margin-top:8px"><span class="tag">Pronunciation</span> ${esc(r.pronunciation)}</p>` : ""}
        ${r.literal ? `<p style="margin-top:8px"><span class="tag">Literal</span> ${esc(r.literal)}</p>` : ""}
        ${r.formality ? `<p style="margin-top:8px"><span class="tag">Register</span> ${esc(r.formality)}</p>` : ""}
        ${r.notes ? `<p style="margin-top:8px"><span class="tag">Notes</span> ${esc(r.notes)}</p>` : ""}
      </div>`;
    $("#copyTranslation")?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget as HTMLButtonElement;
      try { await navigator.clipboard.writeText(btn.dataset.copy || ""); btn.textContent = "Copied ✓"; setTimeout(() => { btn.textContent = "Copy"; }, 1500); }
      catch { toast("Copy failed", "err"); }
    });
  } catch (e) {
    panel.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

function initTranslate() {
  $("#translateBtn")!.addEventListener("click", runTranslate);
  $<HTMLInputElement>("#translateText")!.addEventListener("keydown", (e) => { if (e.key === "Enter") runTranslate(); });
  // Quick-phrase chips: prefill the input and translate immediately.
  $$<HTMLElement>(".phrase-preset").forEach((p) =>
    p.addEventListener("click", () => {
      $<HTMLInputElement>("#translateText")!.value = p.textContent || "";
      runTranslate();
    })
  );
}

// ── Community ──────────────────────────────────────────────────────────────
function initCommunity() {
  $("#communityBtn")!.addEventListener("click", async () => {
    const dest = $<HTMLInputElement>("#communityDest")!.value.trim();
    if (!dest) return;
    const panel = $("#communityPanel")!;
    panel.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div>`;
    try {
      const r = await call<{ location: string }, {
        reddit: Array<{ title: string; url: string; score: number }>;
        youtube: Array<{ title: string; url: string; channel: string }>;
        synthesized?: { scams?: string[]; transportation?: string[]; simCards?: string[]; culture?: string[]; safety?: string[] };
      }>("scrapeTravelIntelligence", { location: dest });
      const s = r.synthesized || {};
      const renderList = (title: string, items?: string[]) => items?.length
        ? `<div class="insight-card"><h4>${esc(title)}</h4><ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>` : "";
      panel.innerHTML = `
        ${renderList("Scams to dodge", s.scams)}
        ${renderList("Transportation tips", s.transportation)}
        ${renderList("SIM cards", s.simCards)}
        ${renderList("Culture", s.culture)}
        ${renderList("Safety", s.safety)}
        ${r.reddit?.length ? `<div class="insight-card"><h4>Top Reddit threads</h4><ul>${r.reddit.slice(0,5).map((p) => `<li><a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">${esc(p.title)}</a> · ${Number(p.score) || 0} pts</li>`).join("")}</ul></div>` : ""}
        ${r.youtube?.length ? `<div class="insight-card"><h4>Travel videos</h4><ul>${r.youtube.slice(0,5).map((v) => `<li><a href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener">${esc(v.title)}</a> · ${esc(v.channel)}</li>`).join("")}</ul></div>` : ""}`;
    } catch (e) {
      panel.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
    }
  });
}

// ── Itinerary form + view ──────────────────────────────────────────────────
interface ItineraryActivity {
  time: string; title: string; description: string; category: string;
  location?: { name: string; lat: number; lon: number };
  durationMin: number;
  estimatedCost?: { amount: number; currency: string };
  poiId?: string;
}
interface ItineraryDay {
  day: number; date: string; theme: string;
  activities: ItineraryActivity[];
  estimatedDailyCost: number; notes?: string;
}
interface Itinerary {
  id: string; destination: string; startDate: string; endDate: string;
  travelers: number; days: ItineraryDay[];
  totalEstimatedCost: number; currency: string;
}

let currentItinerary: Itinerary | null = null;
// Live Firestore subscriptions we must be able to cancel before re-subscribing.
let watchListUnsub: (() => void) | null = null;
let tripRailUnsub: (() => void) | null = null;

function openItinForm() {
  const f = $<HTMLFormElement>("#itinForm")!;
  if (currentIdentified) {
    (f.elements.namedItem("destination") as HTMLInputElement).value = currentIdentified.name;
  }
  const today = new Date();
  const end = new Date(today); end.setDate(end.getDate() + 4);
  if (!(f.elements.namedItem("startDate") as HTMLInputElement).value) {
    (f.elements.namedItem("startDate") as HTMLInputElement).value = today.toISOString().slice(0,10);
    (f.elements.namedItem("endDate") as HTMLInputElement).value = end.toISOString().slice(0,10);
  }
  openSheet("itinFormSheet");
}

function initItin() {
  $<HTMLFormElement>("#itinForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!realUser()) { closeSheet("itinFormSheet"); openAuth(); return; }
    const fd = new FormData(e.target as HTMLFormElement);
    closeSheet("itinFormSheet");
    toast("Generating itinerary — ~15 seconds…", "info");
    try {
      const r = await call<unknown, Itinerary>("generateAIItinerary", {
        destination: String(fd.get("destination")),
        startDate: String(fd.get("startDate")),
        endDate: String(fd.get("endDate")),
        travelers: Number(fd.get("travelers")) || 1,
        budgetTier: String(fd.get("budgetTier")),
        currency: String(fd.get("currency") || "USD").toUpperCase(),
        interests: String(fd.get("interests")).split(",").map((s) => s.trim()).filter(Boolean),
        pace: String(fd.get("pace")),
      });
      currentItinerary = r;
      paintItinerary(r);
      openSheet("itinViewSheet");
      toast(`Itinerary ready: ${r.days.length} days.`, "ok");
    } catch (err) {
      toast(`Generation failed: ${(err as Error).message}`, "err");
    }
  });

  $("#exportIcsBtn")!.addEventListener("click", () => {
    if (!currentItinerary) return;
    const events: ICSEvent[] = [];
    let seq = 0;
    for (const day of currentItinerary.days) {
      for (const a of day.activities) {
        const [hh, mm] = (a.time || "09:00").split(":").map(Number);
        // Build the start from local Y/M/D + H/M so the calendar entry lands on
        // the intended day in every timezone (a bare `new Date("2026-06-15")`
        // is parsed as UTC midnight and can roll back a day west of UTC).
        const [y, m, d] = String(day.date).split("-").map(Number);
        const start = new Date(y, (m || 1) - 1, d || 1, hh || 9, mm || 0, 0, 0);
        const end = new Date(start.getTime() + (a.durationMin || 60) * 60000);
        events.push({
          // seq guarantees a unique UID even for two activities at the same time.
          uid: `${currentItinerary.id}-${day.day}-${(a.time || "0900").replace(/\D/g, "")}-${seq++}@atlas`,
          title: a.title,
          description: a.description,
          location: a.location?.name,
          start, end,
          geo: a.location ? { lat: a.location.lat, lon: a.location.lon } : undefined,
        });
      }
    }
    if (!events.length) return;
    downloadICS(events, `${currentItinerary.destination.replace(/\s+/g, "-")}.ics`);
    toast("Calendar exported", "ok");
  });

  $("#packingBtn")!.addEventListener("click", async () => {
    if (!currentItinerary) return;
    toast("Generating packing list…", "info");
    try {
      const r = await call<unknown, { list: Array<{ category: string; items: string[] }> }>(
        "generateAIPackingList",
        {
          destination: currentItinerary.destination,
          startDate: currentItinerary.startDate,
          endDate: currentItinerary.endDate,
          weatherSummary: packingWeatherSummary(),
          activities: currentItinerary.days.flatMap((d) => d.activities.map((a) => a.category)),
        }
      );
      const html = r.list.map((c) =>
        `<div class="insight-card" style="margin-bottom:8px"><h4>${esc(c.category)}</h4><ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`
      ).join("");
      const body = $("#itinViewBody")!;
      body.insertAdjacentHTML("afterbegin", `<details open style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:600;padding:6px 0">Packing list</summary><div style="margin-top:8px">${html}</div></details>`);
    } catch (e) {
      toast(`Packing list failed: ${(e as Error).message}`, "err");
    }
  });
}

// Build a short weather description for the packing-list prompt from the most
// recent destination intel, instead of a hardcoded placeholder.
function packingWeatherSummary(): string {
  const i = lastIntel;
  if (!i) return "varied climate";
  const today = i.weather?.[0];
  const parts: string[] = [];
  if (today) {
    parts.push(`currently ~${Math.round(today.tempMaxC)}°/${Math.round(today.tempMinC)}°C, ${WEATHER_CODES[today.weatherCode] || "mixed"}`);
  }
  if (i.climate?.length === 12) {
    const hi = Math.round(Math.max(...i.climate.map((m) => m.avgTempC)));
    const lo = Math.round(Math.min(...i.climate.map((m) => m.avgTempC)));
    parts.push(`yearly avg ${lo}–${hi}°C`);
  }
  return parts.length ? parts.join("; ") : "varied climate";
}

function paintItinerary(it: Itinerary) {
  $("#itinViewTitle")!.textContent = `${it.destination} · ${it.days.length} days`;
  const body = $("#itinViewBody")!;
  body.innerHTML = "";
  body.insertAdjacentHTML("beforeend", `<p style="color:var(--ink-2);margin-bottom:18px">Total estimated cost: <strong>${it.currency} ${Math.round(it.totalEstimatedCost)}</strong></p>`);
  for (const day of it.days) {
    const acts = day.activities.map((a) => `
      <div class="act">
        <div class="t">${esc(a.time || "—")}</div>
        <div class="info"><h6>${esc(a.title)}</h6><p>${esc(a.description)}${a.location ? ` <a href="https://www.google.com/maps/search/?api=1&query=${a.location.lat},${a.location.lon}" target="_blank" rel="noopener" style="color:var(--clay)">map</a>` : ""}</p></div>
        <div class="cost">${a.estimatedCost ? `${esc(a.estimatedCost.currency)} ${Math.round(a.estimatedCost.amount)}` : ""}</div>
      </div>`).join("");
    body.insertAdjacentHTML("beforeend", `
      <div class="day">
        <h5>Day ${day.day} — ${esc(day.theme)}</h5>
        <div class="meta">${esc(day.date)} · est. ${esc(it.currency)} ${Math.round(day.estimatedDailyCost)}${day.notes ? ` · ${esc(day.notes)}` : ""}</div>
        <div class="acts">${acts}</div>
      </div>`);
  }
}

// List previously generated itineraries (persisted by generateAIItinerary) and
// let the user re-open any of them without paying for a fresh generation.
async function refreshItineraries() {
  const body = $("#itinListBody")!;
  const u = realUser();
  if (!u) { body.innerHTML = "<div class='empty'>Sign in to see your saved itineraries.</div>"; return; }
  body.innerHTML = "<div class='skeleton'></div>";
  try {
    const list = await getDocsOnce<Itinerary>(`users/${u.uid}/itineraries`);
    if (!list.length) { body.innerHTML = "<div class='empty'>No itineraries yet. Generate one from Plan an itinerary.</div>"; return; }
    // Newest first when a sortable startDate exists.
    list.sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
    body.innerHTML = list.map((it, i) => `
      <button class="quote itin-open" data-itin="${i}" style="width:100%;text-align:left;background:none;border:1px solid var(--line);cursor:pointer">
        <div class="src"><strong>${esc(it.destination)}</strong><small>${esc(it.days?.length || 0)} days · ${esc(it.startDate || "")}${it.endDate ? `–${esc(it.endDate)}` : ""}</small></div>
        <div class="price">${esc(it.currency || "")} ${Math.round(it.totalEstimatedCost || 0)}</div>
      </button>`).join("");
    body.querySelectorAll<HTMLButtonElement>("[data-itin]").forEach((b) =>
      b.addEventListener("click", () => {
        const it = list[Number(b.dataset.itin)];
        if (!it) return;
        currentItinerary = it;
        paintItinerary(it);
        closeSheet("itinListSheet");
        openSheet("itinViewSheet");
      })
    );
  } catch (e) {
    body.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

// ── Price watchlist ────────────────────────────────────────────────────────
interface PriceWatch {
  id: string; kind: "flight" | "hotel";
  from?: string; to?: string; date?: string; passengers?: number;
  location?: string; checkIn?: string; checkOut?: string; guests?: number;
  threshold?: number; currency: string;
  lastPrice?: number; lowestPrice?: number;
  active: boolean; createdAt: string;
}

async function refreshWatchList() {
  const body = $("#watchBody")!;
  const u = realUser();
  if (!u || !db) {
    body.innerHTML = `<div class='empty'>Sign in to create price watches.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="booking-form" style="grid-template-columns:1fr 1fr 1fr auto">
      <label>Kind<select id="watchKind"><option value="flight">Flight</option><option value="hotel">Hotel</option></select></label>
      <label>From / Location<input id="watchA" placeholder="JFK or 'Berlin'"></label>
      <label>To<input id="watchB" placeholder="BER"></label>
      <label>Date / Check-in<input type="date" id="watchDate"></label>
      <label>Threshold<input type="number" id="watchThreshold" placeholder="500"></label>
      <label>Currency<input id="watchCur" value="USD" maxlength="3" style="text-transform:uppercase"></label>
      <button class="btn clay" id="watchCreate" style="grid-column:1 / -1">Add watch</button>
    </div>
    <div id="watchListItems" style="margin-top:16px"><div class="skeleton"></div></div>`;
  $("#watchCreate")!.addEventListener("click", createWatchFromForm);

  const uid = u.uid;
  const q = query(collection(db, `users/${uid}/priceWatches`), orderBy("createdAt", "desc"), limit(50));
  // Tear down any previous subscription so re-opening the sheet doesn't stack
  // duplicate listeners that all write to the DOM.
  watchListUnsub?.();
  watchListUnsub = onSnapshot(q, (snap) => {
    const list = $("#watchListItems")!;
    if (snap.empty) { list.innerHTML = "<div class='empty'>No watches yet.</div>"; return; }
    list.innerHTML = "";
    snap.docs.forEach((d) => {
      const w = d.data() as PriceWatch;
      const summary = w.kind === "flight"
        ? `${esc(w.from)} → ${esc(w.to)} · ${esc(w.date)}`
        : `${esc(w.location)} · ${esc(w.checkIn)}–${esc(w.checkOut)}`;
      list.insertAdjacentHTML("beforeend", `
        <div class="quote" style="justify-content:space-between">
          <div class="src"><strong>${esc(w.kind)}</strong> · ${summary}<small>${w.lastPrice ? `Last ${esc(w.currency)} ${Math.round(w.lastPrice)}` : "no data yet"} ${w.threshold ? `· alert ≤ ${esc(w.currency)} ${esc(w.threshold)}` : ""}</small></div>
          <button class="btn ghost sm" data-watch-del="${esc(w.id)}">Remove</button>
        </div>`);
    });
    list.querySelectorAll<HTMLButtonElement>("[data-watch-del]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = btn.dataset.watchDel!;
        try { await call("deletePriceWatch", { id }); toast("Watch removed", "ok"); } catch (e) { toast((e as Error).message, "err"); }
      })
    );
  });
}

async function createWatchFromForm() {
  const kind = $<HTMLSelectElement>("#watchKind")!.value as "flight" | "hotel";
  const a = $<HTMLInputElement>("#watchA")!.value.trim();
  const b = $<HTMLInputElement>("#watchB")!.value.trim();
  const date = $<HTMLInputElement>("#watchDate")!.value;
  const threshold = Number($<HTMLInputElement>("#watchThreshold")!.value) || undefined;
  const currency = $<HTMLInputElement>("#watchCur")!.value.toUpperCase() || "USD";
  if (!a) { toast("Enter origin/location", "info"); return; }
  const fcmToken = await ensureFcmToken();
  try {
    // For hotels, default a 1-night stay so check-out is after check-in rather
    // than a zero-duration window the price API would reject.
    let checkOut = date;
    if (kind === "hotel" && date) {
      const [y, m, d] = date.split("-").map(Number);
      const next = new Date(y, (m || 1) - 1, (d || 1) + 1);
      checkOut = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    }
    const payload = kind === "flight"
      ? { kind, from: a.toUpperCase(), to: b.toUpperCase(), date, threshold, currency, passengers: 1, fcmToken }
      : { kind, location: a, checkIn: date, checkOut, threshold, currency, guests: 2, fcmToken };
    await call("createPriceWatch", payload);
    toast("Watch created — Atlas will check hourly.", "ok");
  } catch (e) {
    toast(`Watch failed: ${(e as Error).message}`, "err");
  }
}

// ── eSIM ───────────────────────────────────────────────────────────────────
interface AiraloPackage { id: string; price: number; day: number; data: string; short_info: string; }

async function loadEsimPackages(code: string) {
  const body = $("#esimBody")!;
  if (!code) { body.innerHTML = "<div class='empty'>Need a country code.</div>"; return; }
  body.innerHTML = `<div class='skeleton'></div><div class='skeleton'></div>`;
  try {
    const r = await call<{ countryCode: string }, { packages: AiraloPackage[]; affiliateUrl: string | null }>(
      "listEsimPackages",
      { countryCode: code.toUpperCase() }
    );
    if (!r.packages.length && r.affiliateUrl) {
      body.innerHTML = `<div class="insight-card"><h4>Browse Airalo directly</h4><p><a class="btn clay" href="${esc(safeUrl(r.affiliateUrl))}" target="_blank" rel="noopener">Open Airalo · ${esc(code.toUpperCase())}</a></p></div>`;
      return;
    }
    if (!r.packages.length) { body.innerHTML = "<div class='empty'>No packages found.</div>"; return; }
    body.innerHTML = r.packages.slice(0, 12).map((p) => `
      <a class="quote" href="${esc(safeUrl(r.affiliateUrl))}" target="_blank" rel="noopener">
        <div class="src"><strong>${esc(p.short_info || p.data)}</strong><small>${esc(p.data)} · ${esc(p.day)} days</small></div>
        <div class="price">USD ${esc(p.price)}</div>
      </a>`).join("");
  } catch (e) {
    body.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

async function refreshEsim() {
  const body = $("#esimBody")!;
  const code = currentIdentified?.countryCode || "";
  if (code) { loadEsimPackages(code); return; }
  // No place identified yet — render an inline, accessible country-code field
  // instead of a blocking, unstyled, often-popup-blocked window.prompt().
  body.innerHTML = `
    <div class="booking-form" style="grid-template-columns:1fr auto">
      <label>Destination country code
        <input id="esimCodeInput" placeholder="e.g. JP" maxlength="2" style="text-transform:uppercase" autocomplete="off">
      </label>
      <button class="btn clay" id="esimCodeBtn" style="align-self:end">Find eSIMs</button>
    </div>`;
  const run = () => {
    const v = $<HTMLInputElement>("#esimCodeInput")!.value.trim();
    if (v) loadEsimPackages(v);
  };
  $("#esimCodeBtn")!.addEventListener("click", run);
  $<HTMLInputElement>("#esimCodeInput")!.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
}

// ── Currency converter ──────────────────────────────────────────────────────
let fxBound = false;
function initFxOnce() {
  if (fxBound) return;
  fxBound = true;
  const run = async () => {
    const amount = Number($<HTMLInputElement>("#fxAmount")!.value);
    const from = $<HTMLInputElement>("#fxFrom")!.value.trim().toUpperCase();
    const to = $<HTMLInputElement>("#fxTo")!.value.trim().toUpperCase();
    const out = $("#fxResult")!;
    if (!from || !to || !amount || amount <= 0) { out.innerHTML = "<div class='empty'>Enter an amount and two 3-letter currency codes.</div>"; return; }
    out.innerHTML = "<div class='skeleton'></div>";
    try {
      const r = await call<{ from: string; to: string; amount: number }, { rate: number; converted: number }>(
        "convertCurrency", { from, to, amount }
      );
      out.innerHTML = `
        <div class="insight-card">
          <p class="serif" style="font-size:28px;line-height:1.1">${esc(amount)} ${esc(from)} = <strong>${r.converted.toFixed(2)} ${esc(to)}</strong></p>
          <p style="margin-top:8px;color:var(--ink-2)">1 ${esc(from)} = ${r.rate.toFixed(4)} ${esc(to)}</p>
        </div>`;
    } catch (e) {
      out.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
    }
  };
  $("#fxConvert")!.addEventListener("click", run);
  ["fxAmount", "fxFrom", "fxTo"].forEach((id) =>
    $<HTMLInputElement>(`#${id}`)!.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); })
  );
  run(); // show an initial conversion immediately
}

// ── Document vault ─────────────────────────────────────────────────────────
const vault = new DocumentVault();

async function refreshVaultList() {
  const list = $("#vaultList")!;
  if (!realUser()) { list.innerHTML = "<div class='empty'>Sign in to use the vault.</div>"; return; }
  list.innerHTML = `<div class='skeleton'></div>`;
  try {
    const items = await vault.list();
    if (!items.length) { list.innerHTML = "<div class='empty'>No documents yet.</div>"; return; }
    list.innerHTML = items.map((m) => `
      <div class="quote" style="justify-content:space-between">
        <div class="src"><strong>${esc(m.name)}</strong><small>${esc(m.kind)} · ${(m.size / 1024).toFixed(1)} KB · ${new Date(m.createdAt).toLocaleDateString()}</small></div>
        <button class="btn ghost sm" data-vault-get="${esc(m.id)}">Open</button>
        <button class="btn ghost sm" data-vault-del="${esc(m.id)}">Delete</button>
      </div>`).join("");
    list.querySelectorAll<HTMLButtonElement>("[data-vault-get]").forEach((b) =>
      b.addEventListener("click", () => downloadVault(b.dataset.vaultGet!))
    );
    list.querySelectorAll<HTMLButtonElement>("[data-vault-del]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!(await uiConfirm("Delete document?", "This permanently removes the encrypted file. It cannot be undone.", "Delete"))) return;
        await vault.delete(b.dataset.vaultDel!);
        refreshVaultList();
      })
    );
  } catch (e) {
    list.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

async function downloadVault(id: string) {
  const pass = await uiPrompt("Decrypt document", "Passphrase for this document", "password");
  if (!pass) return;
  try {
    const { blob, meta } = await vault.download(id, pass);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = meta.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Decrypted", "ok");
  } catch (e) {
    toast((e as Error).message, "err");
  }
}

function initVaultForm() {
  $("#vaultUpload")!.addEventListener("click", async () => {
    if (!realUser()) { closeSheet("vaultSheet"); openAuth(); return; }
    const fileEl = $<HTMLInputElement>("#vaultFile")!;
    const passEl = $<HTMLInputElement>("#vaultPass")!;
    const kindEl = $<HTMLSelectElement>("#vaultKind")!;
    const f = fileEl.files?.[0];
    const pass = passEl.value;
    if (!f) { toast("Pick a file", "info"); return; }
    if (pass.length < 8) { toast("Passphrase needs 8+ chars", "info"); return; }
    try {
      await vault.upload(f, pass, kindEl.value as DocKind);
      fileEl.value = ""; passEl.value = "";
      toast("Uploaded & encrypted", "ok");
      refreshVaultList();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  });
}

// silence unused VaultDocMeta import warning by re-exporting type
export type { VaultDocMeta };

// ── FCM push ───────────────────────────────────────────────────────────────
let fcmTokenCache: string | null = null;
let fcmMessageListenerRegistered = false;

async function ensureFcmToken(): Promise<string | undefined> {
  if (fcmTokenCache) return fcmTokenCache;
  if (!app || !auth?.currentUser) return undefined;
  try {
    if (!(await fcmSupported())) return undefined;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return undefined;
    if (!("serviceWorker" in navigator)) return undefined;
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return undefined;
    fcmTokenCache = token;
    if (db && auth.currentUser) {
      await setDoc(doc(db, `users/${auth.currentUser.uid}/fcmTokens/${token.slice(0, 32)}`), {
        token, createdAt: new Date().toISOString(), userAgent: navigator.userAgent,
      });
    }
    // Register the foreground-message handler exactly once. ensureFcmToken can
    // run on every auth change / watch creation; without this guard each call
    // stacks another listener and a single push fires N toasts.
    if (!fcmMessageListenerRegistered) {
      fcmMessageListenerRegistered = true;
      onMessage(messaging, (payload) => {
        const t = payload.notification?.title || "Atlas";
        const b = payload.notification?.body || "";
        toast(`${t} — ${b}`, "ok");
      });
    }
    return token;
  } catch (e) {
    console.warn("FCM init failed", e);
    return undefined;
  }
}

// ── Assistant ──────────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "model"; text: string };
const chatHistory: ChatMsg[] = [];

function appendMsg(role: "you" | "bot", text: string) {
  const body = $("#assistBody")!;
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  return el;
}

function markMsgError(el: HTMLElement, text: string) {
  el.classList.add("err");
  el.textContent = `⚠ ${text}`;
}

function initAssistant() {
  const panel = $("#assistPanel")!;
  $("#assistantBtn")!.addEventListener("click", () => panel.classList.toggle("is-open"));
  $("#closeAssist")!.addEventListener("click", () => panel.classList.remove("is-open"));

  $$<HTMLSpanElement>(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      $<HTMLInputElement>("#assistInput")!.value = c.textContent || "";
      $<HTMLInputElement>("#assistInput")!.focus();
    })
  );

  $<HTMLFormElement>("#assistForm")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>("#assistInput")!;
    const v = input.value.trim();
    if (!v) return;
    input.value = "";
    appendMsg("you", v);
    const thinking = appendMsg("bot", "…");
    try {
      const context = currentIdentified
        ? {
            destination: currentIdentified.name,
            lat: currentIdentified.lat,
            lon: currentIdentified.lon,
            countryCode: currentIdentified.countryCode,
          }
        : undefined;
      // Send the existing (complete, alternating) history + this message. Only
      // commit the user+model pair to history on success, so a failed turn
      // doesn't leave a dangling user message that breaks the next request.
      const r = await call<{ history: ChatMsg[]; message: string; context: unknown }, { reply: string }>(
        "chatWithAssistant",
        { history: chatHistory.slice(), message: v, context }
      );
      thinking.textContent = r.reply;
      chatHistory.push({ role: "user", text: v });
      chatHistory.push({ role: "model", text: r.reply });
    } catch (err) {
      markMsgError(thinking, (err as Error).message);
    }
  });
}

// ── Auth ───────────────────────────────────────────────────────────────────
function openAuth() {
  $("#authModal")!.classList.add("is-open");
}
function closeAuth() {
  $("#authModal")!.classList.remove("is-open");
}

function initAuth() {
  $("#signInBtn")!.addEventListener("click", openAuth);
  $("#footerSignIn")!.addEventListener("click", (e) => { e.preventDefault(); openAuth(); });
  $("#authClose")!.addEventListener("click", closeAuth);
  $("#authModal")!.addEventListener("click", (e) => {
    if (e.target === $("#authModal")) closeAuth();
  });

  if (!auth) return;
  const providers = {
    google: new GoogleAuthProvider(),
    facebook: new FacebookAuthProvider(),
    apple: new OAuthProvider("apple.com"),
  };
  $("#authGoogle")!.addEventListener("click", () => signInWithPopup(auth, providers.google).then(closeAuth).catch((e) => toast(e.message, "err")));
  $("#authApple")!.addEventListener("click", () => signInWithPopup(auth, providers.apple).then(closeAuth).catch((e) => toast(e.message, "err")));
  $("#authFacebook")!.addEventListener("click", () => signInWithPopup(auth, providers.facebook).then(closeAuth).catch((e) => toast(e.message, "err")));
  $("#signedInMenu")!.addEventListener("click", async () => {
    if (await uiConfirm("Sign out?", undefined, "Sign out")) await signOut(auth);
  });

  onAuthStateChanged(auth, (u) => {
    paintUser(u);
    // Backend callable functions now require an auth context (so a stranger
    // can't drain our Gemini/booking quotas with curl). Give anonymous visitors
    // a throwaway identity so the landing-page "Identify" still works before
    // they choose to sign in. Best-effort: needs Anonymous auth enabled in the
    // Firebase console; if it's off this fails quietly and the gated features
    // simply prompt for sign-in.
    if (!u) signInAnonymously(auth).catch((e) => console.warn("anon auth", e?.code || e));
  });
}

function paintUser(u: User | null) {
  // Anonymous users have an auth token but no real account — treat them as
  // logged-out in the UI (show "Sign in", don't load personal trips).
  const realUser = u && !u.isAnonymous ? u : null;
  if (realUser) {
    $("#signInBtn")!.style.display = "none";
    $("#signedInMenu")!.style.display = "inline-flex";
    $("#userInitial")!.textContent = (realUser.displayName || realUser.email || "U").slice(0, 1).toUpperCase();
    bindTripRail(realUser.uid);
    ensureFcmToken();
  } else {
    $("#signInBtn")!.style.display = "inline-flex";
    $("#signedInMenu")!.style.display = "none";
    $("#tripRail")!.innerHTML = "<div class='empty'>Sign in to save trips. They'll appear here.</div>";
  }
}

// ── Trip rail (Firestore subscription) ─────────────────────────────────────
interface SavedTrip {
  id: string; name: string; destination: string; cover?: string; status?: string;
  createdAt: string; stops?: string[]; dates?: string;
  countryCode?: string; lat?: number; lon?: number;
}
const tripCache = new Map<string, SavedTrip>();

function bindTripRail(uid: string) {
  if (!db) return;
  const rail = $("#tripRail")!;
  rail.innerHTML = "<div class='empty'>Loading your trips…</div>";
  const q = query(collection(db, `users/${uid}/trips`), orderBy("createdAt", "desc"), limit(6));
  // Drop any prior subscription (e.g. on re-login as a different user) before
  // opening a new one.
  tripRailUnsub?.();
  tripRailUnsub = onSnapshot(q, (snap) => {
    tripCache.clear();
    if (snap.empty) { rail.innerHTML = "<div class='empty'>No trips yet. Identify a place and tap 'Save to a trip'.</div>"; return; }
    rail.innerHTML = "";
    snap.docs.forEach((d) => {
      const t = d.data() as SavedTrip;
      tripCache.set(t.id, t);
      const dot = t.status === "booked" ? "#fff" : t.status === "planning" ? "#F6B557" : "#9ACBA8";
      const stamp = t.status === "booked" ? "Booked" : t.status === "planning" ? "Planning" : "Idea";
      rail.insertAdjacentHTML("beforeend", `
        <article class="trip" data-trip-id="${esc(t.id)}" style="cursor:pointer">
          <div class="cover">
            ${t.cover ? `<img src="${esc(safeImgUrl(t.cover))}" alt="${esc(t.name)}">` : ""}
            <span class="stamp-sm"><span style="width:6px;height:6px;border-radius:50%;background:${dot}"></span>${stamp}</span>
          </div>
          <div class="trip-body">
            <h6>${esc(t.name)}</h6>
            <div class="dates">${esc(t.dates || new Date(t.createdAt).toLocaleDateString())}</div>
            <div class="stops">${(t.stops || []).slice(0,4).map(s => `<span class="pill">${esc(s)}</span>`).join("")}</div>
          </div>
          <div class="trip-foot"><div class="avatars"><span class="av a1"></span></div><span>Saved trip · open</span></div>
        </article>`);
    });
    rail.querySelectorAll<HTMLElement>("[data-trip-id]").forEach((el) =>
      el.addEventListener("click", () => openTrip(el.dataset.tripId!))
    );
  });
}

// ── Trip detail sheet ──────────────────────────────────────────────────────
let currentTripId: string | null = null;
let currentTripTab: "overview" | "journal" | "group" | "email" | "geofence" = "overview";
const journalSvc = new TripJournal();
const geofencer = new GeofenceWatcher();
let geofenceActive = false;

function openTrip(tripId: string) {
  currentTripId = tripId;
  const t = tripCache.get(tripId);
  if (!t) return;
  $("#tripSheetTitle")!.textContent = t.name; // textContent — already safe
  openSheet("tripSheet");
  paintTripTab("overview");
}

function paintTripTab(tab: typeof currentTripTab) {
  currentTripTab = tab;
  $$<HTMLButtonElement>("#tripTabs .tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tripTab === tab)
  );
  const body = $("#tripSheetBody")!;
  if (!currentTripId) return;
  const t = tripCache.get(currentTripId);
  if (!t) { body.innerHTML = "<div class='empty'>Trip not found.</div>"; return; }

  if (tab === "overview") paintTripOverview(t, body);
  else if (tab === "journal") paintTripJournal(t, body);
  else if (tab === "group") paintTripGroup(t, body);
  else if (tab === "email") paintTripEmail(t, body);
  else if (tab === "geofence") paintTripGeofence(t, body);
}

function paintTripOverview(t: SavedTrip, body: HTMLElement) {
  body.innerHTML = `
    <div class="insight-card">
      <h4>${esc(t.name)}</h4>
      <p>${esc(t.destination)}${t.countryCode ? ` · ${esc(t.countryCode)}` : ""}${t.dates ? ` · ${esc(t.dates)}` : ""}</p>
      <div class="row-actions" style="margin-top:12px">
        <button class="btn ghost sm" id="tripPlanItin">Plan itinerary</button>
        ${t.lat != null ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}">Open in Maps</a>` : ""}
        <button class="btn ghost sm" id="tripPromoteGroup">Promote to group trip</button>
        <button class="btn ghost sm" id="tripDelete">Delete</button>
      </div>
    </div>`;
  $("#tripPlanItin")?.addEventListener("click", () => {
    closeSheet("tripSheet");
    currentIdentified = currentIdentified || ({
      name: t.destination, shortMatch: t.name, country: "", countryCode: t.countryCode || "",
      region: "", city: "", lat: t.lat || 0, lon: t.lon || 0, confidence: 100, description: "",
    } as IdentifyResult);
    openItinForm();
  });
  $("#tripPromoteGroup")?.addEventListener("click", () => promoteToGroup(t));
  $("#tripDelete")?.addEventListener("click", async () => {
    if (!(await uiConfirm("Delete trip?", `Remove "${t.name}" from your saved trips?`, "Delete")) || !auth?.currentUser || !db) return;
    await deleteDoc(doc(db, `users/${auth.currentUser.uid}/trips/${t.id}`));
    closeSheet("tripSheet");
    toast("Trip deleted", "ok");
  });
}

// ── Journal ───────────────────────────────────────────────────────────────
function paintTripJournal(t: SavedTrip, body: HTMLElement) {
  body.innerHTML = `
    <div class="insight-card" style="margin-bottom:12px">
      <h4>Add entry</h4>
      <textarea id="journalText" rows="2" placeholder="What's happening?" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font:inherit;font-size:14px;outline:none;resize:vertical"></textarea>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
        <input type="file" id="journalPhotos" multiple accept="image/*">
        <select id="journalMood" style="padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--bg)">
          <option value="">Mood…</option>
          <option value="happy">😊 Happy</option>
          <option value="tired">😪 Tired</option>
          <option value="amazed">🤩 Amazed</option>
          <option value="neutral">😐 Neutral</option>
          <option value="excited">🎉 Excited</option>
        </select>
        <label style="font-size:12px;color:var(--muted)"><input type="checkbox" id="journalGeo" checked> Tag location</label>
        <button class="btn clay sm" id="journalAdd">Post</button>
      </div>
    </div>
    <div id="journalList"><div class="skeleton"></div></div>`;
  $("#journalAdd")?.addEventListener("click", () => addJournalEntry(t.id));
  loadJournalEntries(t.id);
}

async function addJournalEntry(tripId: string) {
  if (!realUser()) { openAuth(); return; }
  const text = $<HTMLTextAreaElement>("#journalText")!.value.trim();
  const mood = $<HTMLSelectElement>("#journalMood")!.value as JournalEntry["mood"];
  const photos = Array.from($<HTMLInputElement>("#journalPhotos")!.files || []);
  const tagGeo = $<HTMLInputElement>("#journalGeo")!.checked;
  if (!text && !photos.length) { toast("Add text or photos.", "info"); return; }
  toast("Saving entry…", "info");
  try {
    const loc = tagGeo ? await journalSvc.captureLocation() : null;
    await journalSvc.addEntry(tripId, text, photos, {
      lat: loc?.lat, lon: loc?.lon, mood: mood || undefined,
    });
    $<HTMLTextAreaElement>("#journalText")!.value = "";
    $<HTMLInputElement>("#journalPhotos")!.value = "";
    toast("Saved", "ok");
    loadJournalEntries(tripId);
  } catch (e) {
    toast((e as Error).message, "err");
  }
}

async function loadJournalEntries(tripId: string) {
  const list = $("#journalList")!;
  try {
    const items = await journalSvc.getEntries(tripId);
    if (!items.length) { list.innerHTML = "<div class='empty'>No entries yet.</div>"; return; }
    list.innerHTML = items.slice().reverse().map((e) => `
      <div class="insight-card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <strong>${new Date(e.timestamp).toLocaleString()}</strong>
          <span class="tag">${esc(e.mood || "")}${e.lat != null && e.lon != null ? ` · ${e.lat.toFixed(2)},${e.lon.toFixed(2)}` : ""}</span>
        </div>
        ${e.text ? `<p style="margin-top:8px">${esc(e.text)}</p>` : ""}
        ${e.photoUrls?.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-top:8px">${e.photoUrls.map((u) => `<a href="${esc(safeImgUrl(u))}" target="_blank" rel="noopener"><img src="${esc(safeImgUrl(u))}" style="width:100%;height:120px;object-fit:cover;border-radius:8px"></a>`).join("")}</div>` : ""}
      </div>`).join("");
  } catch (e) {
    list.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

// ── Group ──────────────────────────────────────────────────────────────────
async function promoteToGroup(t: SavedTrip) {
  const u = realUser();
  if (!u) { openAuth(); return; }
  try {
    const r = await call<unknown, { id: string }>("createGroupTrip", {
      name: t.name, destination: t.destination,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      baseCurrency: "USD",
    });
    if (db) {
      await setDoc(doc(db, `users/${u.uid}/trips/${t.id}`), { ...t, groupTripId: r.id }, { merge: true });
    }
    toast("Promoted to group trip. Invite people now.", "ok");
    paintTripTab("group");
  } catch (e) {
    toast((e as Error).message, "err");
  }
}

interface GroupTripDoc {
  id: string; name: string; baseCurrency: string;
  members: Array<{ uid: string; displayName: string; email: string; role: string }>;
  memberUids: string[]; ownerUid: string;
}
let groupTripDoc: GroupTripDoc | null = null;

function paintTripGroup(t: SavedTrip, body: HTMLElement) {
  const linked = (t as SavedTrip & { groupTripId?: string }).groupTripId;
  if (!linked) {
    body.innerHTML = `
      <div class="empty">Not a group trip yet.<br><br>
        <button class="btn clay sm" id="tripPromoteNow">Promote to group trip</button>
      </div>`;
    $("#tripPromoteNow")?.addEventListener("click", () => promoteToGroup(t));
    return;
  }
  body.innerHTML = `
    <div class="insight-card" style="margin-bottom:12px">
      <h4>Members</h4>
      <div id="groupMembers"><div class='skeleton'></div></div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <input id="inviteEmail" placeholder="email@friend.com" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font:inherit;font-size:13px">
        <button class="btn clay sm" id="inviteBtn">Invite</button>
      </div>
    </div>
    <div class="insight-card" style="margin-bottom:12px">
      <h4>Add expense</h4>
      <div class="booking-form" style="grid-template-columns:1fr 1fr 1fr auto;background:transparent;border:0;padding:0">
        <label>Description<input id="expDesc" placeholder="Dinner"></label>
        <label>Amount<input id="expAmount" type="number" min="0" step="0.01"></label>
        <label>Currency<input id="expCur" value="USD" maxlength="3" style="text-transform:uppercase"></label>
        <button class="btn clay sm" id="expAdd">Add</button>
      </div>
    </div>
    <div class="insight-card" style="margin-bottom:12px">
      <h4>Expenses</h4>
      <div id="expList"></div>
    </div>
    <div class="insight-card">
      <h4>Settle up</h4>
      <button class="btn ghost sm" id="settleBtn">Compute balances</button>
      <div id="settleOut" style="margin-top:10px"></div>
    </div>`;

  loadGroup(linked);
  $("#inviteBtn")?.addEventListener("click", () => sendInvite(linked));
  $("#expAdd")?.addEventListener("click", () => addExpense(linked));
  $("#settleBtn")?.addEventListener("click", () => settleUp(linked));
}

async function loadGroup(tripId: string) {
  if (!db) return;
  const snap = await onSnapshotOnce<GroupTripDoc>(`groupTrips/${tripId}`);
  if (!snap) return;
  groupTripDoc = snap;
  $("#groupMembers")!.innerHTML = snap.members.map((m) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px"><span>${esc(m.displayName || m.email)}</span><span class="tag">${esc(m.role)}</span></div>`
  ).join("");
  // expenses
  if (db) {
    const expSnap = await getDocsOnce<{ description: string; currency: string; amount: number }>(`groupTrips/${tripId}/expenses`);
    const out = $("#expList")!;
    if (!expSnap.length) { out.innerHTML = "<div class='empty'>No expenses yet.</div>"; return; }
    out.innerHTML = expSnap.map((e) =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px"><span>${esc(e.description)}</span><span>${esc(e.currency)} ${Number(e.amount).toFixed(2)}</span></div>`
    ).join("");
  }
}

async function onSnapshotOnce<T>(path: string): Promise<T | null> {
  if (!db) return null;
  return new Promise((resolve) => {
    const unsub = onSnapshot(
      doc(db, path),
      (s) => { unsub(); resolve(s.exists() ? (s.data() as T) : null); },
      // Without an error callback a permission/network failure leaves the
      // Promise pending forever and the calling UI hangs on its skeleton.
      (err) => { unsub(); console.warn("onSnapshotOnce", path, err); resolve(null); }
    );
  });
}

async function getDocsOnce<T = Record<string, unknown>>(path: string): Promise<T[]> {
  if (!db) return [];
  return new Promise((resolve) => {
    const unsub = onSnapshot(
      collection(db, path),
      (s) => { unsub(); resolve(s.docs.map((d) => d.data() as T)); },
      (err) => { unsub(); console.warn("getDocsOnce", path, err); resolve([]); }
    );
  });
}

async function sendInvite(tripId: string) {
  const email = $<HTMLInputElement>("#inviteEmail")!.value.trim();
  if (!email) return;
  try {
    await call("inviteToGroupTrip", { tripId, email, role: "editor" });
    $<HTMLInputElement>("#inviteEmail")!.value = "";
    toast(`Invited ${email}`, "ok");
  } catch (e) {
    toast((e as Error).message, "err");
  }
}

async function addExpense(tripId: string) {
  const description = $<HTMLInputElement>("#expDesc")!.value.trim();
  const amount = Number($<HTMLInputElement>("#expAmount")!.value);
  const currency = $<HTMLInputElement>("#expCur")!.value.toUpperCase() || "USD";
  if (!description || !amount) { toast("Need description + amount.", "info"); return; }
  try {
    await call("addGroupExpense", { tripId, description, amount, currency });
    $<HTMLInputElement>("#expDesc")!.value = "";
    $<HTMLInputElement>("#expAmount")!.value = "";
    loadGroup(tripId);
    toast("Expense logged", "ok");
  } catch (e) {
    toast((e as Error).message, "err");
  }
}

async function settleUp(tripId: string) {
  const out = $("#settleOut")!;
  out.innerHTML = "<div class='skeleton'></div>";
  try {
    const r = await call<{ tripId: string }, {
      balances: Array<{ uid: string; net: number }>;
      settlements: Array<{ from: string; to: string; amount: number }>;
    }>("settleUpGroupTrip", { tripId });
    const nameOf = (uid: string) => esc(groupTripDoc?.members.find((m) => m.uid === uid)?.displayName || uid.slice(0, 6));
    const cur = esc(groupTripDoc?.baseCurrency || "USD");
    out.innerHTML = `
      <strong>Balances</strong>
      <ul style="margin-top:4px">${r.balances.map((b) => `<li>${nameOf(b.uid)}: ${b.net > 0 ? "owed" : "owes"} ${cur} ${Math.abs(b.net).toFixed(2)}</li>`).join("")}</ul>
      ${r.settlements.length ? `<strong>Suggested settlements</strong><ul style="margin-top:4px">${r.settlements.map((s) => `<li>${nameOf(s.from)} → ${nameOf(s.to)} · ${cur} ${s.amount.toFixed(2)}</li>`).join("")}</ul>` : "<p style='margin-top:6px'>All settled.</p>"}`;
  } catch (e) {
    out.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

// ── Email (Gmail OAuth + import) ───────────────────────────────────────────
function paintTripEmail(_t: SavedTrip, body: HTMLElement) {
  body.innerHTML = `
    <div class="insight-card">
      <h4>Import bookings from Gmail</h4>
      <p>Atlas reads only travel confirmations (flights, hotels, trains) and extracts trip details. Your inbox stays on Google's servers — Atlas only sees the email body in real time during the import.</p>
      <div class="row-actions" style="margin-top:12px">
        <button class="btn clay sm" id="gmailConnectBtn">Connect Gmail & import</button>
        <button class="btn ghost sm" data-action="open-inbox">View imported</button>
      </div>
      <p class="tag" id="gmailStatus" style="margin-top:10px"></p>
    </div>`;
  $("#gmailConnectBtn")?.addEventListener("click", () => runGmailImport());
}

let gmailToken: string | null = null;

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(opts: { client_id: string; scope: string; callback: (resp: { access_token?: string; error?: string }) => void }): { requestAccessToken(): void };
        };
      };
    };
  }
}

async function runGmailImport() {
  const clientId = import.meta.env.VITE_GMAIL_OAUTH_CLIENT_ID;
  if (!clientId) {
    toast("Set VITE_GMAIL_OAUTH_CLIENT_ID in .env.local first.", "err");
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    toast("Google Identity Services not loaded yet — try again in a moment.", "info");
    return;
  }
  $("#gmailStatus")!.textContent = "Requesting Gmail permission…";
  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    callback: async (resp) => {
      if (resp.error || !resp.access_token) {
        $("#gmailStatus")!.textContent = `Permission denied (${resp.error || "no token"})`;
        return;
      }
      gmailToken = resp.access_token;
      $("#gmailStatus")!.textContent = "Importing… this can take ~30s.";
      try {
        const r = await call<{ accessToken: string }, { imported: number }>("importGmailBookings", {
          accessToken: gmailToken,
        });
        $("#gmailStatus")!.textContent = `Imported ${r.imported} bookings.`;
        toast(`Imported ${r.imported} bookings`, "ok");
      } catch (e) {
        $("#gmailStatus")!.textContent = (e as Error).message;
      }
    },
  });
  tokenClient.requestAccessToken();
}

async function refreshInbox() {
  const body = $("#inboxBody")!;
  const u = realUser();
  if (!u || !db) { body.innerHTML = "<div class='empty'>Sign in to view your imported bookings.</div>"; return; }
  body.innerHTML = "<div class='skeleton'></div>";
  try {
    const list = await getDocsOnce<{
      id: string; type: string; provider: string; confirmationCode?: string;
      from?: { iata?: string }; to?: { iata?: string }; departureLocal?: string;
      hotelName?: string; checkIn?: string; checkOut?: string;
      totalCost?: { amount: number; currency: string }; importedAt: string;
    }>(`users/${u.uid}/bookings`);
    if (!list.length) { body.innerHTML = "<div class='empty'>No imports yet. Open a trip → Email tab to import.</div>"; return; }
    body.innerHTML = list.map((b) => {
      const subtitle = b.type === "flight"
        ? `${b.from?.iata || "?"} → ${b.to?.iata || "?"} · ${b.departureLocal || ""}`
        : b.type === "hotel"
          ? `${b.hotelName || ""} · ${b.checkIn || ""} → ${b.checkOut || ""}`
          : (b.confirmationCode || "");
      return `
        <div class="quote">
          <div class="src"><strong>${esc(b.provider)}</strong> · ${esc(b.type)}<small>${esc(subtitle)}</small></div>
          <div class="price">${b.totalCost ? `${esc(b.totalCost.currency)} ${esc(b.totalCost.amount)}` : ""}</div>
        </div>`;
    }).join("");
  } catch (e) {
    body.innerHTML = `<div class='empty'>${esc((e as Error).message)}</div>`;
  }
}

// ── Geofence ───────────────────────────────────────────────────────────────
function paintTripGeofence(t: SavedTrip, body: HTMLElement) {
  body.innerHTML = `
    <div class="insight-card">
      <h4>Proximity notifications</h4>
      <p>Atlas pings you when you walk within 200m of an activity on this trip's itinerary. Browser tab must stay open. Battery use rises while active.</p>
      <div class="row-actions" style="margin-top:10px">
        <button class="btn clay sm" id="geofenceToggle">${geofenceActive ? "Stop" : "Start"}</button>
      </div>
      <p class="tag" id="geofenceStatus" style="margin-top:10px">${geofenceActive ? "Active — watching." : "Idle."}</p>
    </div>`;
  $("#geofenceToggle")?.addEventListener("click", () => toggleGeofence(t));
}

async function toggleGeofence(t: SavedTrip) {
  if (geofenceActive) {
    geofencer.stop();
    geofenceActive = false;
    $("#geofenceStatus")!.textContent = "Stopped.";
    $("#geofenceToggle")!.textContent = "Start";
    return;
  }
  const fences: Geofence[] = [];
  if (currentItinerary) {
    for (const day of currentItinerary.days) {
      for (const a of day.activities) {
        if (a.location) fences.push({
          id: `${day.day}-${a.time}`, lat: a.location.lat, lon: a.location.lon,
          radiusM: 200, title: a.title, message: a.description,
        });
      }
    }
  }
  if (t.lat != null && t.lon != null && fences.length === 0) {
    fences.push({ id: t.id, lat: t.lat, lon: t.lon, radiusM: 500, title: t.name, message: "You've arrived." });
  }
  if (!fences.length) { toast("Generate an itinerary first.", "info"); return; }
  await geofencer.requestNotificationPermission();
  geofencer.start(fences, (f, d) => {
    toast(`Near ${f.title} (${Math.round(d)}m)`, "ok");
  });
  geofenceActive = true;
  $("#geofenceStatus")!.textContent = `Watching ${fences.length} points.`;
  $("#geofenceToggle")!.textContent = "Stop";
}

// silence unused-type imports — these are exported by services
export type { JournalEntry };

// ── Boot ───────────────────────────────────────────────────────────────────
function initTripTabs() {
  document.body.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-trip-tab]");
    if (t && t.dataset.tripTab) paintTripTab(t.dataset.tripTab as typeof currentTripTab);
  });
}

function initToolsMenu() {
  const btn = $("#toolsBtn");
  const menu = $("#toolsMenu");
  if (!btn || !menu) return;
  const items = () => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const setOpen = (open: boolean) => {
    menu.style.display = open ? "block" : "none";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) items()[0]?.focus();
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.style.display !== "block");
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
  });
  menu.addEventListener("keydown", (e) => {
    const list = items();
    const idx = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { setOpen(false); (btn as HTMLElement).focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(idx + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(idx - 1 + list.length) % list.length]?.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target as Node) && e.target !== btn) setOpen(false);
  });
}

function initSheetClosers() {
  document.body.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-close]");
    if (t && t.dataset.close) closeSheet(t.dataset.close);
  });
  $$<HTMLDivElement>(".sheet-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => {
      if (e.target === bd) bd.classList.remove("is-open");
    });
  });
}

// ── PWA install ──────────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferredInstall: BeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  // Stash the event so we can trigger the native install flow from our own menu
  // item instead of the browser's default mini-infobar.
  e.preventDefault();
  deferredInstall = e as BeforeInstallPromptEvent;
  const item = $("#installAppItem");
  if (item) item.style.display = "block";
});
window.addEventListener("appinstalled", () => {
  deferredInstall = null;
  const item = $("#installAppItem");
  if (item) item.style.display = "none";
  toast("Atlas installed", "ok");
});
async function promptInstall() {
  if (!deferredInstall) { toast("Already installed, or your browser handles install from its menu.", "info"); return; }
  await deferredInstall.prompt();
  const choice = await deferredInstall.userChoice;
  if (choice.outcome === "accepted") toast("Installing…", "ok");
  deferredInstall = null;
  const item = $("#installAppItem");
  if (item) item.style.display = "none";
}

// Global keyboard shortcuts. Ignored while typing in a field.
function initShortcuts() {
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (e.key === "Escape") {
      // Close any open sheet / dialog / menu / assistant.
      $$(".sheet-backdrop.is-open").forEach((s) => s.classList.remove("is-open"));
      $(".modal-backdrop.is-open")?.classList.remove("is-open");
      $(".ui-dialog-overlay")?.remove();
      $("#assistPanel")?.classList.remove("is-open");
      closeToolsMenu();
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); ($("#searchInput") as HTMLInputElement | null)?.focus(); }
    else if (e.key.toLowerCase() === "a") { $("#assistPanel")?.classList.toggle("is-open"); }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initRouter();
  initIdentify();
  initTabs();
  initResultActions();
  initBookings();
  initAirports();
  initVisas();
  initTranslate();
  initCommunity();
  initAssistant();
  initAuth();
  initItin();
  initVaultForm();
  initToolsMenu();
  initSheetClosers();
  initTripTabs();
  initRecent();
  initShortcuts();
  if (!functionsReady) {
    const badge = $("#heroBadge");
    if (badge) badge.textContent = "Demo mode · backend not configured";
    toast("Backend not configured — add VITE_FIREBASE_* keys to .env.local. UI runs in demo-only mode.", "err");
  }
});
