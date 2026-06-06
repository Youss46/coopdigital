const CACHE_VERSION = "coopdigital-terrain-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE   = `${CACHE_VERSION}-data`;

const STATIC_ASSETS = ["./", "./index.html"];

// ── Installation ───────────────────────────────────────────────────────────────

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activation — purge anciens caches ─────────────────────────────────────────

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Interception des requêtes ──────────────────────────────────────────────────

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API terrain GET → network first + cache fallback
  if (url.pathname.startsWith("/api/terrain") || url.pathname.startsWith("/terrain/api")) {
    if (e.request.method === "GET") {
      e.respondWith(networkFirstStrategy(e.request));
    } else {
      e.respondWith(fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ erreur: "HORS_LIGNE", message: "Requête en attente de synchronisation" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      ));
    }
    return;
  }

  // Navigation → network first, fallback vers index.html (SPA)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match("./index.html") ?? caches.match("/terrain/"))
    );
    return;
  }

  // Assets statiques → cache first
  e.respondWith(cacheFirstStrategy(e.request));
});

// ── Stratégies de cache ────────────────────────────────────────────────────────

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ erreur: "HORS_LIGNE", message: "Données non disponibles hors ligne" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Hors ligne", { status: 503 });
  }
}

// ── Background Sync ────────────────────────────────────────────────────────────

self.addEventListener("sync", (e) => {
  if (e.tag === "sync-operations") {
    e.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "SYNC_REQUESTED" }));
}

// ── Notifications push ────────────────────────────────────────────────────────

self.addEventListener("push", (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.titre || "CoopDigital", {
      body: data.message,
      icon: "./logo-192.png",
      badge: "./logo-32.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("./"));
});
