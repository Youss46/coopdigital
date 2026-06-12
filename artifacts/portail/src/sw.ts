import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// Précache tous les assets générés par Vite
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA fallback — toutes les navigations sauf /api/ → index.html
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: "navigation-v1" }),
    { denylist: [/^\/api\//] }
  )
);

// API portail — NetworkFirst (sauf endpoints PDF/binaires)
registerRoute(
  ({ url }: { url: URL }) =>
    url.pathname.startsWith("/api/portail/") &&
    !url.pathname.includes("carte-membre") &&
    !url.pathname.includes("/recus/"),
  new NetworkFirst({
    cacheName: "api-portail-v1",
    networkTimeoutSeconds: 5,
  })
);

// Google Fonts stylesheets
registerRoute(
  ({ url }: { url: URL }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "google-fonts-stylesheets" })
);

// Google Fonts webfonts
registerRoute(
  ({ url }: { url: URL }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({ cacheName: "google-fonts-webfonts" })
);

// ── Notifications push ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: { titre?: string; message?: string; url?: string } = {};
  try {
    data = event.data.json() as typeof data;
  } catch {
    data = { message: event.data.text() };
  }

  const title = data.titre ?? "CoopDigital";
  const body  = data.message ?? "";
  const url   = data.url ?? self.registration.scope;
  const icon  = self.registration.scope + "logo-192.png";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { url },
      tag: "coopdigital-portail",
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notifData = event.notification.data as { url?: string } | null;
  const url = notifData?.url ?? self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          (client as WindowClient).navigate(url);
          return (client as WindowClient).focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
