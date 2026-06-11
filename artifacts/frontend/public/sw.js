/* Service Worker CoopDigital — Push Notifications */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ── Push : afficher la notification ───────────────────────────────────────────

self.addEventListener("push", (e) => {
  if (!e.data) return;

  let titre = "CoopDigital";
  let corps  = "";
  let url    = "/";

  try {
    const data = e.data.json();
    titre = data.titre  || titre;
    corps = data.message || corps;
    url   = data.url    || url;
  } catch {
    corps = e.data.text();
  }

  e.waitUntil(
    self.registration.showNotification(titre, {
      body: corps,
      icon: "/logo-192.png",
      badge: "/logo-32.png",
      tag: "coop-message",
      renotify: true,
      data: { url },
    })
  );
});

// ── Clic sur la notification → ouvrir / focus l'app ──────────────────────────

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/";

  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(target);
            return;
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
