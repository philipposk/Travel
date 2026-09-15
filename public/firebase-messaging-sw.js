// Service worker: (1) app-shell offline caching, (2) Firebase Cloud
// Messaging background push. Both live in one file because a single origin
// can only have one active service worker per scope — registering a second
// script at the same scope would silently replace this one instead of
// running alongside it.
//
// Registered unconditionally on every page load (see the call next to the
// `beforeinstallprompt` listener in src/main.ts) so offline app-shell access
// works for every visitor, not just signed-in users who enabled push.

/* eslint-disable */

// ── App-shell offline cache ─────────────────────────────────────────────────
// Vite fingerprints built JS/CSS filenames per build (e.g. index-qvs1bfUl.js),
// so they can't be hardcoded here. Instead, discover them at install time by
// fetching the live index.html and reading its <script>/<link> tags — this
// keeps the cache correct across builds with zero build-time tooling.
const SHELL_CACHE = "atlas-shell-v1";
const STATIC_SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/gemini.svg",
  "/assets/beach.jpeg",
  "/assets/reichstag.jpeg",
  "/assets/waterfall.jpeg",
];

async function discoverBuiltAssetUrls() {
  try {
    const res = await fetch("/index.html", { cache: "reload" });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = new Set();
    const attrPattern = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g;
    let m;
    while ((m = attrPattern.exec(html))) urls.add(m[1]);
    return Array.from(urls);
  } catch {
    return [];
  }
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const builtAssets = await discoverBuiltAssetUrls();
  const urls = [...STATIC_SHELL_URLS, ...builtAssets];
  // Cache each resource independently — one bad URL (e.g. a sample image
  // renamed later) shouldn't sink the whole precache the way cache.addAll would.
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await cache.put(url, res);
    } catch {
      /* offline install, or resource missing — skip, not fatal */
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept callable/API POSTs
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Firestore/Functions/third-party calls

  // SPA navigations: prefer fresh network content; fall back to the cached
  // shell only when offline, so a weak-wifi airport/hotel visit still loads
  // something instead of a blank page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Hashed build assets + static shell resources: cache-first (content-hashed
  // filenames never change contents, so there's no staleness risk), falling
  // through to network for anything not precached.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

// ── Firebase Cloud Messaging (background push) ──────────────────────────────
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

// Replace these with your real Firebase web config public values when deploying:
self.__FIREBASE_CONFIG__ = self.__FIREBASE_CONFIG__ || {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

if (self.__FIREBASE_CONFIG__.apiKey) {
  firebase.initializeApp(self.__FIREBASE_CONFIG__);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(function (payload) {
    const title = (payload.notification && payload.notification.title) || "Atlas";
    const opts = {
      body: (payload.notification && payload.notification.body) || "",
      icon: "/assets/gemini.svg",
      data: payload.data || {},
    };
    self.registration.showNotification(title, opts);
  });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (const c of clients) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
