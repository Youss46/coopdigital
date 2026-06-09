import {
  db,
  notificationsTable,
  preferencesNotificationsTable,
  usersTable,
  type UserRole,
} from "@workspace/db";
import { eq, and, desc, count, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";



// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifType =
  | "stock_faible"
  | "avance_retard"
  | "creance_retard"
  | "refus_non_traite"
  | "anomalie_critique"
  | "certification_expiration"
  | "echeance_emprunt"
  | "bulletin_attente"
  | "ecriture_attente"
  | "cloture_campagne"
  | "ag_planifiee"
  | "message_recu"
  | "livraison_anomalie"
  | "budget_depasse"
  | "prix_change";

export type NotifGravite = "info" | "attention" | "critique";

export type NotifPayload = {
  type:         NotifType;
  titre:        string;
  message:      string;
  lien?:        string;
  lienLibelle?: string;
  gravite:      NotifGravite;
  sourceModule?: string;
  sourceId?:    number;
};

// Mapping type → colonne préférence
const PREF_COL: Record<NotifType, keyof typeof preferencesNotificationsTable.$inferSelect> = {
  stock_faible:             "notifStockFaible",
  avance_retard:            "notifAvanceRetard",
  creance_retard:           "notifCreanceRetard",
  refus_non_traite:         "notifRefusNonTraite",
  anomalie_critique:        "notifAnomalieCritique",
  certification_expiration: "notifCertificationExpiration",
  echeance_emprunt:         "notifEcheanceEmprunt",
  bulletin_attente:         "notifBulletinAttente",
  ecriture_attente:         "notifEcritureAttente",
  cloture_campagne:         "notifAgPlanifiee",
  ag_planifiee:             "notifAgPlanifiee",
  message_recu:             "notifMessageRecu",
  livraison_anomalie:       "notifAnomalieCritique",
  budget_depasse:           "notifBudgetDepasse",
  prix_change:              "notifPrixChange",
};

// ─── Créer des notifications pour une liste de users ──────────────────────────

export async function creerNotification(
  cooperativeId: number,
  userIds: number[],
  payload: NotifPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  try {
    // Récupérer les préférences de chaque user
    const prefs = await db
      .select()
      .from(preferencesNotificationsTable)
      .where(inArray(preferencesNotificationsTable.userId, userIds));

    const prefsMap = new Map(prefs.map((p) => [p.userId, p]));
    const prefCol = PREF_COL[payload.type];

    const destinataires = userIds.filter((uid) => {
      const pref = prefsMap.get(uid);
      if (!pref) return true; // pas de préférence = accepte tout
      return pref[prefCol] !== false;
    });

    if (destinataires.length === 0) return;

    await db.insert(notificationsTable).values(
      destinataires.map((uid) => ({
        cooperativeId,
        userId:       uid,
        type:         payload.type,
        titre:        payload.titre,
        message:      payload.message,
        lien:         payload.lien         ?? null,
        lienLibelle:  payload.lienLibelle  ?? null,
        gravite:      payload.gravite,
        sourceModule: payload.sourceModule ?? null,
        sourceId:     payload.sourceId     ?? null,
        lu:           false,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Erreur creerNotification");
  }
}

// ─── Notifier par rôle ────────────────────────────────────────────────────────

export async function notifierParRole(
  cooperativeId: number,
  roles: string[],
  payload: NotifPayload,
): Promise<void> {
  try {
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.cooperativeId, cooperativeId),
          eq(usersTable.actif, true),
          inArray(usersTable.role, roles as UserRole[]),
        ),
      );

    const ids = users.map((u) => u.id);
    await creerNotification(cooperativeId, ids, payload);
  } catch (err) {
    logger.error({ err }, "Erreur notifierParRole");
  }
}

// ─── Triggers automatiques ────────────────────────────────────────────────────

export async function notifStockFaible(cooperativeId: number, intrant: string, stockActuel: number, seuilMin: number): Promise<void> {
  await notifierParRole(cooperativeId, ["pca", "directeur", "magasinier"], {
    type:         "stock_faible",
    gravite:      "attention",
    titre:        `Stock faible — ${intrant}`,
    message:      `Le stock de ${intrant} est sous le seuil minimum (${stockActuel} kg restants, minimum : ${seuilMin} kg)`,
    lien:         "/stocks",
    lienLibelle:  "Voir les stocks",
    sourceModule: "stocks",
  });
}

export async function notifAnomalieCritique(cooperativeId: number, description: string, anomalieId: number): Promise<void> {
  await notifierParRole(cooperativeId, ["pca", "directeur"], {
    type:         "anomalie_critique",
    gravite:      "critique",
    titre:        "Anomalie critique détectée",
    message:      description,
    lien:         "/anomalies",
    lienLibelle:  "Voir les anomalies",
    sourceModule: "anomalies",
    sourceId:     anomalieId,
  });
}

export async function notifPrixChange(cooperativeId: number, prixKg: number): Promise<void> {
  await notifierParRole(cooperativeId, ["pca", "directeur", "delegue"], {
    type:         "prix_change",
    gravite:      "info",
    titre:        "Prix bord champ mis à jour",
    message:      `Le nouveau prix bord champ est de ${prixKg.toLocaleString("fr-FR")} FCFA/kg`,
    lien:         "/prix",
    lienLibelle:  "Voir l'historique",
    sourceModule: "prix",
  });
}

export async function notifMessageRecu(cooperativeId: number, expediteur: string, messageId: number): Promise<void> {
  await notifierParRole(cooperativeId, ["pca", "directeur"], {
    type:         "message_recu",
    gravite:      "info",
    titre:        `Nouveau message de ${expediteur}`,
    message:      `Vous avez reçu un nouveau message de ${expediteur}`,
    lien:         "/communication",
    lienLibelle:  "Voir les messages",
    sourceModule: "communication",
    sourceId:     messageId,
  });
}

export async function notifBulletinAttente(cooperativeId: number, nb: number): Promise<void> {
  await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
    type:         "bulletin_attente",
    gravite:      "attention",
    titre:        `${nb} bulletin${nb > 1 ? "s" : ""} en attente de validation`,
    message:      `${nb} bulletin${nb > 1 ? "s" : ""} de salaire attende${nb > 1 ? "nt" : ""} votre validation`,
    lien:         "/salaires",
    lienLibelle:  "Voir les salaires",
    sourceModule: "salaires",
  });
}

// ─── Requêtes ─────────────────────────────────────────────────────────────────

export async function listNotifications(userId: number, opts: {
  lu?:      boolean;
  gravite?: string;
  page:     number;
  limit:    number;
}) {
  const { lu, gravite, page, limit } = opts;
  const offset = (page - 1) * limit;

  const conditions = [eq(notificationsTable.userId, userId)];
  if (lu !== undefined)       conditions.push(eq(notificationsTable.lu, lu));
  if (gravite !== undefined)  conditions.push(eq(notificationsTable.gravite, gravite as NotifGravite));

  const where = and(...conditions);

  const [rows, totalRow] = await Promise.all([
    db.select().from(notificationsTable).where(where)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(notificationsTable).where(where),
  ]);

  return { notifications: rows, total: totalRow[0]?.total ?? 0, page, limit };
}

export async function countNotifications(userId: number) {
  const rows = await db
    .select({
      lu:      notificationsTable.lu,
      gravite: notificationsTable.gravite,
      nb:      count(),
    })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .groupBy(notificationsTable.lu, notificationsTable.gravite);

  let total = 0;
  let non_lues = 0;
  let critiques_non_lues = 0;

  for (const r of rows) {
    total += Number(r.nb);
    if (!r.lu) {
      non_lues += Number(r.nb);
      if (r.gravite === "critique") critiques_non_lues += Number(r.nb);
    }
  }

  return { total, non_lues, critiques_non_lues };
}

export async function marquerNotifLue(id: number, userId: number): Promise<boolean> {
  const [updated] = await db
    .update(notificationsTable)
    .set({ lu: true, dateLu: new Date() })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)))
    .returning({ id: notificationsTable.id });
  return !!updated;
}

export async function marquerToutesLues(userId: number): Promise<number> {
  const rows = await db
    .update(notificationsTable)
    .set({ lu: true, dateLu: new Date() })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.lu, false)))
    .returning({ id: notificationsTable.id });
  return rows.length;
}

export async function supprimerNotif(id: number, userId: number): Promise<boolean> {
  const [deleted] = await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)))
    .returning({ id: notificationsTable.id });
  return !!deleted;
}

// ─── Préférences ──────────────────────────────────────────────────────────────

export async function getPreferencesNotifications(userId: number) {
  const [pref] = await db
    .select()
    .from(preferencesNotificationsTable)
    .where(eq(preferencesNotificationsTable.userId, userId))
    .limit(1);
  return pref ?? null;
}

export async function upsertPreferencesNotifications(
  userId: number,
  cooperativeId: number | null,
  data: Partial<Omit<typeof preferencesNotificationsTable.$inferInsert, "id" | "userId" | "cooperativeId">>,
) {
  const existing = await getPreferencesNotifications(userId);

  if (existing) {
    const [updated] = await db
      .update(preferencesNotificationsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(preferencesNotificationsTable.userId, userId))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(preferencesNotificationsTable)
      .values({ userId, cooperativeId, ...data })
      .returning();
    return created;
  }
}

// ─── Count par module (pour badges sidebar) ───────────────────────────────────

export async function countNonLuesParModule(userId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({
      sourceModule: notificationsTable.sourceModule,
      nb:           count(),
    })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.lu, false),
        sql`${notificationsTable.sourceModule} IS NOT NULL`,
      ),
    )
    .groupBy(notificationsTable.sourceModule);

  return Object.fromEntries(
    rows
      .filter((r) => r.sourceModule !== null)
      .map((r) => [r.sourceModule as string, Number(r.nb)]),
  );
}
