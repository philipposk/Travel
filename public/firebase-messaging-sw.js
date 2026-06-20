// Firebase Cloud Messaging service worker.
// Receives background push notifications (price-drop alerts, etc.).
// Config values must match VITE_FIREBASE_* — we hard-code public fields here
// because service workers can't read Vite import.meta.env.

/* eslint-disable */
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
