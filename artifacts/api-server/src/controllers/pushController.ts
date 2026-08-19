import { type Request, type Response } from "express";
import { VAPID_PUBLIC_KEY, sauvegarderSubscription, supprimerSubscription } from "../services/pushService.js";

export async function getVapidPublicKey(_req: Request, res: Response): Promise<void> {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
}

export async function subscribePush(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const sub = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    res.status(400).json({ erreur: "Subscription invalide" }); return;
  }

  try {
    await sauvegarderSubscription(userId, {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur subscribePush");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function unsubscribePush(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ erreur: "endpoint requis" }); return; }

  try {
    await supprimerSubscription(userId, endpoint);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur unsubscribePush");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
