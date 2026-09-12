/* AGRI DETECT (Ulavan Tech) — offline-first service worker.
   Cache-first for same-origin GETs, network-first for page navigations,
   so the app works fully offline after first visit. */
const VERSION = "agridetect-v37";
const CORE = [
  "./",
  "index.html",
  "detection.html",
  "history.html",
  "about.html",
  "settings.html",
  "styles.css",
  "problems.js",
  "problems-ta.js",
  "problems-hi.js",
  "problems-te.js",
  "problems-kn.js",
  "problems-ml.js",
  "problems-bn.js",
  "problems-mr.js",
  "langs.js",
  "i18n.js",
  "app.js",
  "chat-key.js",
  "chatbot.js?v=15",
  "detection.js",
  "history.js",
  "sw-register.js",
  "manifest.json",
  "vendor/tf.min.js",
  "models/plant-health/model.json",
  "models/plant-health/group1-shard1of2.bin",
  "models/plant-health/group1-shard2of2.bin"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k.indexOf("agridetect-") === 0 && k !== VERSION; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (m) { return m || caches.match("index.html"); });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
    })
  );
});