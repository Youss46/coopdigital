import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// Précache tous les assets générés par Vite (JS, CSS, HTML, icons…)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA fallback — toutes les navigations → index.html (sauf /api/)
const handler = createHandlerBoundToURL(self.registration.scope + "index.html");
const navRoute = new NavigationRoute(handler, {
  denylist: [/^\/api\//],
});
registerRoute(navRoute);

// API M15 — NetworkFirst avec timeout 8s, fallback sur cache
registerRoute(
  ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "m15-api-v1",
    networkTimeoutSeconds: 8,
    plugins: [],
  })
);

// Assets statiques tiers — StaleWhileRevalidate
registerRoute(
  ({ url }: { url: URL }) =>
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com",
  new StaleWhileRevalidate({ cacheName: "m15-fonts-v1" })
);

// Skip waiting dès qu'une nouvelle version est disponible
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string })?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
