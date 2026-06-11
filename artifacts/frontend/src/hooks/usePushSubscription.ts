import { useEffect, useRef } from "react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";

async function getVapidKey(): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/api/notifications/push/vapid-key`);
    if (!r.ok) return null;
    const d = await r.json() as { publicKey?: string };
    return d.publicKey ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function sauvegarderSub(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON() as {
    endpoint: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await fetch(`${BASE}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok()}`,
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
}

export function usePushSubscription(estConnecte: boolean): void {
  const done = useRef(false);

  useEffect(() => {
    if (!estConnecte || done.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function setup() {
      try {
        const vapidKey = await getVapidKey();
        if (!vapidKey) return;

        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Vérifier si une subscription existe déjà
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        }

        await sauvegarderSub(sub);
        done.current = true;
      } catch {
        // Silencieux — push non critique
      }
    }

    void setup();
  }, [estConnecte]);

  // Réinitialiser quand l'utilisateur se déconnecte
  useEffect(() => {
    if (!estConnecte) done.current = false;
  }, [estConnecte]);
}
