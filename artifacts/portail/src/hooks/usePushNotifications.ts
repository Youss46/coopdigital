import { useCallback, useEffect, useState } from "react";
import { api as portailApi } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }
  return view;
}

function serializeKey(key: ArrayBuffer | null): string {
  if (!key) return "";
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

export function usePushNotifications(enabled: boolean) {
  const [permission, setPermission] = useState<NotificationPermission>(
    "Notification" in window ? Notification.permission : "denied"
  );
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!("Notification" in window)) return;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const { vapidKey } = await portailApi.pushVapidKey();
      const reg = await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
      }

      await portailApi.pushSubscribe({
        endpoint: sub.endpoint,
        keys: {
          p256dh: serializeKey(sub.getKey("p256dh")),
          auth:   serializeKey(sub.getKey("auth")),
        },
      });

      setSubscribed(true);
    } catch (err) {
      console.warn("[Push] Subscription failed:", err);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await portailApi.pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.warn("[Push] Unsubscribe failed:", err);
    }
  }, []);

  // Auto-subscribe silently once the user is logged in
  useEffect(() => {
    if (!enabled) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Check existing subscription without prompting
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (sub && Notification.permission === "granted") {
          const { vapidKey } = await portailApi.pushVapidKey();
          // Sync subscription with server (idempotent)
          await portailApi.pushSubscribe({
            endpoint: sub.endpoint,
            keys: {
              p256dh: serializeKey(sub.getKey("p256dh")),
              auth:   serializeKey(sub.getKey("auth")),
            },
          }).catch(() => {});
          void vapidKey;
          setSubscribed(true);
        }
      })
      .catch(() => {});
  }, [enabled]);

  return {
    isSupported: "Notification" in window && "PushManager" in window,
    permission,
    subscribed,
    subscribe,
    unsubscribe,
  };
}
