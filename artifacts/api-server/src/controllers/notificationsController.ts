import { type Request, type Response } from "express";
import {
  listNotifications,
  countNotifications,
  marquerNotifLue,
  marquerToutesLues,
  supprimerNotif,
  getPreferencesNotifications,
  upsertPreferencesNotifications,
  countNonLuesParModule,
} from "../services/notificationService";

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const { lu, gravite, page = "1", limit = "20" } = req.query as Record<string, string>;

  try {
    const result = await listNotifications(userId, {
      lu:      lu === "true" ? true : lu === "false" ? false : undefined,
      gravite: gravite || undefined,
      page:    Math.max(1, parseInt(page) || 1),
      limit:   Math.min(100, Math.max(1, parseInt(limit) || 20)),
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur getNotifications");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getNotificationsCount(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  try {
    const counts = await countNotifications(userId);
    res.json(counts);
  } catch (err) {
    req.log.error({ err }, "Erreur getNotificationsCount");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function marquerLue(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  try {
    const ok = await marquerNotifLue(id, userId);
    if (!ok) { res.status(404).json({ erreur: "Notification introuvable" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur marquerLue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function marquerToutLu(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  try {
    const nb = await marquerToutesLues(userId);
    res.json({ marquees: nb });
  } catch (err) {
    req.log.error({ err }, "Erreur marquerToutLu");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function supprimerNotification(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  try {
    const ok = await supprimerNotif(id, userId);
    if (!ok) { res.status(404).json({ erreur: "Notification introuvable" }); return; }
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Erreur supprimerNotification");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getPreferences(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  try {
    const prefs = await getPreferencesNotifications(userId);
    if (!prefs) {
      // Retourner les valeurs par défaut
      res.json({
        notif_stock_faible:             true,
        notif_avance_retard:            true,
        notif_creance_retard:           true,
        notif_refus_non_traite:         true,
        notif_anomalie_critique:        true,
        notif_certification_expiration: true,
        notif_echeance_emprunt:         true,
        notif_bulletin_attente:         true,
        notif_ecriture_attente:         true,
        notif_ag_planifiee:             true,
        notif_message_recu:             true,
        notif_budget_depasse:           true,
        notif_prix_change:              true,
        recevoir_sms:                   false,
        recevoir_email:                 false,
      });
      return;
    }
    res.json({
      notif_stock_faible:             prefs.notifStockFaible,
      notif_avance_retard:            prefs.notifAvanceRetard,
      notif_creance_retard:           prefs.notifCreanceRetard,
      notif_refus_non_traite:         prefs.notifRefusNonTraite,
      notif_anomalie_critique:        prefs.notifAnomalieCritique,
      notif_certification_expiration: prefs.notifCertificationExpiration,
      notif_echeance_emprunt:         prefs.notifEcheanceEmprunt,
      notif_bulletin_attente:         prefs.notifBulletinAttente,
      notif_ecriture_attente:         prefs.notifEcritureAttente,
      notif_ag_planifiee:             prefs.notifAgPlanifiee,
      notif_message_recu:             prefs.notifMessageRecu,
      notif_budget_depasse:           prefs.notifBudgetDepasse,
      notif_prix_change:              prefs.notifPrixChange,
      recevoir_sms:                   prefs.recevoirSms,
      recevoir_email:                 prefs.recevoirEmail,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getPreferences");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const cooperativeId = req.user?.cooperativeId ?? null;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const body = req.body as {
    notif_stock_faible?:             boolean;
    notif_avance_retard?:            boolean;
    notif_creance_retard?:           boolean;
    notif_refus_non_traite?:         boolean;
    notif_anomalie_critique?:        boolean;
    notif_certification_expiration?: boolean;
    notif_echeance_emprunt?:         boolean;
    notif_bulletin_attente?:         boolean;
    notif_ecriture_attente?:         boolean;
    notif_ag_planifiee?:             boolean;
    notif_message_recu?:             boolean;
    notif_budget_depasse?:           boolean;
    notif_prix_change?:              boolean;
    recevoir_sms?:                   boolean;
    recevoir_email?:                 boolean;
  };

  try {
    const updated = await upsertPreferencesNotifications(userId, cooperativeId, {
      notifStockFaible:             body.notif_stock_faible,
      notifAvanceRetard:            body.notif_avance_retard,
      notifCreanceRetard:           body.notif_creance_retard,
      notifRefusNonTraite:          body.notif_refus_non_traite,
      notifAnomalieCritique:        body.notif_anomalie_critique,
      notifCertificationExpiration: body.notif_certification_expiration,
      notifEcheanceEmprunt:         body.notif_echeance_emprunt,
      notifBulletinAttente:         body.notif_bulletin_attente,
      notifEcritureAttente:         body.notif_ecriture_attente,
      notifAgPlanifiee:             body.notif_ag_planifiee,
      notifMessageRecu:             body.notif_message_recu,
      notifBudgetDepasse:           body.notif_budget_depasse,
      notifPrixChange:              body.notif_prix_change,
      recevoirSms:                  body.recevoir_sms,
      recevoirEmail:                body.recevoir_email,
    });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur updatePreferences");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
