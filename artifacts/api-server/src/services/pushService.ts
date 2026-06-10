import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const VAPID_PUBLIC_KEY  = process.env["VAPID_PUBLIC_KEY"]  ?? "";
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_SUBJECT     = process.env["VAPID_SUBJECT"]     ?? "mailto:admin@coopdigital.ci";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export { VAPID_PUBLIC_KEY };

export async function sauvegarderSubscription(userId: number, sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  await db
    .insert(pushSubscriptionsTable)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: [pushSubscriptionsTable.userId, pushSubscriptionsTable.endpoint],
      set:    { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

export async function supprimerSubscription(userId: number, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  void endpoint;
}

export async function envoyerPushNotification(userId: number, payload: {
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("VAPID keys non configurées — push ignoré");
    return;
  }

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (subs.length === 0) return;

  const data = JSON.stringify({ titre: payload.title, message: payload.body, url: payload.url });

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await db.delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, s.id));
        } else {
          logger.error({ err, userId }, "Erreur envoi push notification");
        }
      }
    })
  );
}
