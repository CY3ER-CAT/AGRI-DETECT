/* AGRI DETECT (Ulavan Tech) — offline-first service worker.
   Cache-first for same-origin GETs, network-first for page navigations,
   so the app works fully offline after first visit. */
const VERSION = "agridetect-v46";
const CORE = [
  "./",
  "index.html",
  "detection.html",
  "history.html",
  "about.html",
  "settings.html",
  "styles.css",
  "problems.js",
  "langs.js",
  "i18n.js",
  "app.js",
  "chat-key.js",
  "chatbot.js",
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

/* 48-hour recheck reminders: the app mirrors its follow-up list into a tiny
   Cache entry. When a periodic sync fires we re-read it and notify for any
   due/overdue rechecks — even if the app is not open. */
self.addEventListener("periodicsync", function (e) {
  if (e.tag !== "followup-check") return;
  e.waitUntil(
    caches.open("agridetect-followups")
      .then(function (c) { return c.match("__followups__.json"); })
      .then(function (res) {
        if (!res) return null;
        return res.json();
      })
      .then(function (list) {
        if (!list || !list.length) return null;
        var now = Date.now();
        var due = list.filter(function (x) { return x.at && !x.done && now >= x.at; });
        if (!due.length) return null;
        due.forEach(function (x) { x.done = true; });
        return Promise.all(due.map(function (x) {
          return self.registration.showNotification(x.title || "48-hour recheck reminder", {
            body: x.body || (x.crop + " was flagged — recheck it now."),
            icon: "icons/icon-192.png",
            tag: "followup-" + x.id,
          });
        })).then(function () {
          return caches.open("agridetect-followups")
            .then(function (c) {
              return c.put("__followups__.json", new Response(JSON.stringify(list)));
            });
        });
      })
      .catch(function (err) { console.warn("followup sync:", err); })
  );
});