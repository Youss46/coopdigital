import { useEffect } from "react";
import { getToken } from "../lib/auth";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/terrain`;

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/push/vapid-key`);
    if (!res.ok) return null;
    const data = await res.json() as { publicKey: string };
    return data.publicKey;
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

async function registerPushSubscription(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const vapidKey = await getVapidKey();
  if (!vapidKey) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const token = getToken();
    await fetch(`${BASE}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
          auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
        },
      }),
    });
  } catch {
    // Push non disponible sur cet appareil — on ignore silencieusement
  }
}

export function usePushSubscription(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated || !import.meta.env.PROD) return;
    void registerPushSubscription();
  }, [isAuthenticated]);
}
