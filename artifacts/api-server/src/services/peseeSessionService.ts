import {
  db,
  sessionsPeseeTable,
  lignesPeseeTable,
  membresTable,
  livraisonsTable,
  paiementsTable,
  avancesTable,
  configPeseeTable,
  transfertsStockTable,
  mouvementsStockTable,
  entrepotsTable,
  entrepotsDeleguesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, lte, isNull, inArray } from "drizzle-orm";
import { getPrixActuel } from "./terrainService.js";
import { generateEcrituresLivraison } from "./comptabiliteService.js";
import { getEncoursMembreTx, enregistrerRemboursementParLivraison } from "./intrantsService.js";
import { creerNotification, notifierParRole } from "./notificationService.js";
import { genererNumeroRecu } from "./recuService.js";
import { logger } from "../lib/logger.js";

// ─── Génération numéro de session ─────────────────────────────────────────────
async function generateNumeroSession(cooperativeId: number): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PSE-${year}-`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsPeseeTable)
    .where(
      and(
        eq(sessionsPeseeTable.cooperativeId, cooperativeId),
        sql`to_char(${sessionsPeseeTable.createdAt}, 'YYYY') = ${String(year)}`,
      ),
    );
  const seq = (row?.count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

// ─── Créer une session ────────────────────────────────────────────────────────

/** Thrown when an `en_cours` session already exists for the same (coop, membre). */
export class SessionEnCoursError extends Error {
  readonly code = "SESSION_EN_COURS";
  constructor(
    public readonly sessionId: number,
    public readonly numeroSession: string,
  ) {
    super(`Une session en cours existe déjà pour ce membre (${numeroSession})`);
    this.name = "SessionEnCoursError";
  }
}

/** Thrown when a weighing session already exists for the given transfer. */
export class SessionTransfertExistanteError extends Error {
  readonly code = "SESSION_TRANSFERT_EXISTANTE";
  constructor(public readonly sessionId: number) {
    super(`Une session de pesée est déjà associée à ce transfert (session #${sessionId})`);
    this.name = "SessionTransfertExistanteError";
  }
}

export async function createSession(
  cooperativeId: number,
  data: {
    membreId?: number;
    produit?: string;
    operation?: string;
    peseurId?: number;
    balanceId?: number;
    notes?: string;
    /** ID du transfert pour une session de type 'reception_transfert' */
    transfertId?: number;
  },
) {
  // ── Cas 1 : session de réception de transfert (atomique) ─────────────────
  if (data.transfertId) {
    const transfertId = data.transfertId;

    // #16 — Vérifier que la config pesée est configurée avant de démarrer
    const [peseeConfigCheck] = await db
      .select({ id: configPeseeTable.id, ecartMaxAutorisePct: configPeseeTable.ecartMaxAutorisePct })
      .from(configPeseeTable)
      .where(eq(configPeseeTable.cooperativeId, cooperativeId))
      .limit(1);

    if (!peseeConfigCheck) {
      throw new Error(
        "La configuration de pesée n'est pas encore définie pour cette coopérative. " +
        "Veuillez configurer les paramètres de pesée (seuil d'écart autorisé, délai d'expiration) " +
        "dans l'espace gestionnaire avant de démarrer une session de réception de transfert.",
      );
    }

    const numeroSession = await generateNumeroSession(cooperativeId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await db.transaction(async (tx: any) => {
      // Lire le transfert avec verrou implicite (dans la transaction)
      const [t] = await tx
        .select({ id: transfertsStockTable.id, statut: transfertsStockTable.statut, sessionPeseeId: transfertsStockTable.sessionPeseeId })
        .from(transfertsStockTable)
        .where(and(eq(transfertsStockTable.id, transfertId), eq(transfertsStockTable.cooperativeId, cooperativeId)))
        .limit(1);

      if (!t) throw new Error("Transfert introuvable");
      if (t.statut !== "arrive") {
        throw new Error(`Le transfert doit être en statut 'arrivé' pour démarrer une pesée (statut actuel : ${t.statut})`);
      }
      if (t.sessionPeseeId != null) throw new SessionTransfertExistanteError(t.sessionPeseeId);

      // Créer la session
      const [s] = await tx
        .insert(sessionsPeseeTable)
        .values({
          cooperativeId,
          numeroSession,
          membreId: null,
          produit: data.produit ?? "cacao",
          operation: "reception_transfert",
          peseurId: data.peseurId,
          balanceId: data.balanceId,
          notes: data.notes,
          transfertId,
        })
        .returning();

      // Conditional update : n'accepte que les transferts encore 'arrive' sans session
      const claimed = await tx
        .update(transfertsStockTable)
        .set({ statut: "en_pesee", sessionPeseeId: s!.id, updatedAt: new Date() })
        .where(and(
          eq(transfertsStockTable.id, transfertId),
          eq(transfertsStockTable.statut, "arrive"),
          isNull(transfertsStockTable.sessionPeseeId),
        ))
        .returning({ id: transfertsStockTable.id });

      if (claimed.length === 0) {
        // Une autre requête parallèle a revendiqué le transfert entre le SELECT et l'UPDATE
        const [rival] = await tx
          .select({ sessionPeseeId: transfertsStockTable.sessionPeseeId })
          .from(transfertsStockTable)
          .where(eq(transfertsStockTable.id, transfertId))
          .limit(1);
        throw new SessionTransfertExistanteError(rival?.sessionPeseeId ?? 0);
      }

      return s!;
    });

    return session;
  }

  // ── Cas 2 : session membre — vérifier l'unicité en cours ────────────────
  if (data.membreId) {
    const [existing] = await db
      .select({
        id: sessionsPeseeTable.id,
        numeroSession: sessionsPeseeTable.numeroSession,
      })
      .from(sessionsPeseeTable)
      .where(
        and(
          eq(sessionsPeseeTable.cooperativeId, cooperativeId),
          eq(sessionsPeseeTable.membreId, data.membreId),
          sql`${sessionsPeseeTable.statut}::text = 'en_cours'`,
        ),
      )
      .limit(1);

    if (existing) {
      throw new SessionEnCoursError(existing.id, existing.numeroSession);
    }
  }

  const numeroSession = await generateNumeroSession(cooperativeId);
  try {
    const [session] = await db
      .insert(sessionsPeseeTable)
      .values({
        cooperativeId,
        numeroSession,
        membreId: data.membreId ?? null,
        produit: data.produit ?? "cacao",
        operation: data.operation ?? "reception",
        peseurId: data.peseurId,
        balanceId: data.balanceId,
        notes: data.notes,
        transfertId: null,
      })
      .returning();

    return session!;
  } catch (err) {
    // PostgreSQL unique-constraint violation (23505) means a concurrent request
    // won the race and already inserted an en_cours session for the same member.
    if (
      data.membreId &&
      typeof err === "object" &&
      err !== null &&
      (err as Record<string, unknown>)["code"] === "23505"
    ) {
      const [existing] = await db
        .select({ id: sessionsPeseeTable.id, numeroSession: sessionsPeseeTable.numeroSession })
        .from(sessionsPeseeTable)
        .where(
          and(
            eq(sessionsPeseeTable.cooperativeId, cooperativeId),
            eq(sessionsPeseeTable.membreId, data.membreId),
            sql`${sessionsPeseeTable.statut}::text = 'en_cours'`,
          ),
        )
        .limit(1);
      if (existing) {
        throw new SessionEnCoursError(existing.id, existing.numeroSession);
      }
    }
    throw err;
  }
}

// ─── Lister sessions (avec lignes count) ──────────────────────────────────────
export async function getSessions(
  cooperativeId: number,
  opts: { statut?: string; membreId?: number; limit?: number; peseurId?: number; dateDebut?: string; dateFin?: string } = {},
) {
  const conditions = [eq(sessionsPeseeTable.cooperativeId, cooperativeId)];
  if (opts.statut) {
    conditions.push(
      sql`${sessionsPeseeTable.statut}::text = ${opts.statut}`,
    );
  }
  if (opts.membreId) {
    conditions.push(eq(sessionsPeseeTable.membreId, opts.membreId));
  }
  // Peseur : ne voit que ses propres sessions
  if (opts.peseurId !== undefined) {
    conditions.push(eq(sessionsPeseeTable.peseurId, opts.peseurId));
  }
  if (opts.dateDebut) {
    conditions.push(gte(sessionsPeseeTable.dateDebut, new Date(opts.dateDebut)));
  }
  if (opts.dateFin) {
    conditions.push(lte(sessionsPeseeTable.dateDebut, new Date(opts.dateFin)));
  }

  const sessions = await db
    .select({
      id: sessionsPeseeTable.id,
      cooperativeId: sessionsPeseeTable.cooperativeId,
      numeroSession: sessionsPeseeTable.numeroSession,
      membreId: sessionsPeseeTable.membreId,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      produit: sessionsPeseeTable.produit,
      operation: sessionsPeseeTable.operation,
      statut: sessionsPeseeTable.statut,
      poidsTotalKg: sessionsPeseeTable.poidsTotalKg,
      nbSacsTotal: sessionsPeseeTable.nbSacsTotal,
      nbLignes: sql<number>`(
        select count(*) from lignes_pesee lp where lp.session_id = ${sessionsPeseeTable.id}
      )::int`,
      dateDebut: sessionsPeseeTable.dateDebut,
      dateFin: sessionsPeseeTable.dateFin,
      notes: sessionsPeseeTable.notes,
      livraisonId: sessionsPeseeTable.livraisonId,
      createdAt: sessionsPeseeTable.createdAt,
    })
    .from(sessionsPeseeTable)
    .leftJoin(membresTable, eq(membresTable.id, sessionsPeseeTable.membreId))
    .where(and(...conditions))
    .orderBy(desc(sessionsPeseeTable.createdAt))
    .limit(opts.limit ?? 50);

  return sessions;
}

// ─── Détail session avec lignes ───────────────────────────────────────────────
export async function getSessionDetail(cooperativeId: number, sessionId: number) {
  const [session] = await db
    .select({
      id: sessionsPeseeTable.id,
      cooperativeId: sessionsPeseeTable.cooperativeId,
      numeroSession: sessionsPeseeTable.numeroSession,
      membreId: sessionsPeseeTable.membreId,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      produit: sessionsPeseeTable.produit,
      operation: sessionsPeseeTable.operation,
      statut: sessionsPeseeTable.statut,
      poidsTotalKg: sessionsPeseeTable.poidsTotalKg,
      nbSacsTotal: sessionsPeseeTable.nbSacsTotal,
      dateDebut: sessionsPeseeTable.dateDebut,
      dateFin: sessionsPeseeTable.dateFin,
      notes: sessionsPeseeTable.notes,
      livraisonId: sessionsPeseeTable.livraisonId,
      transfertId: sessionsPeseeTable.transfertId,
      createdAt: sessionsPeseeTable.createdAt,
      // ── Contexte transfert (#15) ──────────────────────────────────────
      transfertNumero:           transfertsStockTable.numeroTransfert,
      transfertPoidsDeclaréKg:   transfertsStockTable.poidsDepart_kg,
      transfertNombreSacs:       transfertsStockTable.nombreSacs,
      transfertEntrepotNom:      entrepotsDeleguesTable.nom,
      transfertZoneNom:          entrepotsDeleguesTable.zoneNom,
      transfertDelegueNom:       usersTable.nom,
      transfertDeleguePrenoms:   usersTable.prenoms,
    })
    .from(sessionsPeseeTable)
    .leftJoin(membresTable, eq(membresTable.id, sessionsPeseeTable.membreId))
    .leftJoin(transfertsStockTable, eq(transfertsStockTable.id, sessionsPeseeTable.transfertId))
    .leftJoin(entrepotsDeleguesTable, eq(entrepotsDeleguesTable.id, transfertsStockTable.entrepotSourceId))
    .leftJoin(usersTable, eq(usersTable.id, transfertsStockTable.delegueId))
    .where(
      and(
        eq(sessionsPeseeTable.id, sessionId),
        eq(sessionsPeseeTable.cooperativeId, cooperativeId),
      ),
    )
    .limit(1);

  if (!session) return null;

  const lignes = await db
    .select()
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId))
    .orderBy(lignesPeseeTable.numeroPassage);

  return { ...session, lignes };
}

// ─── Ajouter une ligne ────────────────────────────────────────────────────────
export async function addLigne(
  cooperativeId: number,
  sessionId: number,
  data: { nbSacs: number; poidsBrutKg: number; tareKg?: number; notes?: string },
) {
  // Tout est dans une transaction avec verrou FOR UPDATE sur la session.
  // Cela sérialise avec finaliserReceptionTransfertTx (qui prend le même verrou).
  return db.transaction(async (tx: any) => {
    // Verrouillage de la ligne session — bloque finalisation concurrente et vice-versa
    const [session] = await tx
      .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut, nbSacsTotal: sessionsPeseeTable.nbSacsTotal, poidsTotalKg: sessionsPeseeTable.poidsTotalKg })
      .from(sessionsPeseeTable)
      .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);

    if (!session) throw new Error("Session introuvable");
    if (session.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");

    // Numéro de passage
    const [{ maxPassage }] = await tx
      .select({ maxPassage: sql<number>`coalesce(max(${lignesPeseeTable.numeroPassage}), 0)::int` })
      .from(lignesPeseeTable)
      .where(eq(lignesPeseeTable.sessionId, sessionId));

    const [ligne] = await tx
      .insert(lignesPeseeTable)
      .values({
        sessionId,
        numeroPassage: maxPassage + 1,
        nbSacs: data.nbSacs,
        poidsBrutKg: String(data.poidsBrutKg),
        tareKg: String(data.tareKg ?? 0),
        notes: data.notes,
      })
      .returning();

    const poidsNet = data.poidsBrutKg - (data.tareKg ?? 0);
    await tx
      .update(sessionsPeseeTable)
      .set({
        nbSacsTotal: (session.nbSacsTotal ?? 0) + data.nbSacs,
        poidsTotalKg: String(parseFloat(String(session.poidsTotalKg ?? 0)) + poidsNet),
      })
      .where(eq(sessionsPeseeTable.id, sessionId));

    return ligne!;
  });
}

// ─── Supprimer une ligne ──────────────────────────────────────────────────────
export async function deleteLigne(cooperativeId: number, sessionId: number, ligneId: number) {
  await db.transaction(async (tx: any) => {
    // Verrou FOR UPDATE — sérialise avec finaliserReceptionTransfertTx
    const [session] = await tx
      .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut })
      .from(sessionsPeseeTable)
      .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);

    if (!session) throw new Error("Session introuvable");
    if (session.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");

    const [ligne] = await tx
      .select()
      .from(lignesPeseeTable)
      .where(and(eq(lignesPeseeTable.id, ligneId), eq(lignesPeseeTable.sessionId, sessionId)))
      .limit(1);

    if (!ligne) throw new Error("Ligne introuvable");

    await tx.delete(lignesPeseeTable).where(eq(lignesPeseeTable.id, ligneId));

    // Recalcul des totaux depuis les lignes restantes
    const [totaux] = await tx
      .select({
        nbSacs: sql<number>`coalesce(sum(${lignesPeseeTable.nbSacs}), 0)::int`,
        poids: sql<number>`coalesce(sum(${lignesPeseeTable.poidsBrutKg}::numeric - ${lignesPeseeTable.tareKg}::numeric), 0)::float`,
      })
      .from(lignesPeseeTable)
      .where(eq(lignesPeseeTable.sessionId, sessionId));

    await tx
      .update(sessionsPeseeTable)
      .set({ nbSacsTotal: totaux?.nbSacs ?? 0, poidsTotalKg: String(totaux?.poids ?? 0) })
      .where(eq(sessionsPeseeTable.id, sessionId));
  });
}

// ─── Terminer une session ─────────────────────────────────────────────────────
export async function terminerSession(cooperativeId: number, sessionId: number) {
  const detail = await getSessionDetail(cooperativeId, sessionId);
  if (!detail) throw new Error("Session introuvable");
  if (detail.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");
  if ((detail.lignes?.length ?? 0) === 0) throw new Error("Aucune pesée enregistrée dans cette session");

  // ── Réception de transfert : finalisation atomique dans une transaction ───
  // IMPORTANT: poidsPeseKg est calculé depuis les lignes DANS la transaction (pas depuis
  // le total mis en cache sur la session, qui pourrait être modifié par un addLigne concurrent)
  if (detail.operation === "reception_transfert" && detail.transfertId) {
    const result = await db.transaction(async (tx) => {
      return finaliserReceptionTransfertTx(tx, cooperativeId, sessionId, detail.transfertId!);
    });

    // Notifications HORS transaction (non-critiques pour la cohérence)
    void envoyerNotificationsReception(cooperativeId, result.transfert, result.poidsPeseKg, result.ecartKg, result.pctEcart, sessionId);

    return { ...detail, statut: "terminee" as const, dateFin: result.dateFin, receptionConfirmee: true as const, statutTransfert: result.statutFinal };
  }

  // ── Session membre classique ──────────────────────────────────────────────
  const [updated] = await db
    .update(sessionsPeseeTable)
    .set({ statut: "terminee", dateFin: new Date() })
    .where(eq(sessionsPeseeTable.id, sessionId))
    .returning();

  return { ...detail, statut: "terminee" as const, dateFin: updated?.dateFin };
}

// ─── Finalisation atomique (dans une transaction) ────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function finaliserReceptionTransfertTx(
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction type not directly importable
  tx: any,
  cooperativeId: number,
  sessionId: number,
  transfertId: number,
) {
  const now = new Date();

  // 0. Verrouiller la ligne session (SELECT FOR UPDATE) — sérialise avec addLigne/deleteLigne
  //    qui prennent le même verrou. Le premier arrivé impose sa vue des lignes.
  const [lockedSession] = await tx
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .for("update")
    .limit(1);

  if (!lockedSession) throw new Error("Session introuvable");
  if (lockedSession.statut !== "en_cours") {
    throw new Error("Session déjà annulée ou terminée — la clôture est impossible");
  }

  // 0b. Calculer le poids officiel depuis les lignes SOUS le verrou (cohérence garantie)
  const [totauxLignes] = await tx
    .select({
      poids: sql<number>`coalesce(sum(${lignesPeseeTable.poidsBrutKg}::numeric - ${lignesPeseeTable.tareKg}::numeric), 0)::float`,
      nbSacs: sql<number>`coalesce(sum(${lignesPeseeTable.nbSacs}), 0)::int`,
    })
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId));

  const poidsPeseKg: number = totauxLignes?.poids ?? 0;
  if (poidsPeseKg <= 0) {
    throw new Error("Aucun poids pesé dans cette session — impossible de finaliser");
  }

  // 1. Charger le transfert (dans la transaction pour cohérence)
  const [t] = await tx
    .select()
    .from(transfertsStockTable)
    .where(and(eq(transfertsStockTable.id, transfertId), eq(transfertsStockTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!t) throw new Error(`Transfert #${transfertId} introuvable — impossible de clôturer la session`);

  // #16 — Charger le seuil d'écart autorisé depuis la config (dans la tx pour cohérence)
  const [peseeConfig] = await tx
    .select({ ecartMaxAutorisePct: configPeseeTable.ecartMaxAutorisePct })
    .from(configPeseeTable)
    .where(eq(configPeseeTable.cooperativeId, cooperativeId))
    .limit(1);
  // La config a déjà été vérifiée dans createSession ; le default 0.5 est une dernière protection
  const ecartSeuilPct = parseFloat(String(peseeConfig?.ecartMaxAutorisePct ?? 0.5));

  const poidsDepart = parseFloat(String(t.poidsDepart_kg ?? 0));
  const ecartKg = poidsDepart - poidsPeseKg;
  const pctEcart = poidsDepart > 0 ? Math.abs(ecartKg / poidsDepart) * 100 : 0;
  const estLitige = pctEcart > ecartSeuilPct;
  const statutFinal = estLitige ? "litige" : "confirme";
  logger.info({ transfertId, sessionId, pctEcart, ecartSeuilPct, estLitige }, "Calcul écart réception");

  // 2. Clôturer la session — conditionnel : doit toujours être en_cours (pas annulée)
  const [updatedSession] = await tx
    .update(sessionsPeseeTable)
    .set({ statut: "terminee", dateFin: now })
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.statut, "en_cours")))
    .returning();

  if (!updatedSession) {
    throw new Error("Session déjà annulée ou terminée — la clôture est impossible (annulation concurrent ?)");
  }

  // 3. Mettre à jour le transfert — conditionnel : doit toujours être 'en_pesee' lié à CETTE session
  const updatedTransfert = await tx
    .update(transfertsStockTable)
    .set({
      statut: statutFinal,
      poidsArrivee_kg: String(poidsPeseKg),
      ecartKg: String(ecartKg),
      dateArrivee: t.dateArrivee ?? now,
      confirme_le: now,
      updatedAt: now,
    })
    .where(and(
      eq(transfertsStockTable.id, transfertId),
      eq(transfertsStockTable.statut, "en_pesee"),
      eq(transfertsStockTable.sessionPeseeId, sessionId),
    ))
    .returning({ id: transfertsStockTable.id });

  if (updatedTransfert.length === 0) {
    throw new Error(
      `Finalisation refusée : le transfert #${transfertId} n'est plus en attente de cette session ` +
      `(statut ou session_pesee_id incohérent). Annulation de la transaction.`,
    );
  }

  // 4. Si confirmé (pas de litige) : entrée en stock central
  if (!estLitige) {
    const [entrepotCentral] = await tx
      .select({ id: entrepotsTable.id })
      .from(entrepotsTable)
      .where(eq(entrepotsTable.cooperativeId, cooperativeId))
      .orderBy(entrepotsTable.id)
      .limit(1);

    if (!entrepotCentral) {
      throw new Error(
        `Aucun entrepôt central configuré pour la coopérative #${cooperativeId} — ` +
        `impossible de créditer le stock. La transaction est annulée; veuillez créer un entrepôt central avant de clôturer la réception.`,
      );
    }
    await tx.insert(mouvementsStockTable).values({
      entrepotId: entrepotCentral.id,
      type: "entree",
      poidsKg: String(poidsPeseKg),
      motif: `Transfert ${t.numeroTransfert} — pesée physique réception (session #${sessionId})`,
      agentId: null,
    });
    logger.info({ transfertId, sessionId, entrepotId: entrepotCentral.id, poidsPeseKg }, "Entrée stock central créée");
  }

  logger.info({ transfertId, sessionId, statutFinal, ecartKg, pctEcart }, "Réception transfert finalisée (atomique)");
  return { transfert: t, poidsPeseKg, ecartKg, pctEcart, statutFinal, dateFin: updatedSession?.dateFin ?? now };
}

// ─── Notifications post-transaction (non-critiques) ───────────────────────────
async function envoyerNotificationsReception(
  cooperativeId: number,
  t: { numeroTransfert: string; delegueId: number | null },
  poidsPeseKg: number,
  ecartKg: number,
  pctEcart: number,
  sessionId: number,
) {
  try {
    if (pctEcart > 0.5) {
      const poidsDepart = poidsPeseKg + ecartKg;
      await notifierParRole(cooperativeId, ["directeur", "pca"], {
        type: "transfert_litige",
        titre: `🔴 Écart transfert ${t.numeroTransfert} (pesée)`,
        message: `Départ : ${poidsDepart.toLocaleString("fr-FR")} kg — Pesé : ${poidsPeseKg.toLocaleString("fr-FR")} kg — Écart : ${Math.abs(ecartKg).toLocaleString("fr-FR")} kg (${pctEcart.toFixed(1)}%)`,
        lien: "/entrepots",
        lienLibelle: "Voir les transferts",
        gravite: "critique",
        sourceModule: "entrepots",
        sourceId: sessionId,
      });
    } else {
      await creerNotification(cooperativeId, t.delegueId != null ? [t.delegueId] : [], {
        type: "transfert_confirme",
        titre: `✅ Transfert ${t.numeroTransfert} confirmé par pesée`,
        message: `${poidsPeseKg.toLocaleString("fr-FR")} kg pesés et intégrés au magasin central.`,
        lien: "/entrepots",
        lienLibelle: "Voir les transferts",
        gravite: "info",
        sourceModule: "entrepots",
        sourceId: sessionId,
      });
    }
  } catch (err) {
    logger.warn({ err, sessionId }, "Erreur notification post-pesée (non bloquante)");
  }
}

// ─── Convertir une session terminée en livraison ─────────────────────────────
export async function creerLivraisonDepuisSession(
  cooperativeId: number,
  sessionId: number,
  data: {
    agentId?: number;
    /** ID du peseur ayant physiquement réalisé la session (traçabilité) */
    peseurId?: number;
  },
) {
  // 1. Get current price + active campaign (before transaction — read-only, safe)
  const { prixBordChampFcfa, campagneId } = await getPrixActuel(cooperativeId);

  // 2. Transaction: lock session row, validate, create livraison + paiement + stock atomically
  const result = await db.transaction(async (tx) => {
    // Lock the session row to prevent concurrent conversions
    const [session] = await tx
      .select({
        id: sessionsPeseeTable.id,
        cooperativeId: sessionsPeseeTable.cooperativeId,
        statut: sessionsPeseeTable.statut,
        membreId: sessionsPeseeTable.membreId,
        poidsTotalKg: sessionsPeseeTable.poidsTotalKg,
        nbSacsTotal: sessionsPeseeTable.nbSacsTotal,
        produit: sessionsPeseeTable.produit,
        livraisonId: sessionsPeseeTable.livraisonId,
        dateFin: sessionsPeseeTable.dateFin,
      })
      .from(sessionsPeseeTable)
      .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);

    if (!session) throw new Error("Session introuvable");
    if (session.statut !== "terminee") throw new Error("La session doit être terminée avant d'être convertie en livraison");
    if (session.livraisonId) throw new Error("Une livraison a déjà été créée pour cette session");
    if (!session.membreId) throw new Error("La session ne comporte pas de membre — impossible de créer une livraison");

    const poidsKg = parseFloat(String(session.poidsTotalKg ?? 0));
    if (poidsKg <= 0) throw new Error("Le poids total de la session est invalide (0 kg)");

    const montantBrut = Math.round(poidsKg * prixBordChampFcfa);
    const dateStr = session.dateFin
      ? (typeof session.dateFin === "string" ? session.dateFin : (session.dateFin as Date).toISOString().split("T")[0]!)
      : new Date().toISOString().split("T")[0]!;

    // ── Avances & intrants deductions (same logic as createLivraison) ─────
    // Both reads run inside the transaction with FOR UPDATE so concurrent
    // deliveries for the same member cannot see the same stale balance.
    const avanceRows = await tx
      .select()
      .from(avancesTable)
      .where(and(eq(avancesTable.membreId, session.membreId), eq(avancesTable.statut, "en_cours")))
      .orderBy(desc(avancesTable.dateOctroi))
      .for("update")
      .limit(1);
    const avanceEnCours = avanceRows[0];

    const encoursIntrants = await getEncoursMembreTx(tx, cooperativeId, session.membreId);

    const avanceDeduite = avanceEnCours
      ? Math.min(avanceEnCours.soldeRestantFcfa, montantBrut)
      : 0;
    const apresAvance = montantBrut - avanceDeduite;
    const intrantsDeduits = Math.min(encoursIntrants, Math.max(0, apresAvance));
    const montantNet = montantBrut - avanceDeduite - intrantsDeduits;

    const [livraison] = await tx
      .insert(livraisonsTable)
      .values({
        membreId: session.membreId,
        campagneId,
        poidsKg: String(poidsKg),
        prixUnitaireFcfa: prixBordChampFcfa,
        montantBrutFcfa: montantBrut,
        avanceDeduiteFcfa: avanceDeduite,
        intrantsDeduitsFcfa: intrantsDeduits,
        montantNetFcfa: montantNet,
        retenueKg: "0",
        nombreSacs: session.nbSacsTotal ?? null,
        produit: session.produit ?? "cacao",
        dateLivraison: dateStr,
        agentId: data.agentId ?? null,
        peseurId: data.peseurId ?? null,
      })
      .returning();

    const numeroRecu = await genererNumeroRecu(cooperativeId);

    const [paiement] = await tx
      .insert(paiementsTable)
      .values({
        livraisonId: livraison!.id,
        membreId: session.membreId,
        montantFcfa: montantNet,
        numeroRecu,
        // modePaiement intentionally null — chosen by the gestionnaire at settlement time
        statut: "en_attente",
      })
      .returning();

    // ── Mise à jour de l'avance ───────────────────────────────────────────
    if (avanceEnCours && avanceDeduite > 0) {
      const nouveauRembourse = avanceEnCours.montantRembourse_fcfa + avanceDeduite;
      const nouveauSolde = avanceEnCours.soldeRestantFcfa - avanceDeduite;
      await tx
        .update(avancesTable)
        .set({
          montantRembourse_fcfa: nouveauRembourse,
          soldeRestantFcfa: nouveauSolde,
          statut: nouveauSolde === 0 ? "rembourse" : "en_cours",
        })
        .where(eq(avancesTable.id, avanceEnCours.id));
    }

    // ── Remboursement intrants ────────────────────────────────────────────
    if (intrantsDeduits > 0) {
      await enregistrerRemboursementParLivraison(tx, cooperativeId, session.membreId, intrantsDeduits, dateStr);
    }

    // Link livraison back to session (session is locked — no concurrent writer)
    await tx
      .update(sessionsPeseeTable)
      .set({ livraisonId: livraison!.id })
      .where(eq(sessionsPeseeTable.id, sessionId));

    return { livraison: livraison!, paiement: paiement! };
  });

  // Écritures OHADA — fire-and-forget, hors transaction
  void (async () => {
    try {
      const [membre] = await db
        .select({ nom: membresTable.nom, prenoms: membresTable.prenoms })
        .from(membresTable)
        .where(eq(membresTable.id, result.livraison.membreId!))
        .limit(1);

      await generateEcrituresLivraison(cooperativeId, {
        livraisonId:       result.livraison.id,
        membreId:          result.livraison.membreId ?? undefined,
        membreNom:         membre ? `${membre.nom} ${membre.prenoms}` : "—",
        montantBrutFcfa:   result.livraison.montantBrutFcfa,
        avanceDeduiteFcfa: result.livraison.avanceDeduiteFcfa,
        montantNetFcfa:    result.livraison.montantNetFcfa,
        dateLivraison:     result.livraison.dateLivraison,
      });
    } catch (err) {
      // Ne pas bloquer la réponse — l'écriture sera visible dans les anomalies comptables
      console.error("[peseeSession] generateEcrituresLivraison failed", err);
    }
  })();

  return result;
}

// ─── Expiration automatique des sessions abandonnées ─────────────────────────

/**
 * Marque comme `annulee` toutes les sessions `en_cours` de cette coopérative
 * dont l'âge dépasse le seuil configuré (défaut : 8h).
 * Retourne le nombre de sessions expirées.
 */
export async function expirerSessionsStales(cooperativeId: number): Promise<number> {
  const [config] = await db
    .select({ delai: configPeseeTable.delaiExpirationSessionHeures })
    .from(configPeseeTable)
    .where(eq(configPeseeTable.cooperativeId, cooperativeId))
    .limit(1);

  const heures = config?.delai ?? 8;

  const now = new Date();
  const cutoff = sql`NOW() - interval '1 hour' * ${heures}`;

  // ── Étape 1 : trouver les sessions stales, séparées par type ────────────────
  const staleSessions = await db
    .select({
      id: sessionsPeseeTable.id,
      operation: sessionsPeseeTable.operation,
      transfertId: sessionsPeseeTable.transfertId,
    })
    .from(sessionsPeseeTable)
    .where(
      and(
        eq(sessionsPeseeTable.cooperativeId, cooperativeId),
        sql`${sessionsPeseeTable.statut}::text = 'en_cours'`,
        sql`${sessionsPeseeTable.createdAt} < ${cutoff}`,
      ),
    );

  if (staleSessions.length === 0) return 0;

  type StaleRow = { id: number; operation: string; transfertId: number | null };
  const regularIds = (staleSessions as StaleRow[])
    .filter((s: StaleRow) => !s.transfertId)
    .map((s: StaleRow) => s.id);
  const transfertSessions = (staleSessions as StaleRow[]).filter(
    (s: StaleRow): s is { id: number; operation: string; transfertId: number } => s.transfertId != null,
  );

  let expiredCount = 0;

  // ── Étape 2 : expirer les sessions membres en bulk (sans transfert) ──────────
  if (regularIds.length > 0) {
    const bulkExpired = await db
      .update(sessionsPeseeTable)
      .set({ statut: "annulee", dateFin: now })
      .where(and(inArray(sessionsPeseeTable.id, regularIds), eq(sessionsPeseeTable.statut, "en_cours")))
      .returning({ id: sessionsPeseeTable.id });
    expiredCount += bulkExpired.length;
  }

  // ── Étape 3 : expirer les sessions reception_transfert atomiquement ──────────
  for (const s of transfertSessions) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.transaction(async (tx: any) => {
        // Annuler la session (conditionnel — résiste à une clôture concurrente)
        const cancelled = await tx
          .update(sessionsPeseeTable)
          .set({ statut: "annulee", dateFin: now })
          .where(and(eq(sessionsPeseeTable.id, s.id), eq(sessionsPeseeTable.statut, "en_cours")))
          .returning({ id: sessionsPeseeTable.id });

        if (cancelled.length === 0) return; // clôturée entre-temps — pas d'erreur, on ignore

        // Restaurer le transfert uniquement s'il est toujours lié à CETTE session et en_pesee
        await tx
          .update(transfertsStockTable)
          .set({ statut: "arrive", sessionPeseeId: null, updatedAt: now })
          .where(and(
            eq(transfertsStockTable.id, s.transfertId),
            eq(transfertsStockTable.sessionPeseeId, s.id),
            eq(transfertsStockTable.statut, "en_pesee"),
          ));
      });
      expiredCount += 1;
    } catch (txErr) {
      logger.error({ txErr, sessionId: s.id, transfertId: s.transfertId }, "[pesee] Erreur atomique expiration session transfert");
    }
  }

  return expiredCount;
}

/**
 * Variante cron — parcourt toutes les coopératives qui ont des sessions en_cours
 * et expire celles qui sont périmées selon leur propre config.
 */
export async function expirerToutesSessionsStales(): Promise<void> {
  const coops = await db
    .selectDistinct({ cooperativeId: sessionsPeseeTable.cooperativeId })
    .from(sessionsPeseeTable)
    .where(sql`${sessionsPeseeTable.statut}::text = 'en_cours'`);

  for (const { cooperativeId } of coops) {
    try {
      const n = await expirerSessionsStales(cooperativeId);
      if (n > 0) {
        logger.info({ cooperativeId, n }, "[pesee] Sessions abandonnées expirées");
      }
    } catch (err) {
      logger.error({ err, cooperativeId }, "[pesee] Erreur expiration sessions stales");
    }
  }
}

// ─── Annuler une session ──────────────────────────────────────────────────────
export async function annulerSession(cooperativeId: number, sessionId: number) {
  const [session] = await db
    .select({
      id: sessionsPeseeTable.id,
      statut: sessionsPeseeTable.statut,
      operation: sessionsPeseeTable.operation,
      transfertId: sessionsPeseeTable.transfertId,
    })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");

  // Pour les sessions de réception de transfert : annulation atomique + restauration du transfert
  if (session.operation === "reception_transfert" && session.transfertId != null) {
    const transfertId = session.transfertId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.transaction(async (tx: any) => {
      // Annulation conditionnelle : seulement si toujours en_cours (pas terminee par une clôture concurrente)
      const cancelled = await tx
        .update(sessionsPeseeTable)
        .set({ statut: "annulee", dateFin: new Date() })
        .where(and(
          eq(sessionsPeseeTable.id, sessionId),
          eq(sessionsPeseeTable.statut, "en_cours"),
        ))
        .returning({ id: sessionsPeseeTable.id });

      if (cancelled.length === 0) {
        // La session a déjà été terminée ou annulée (clôture concurrente gagnante)
        throw new Error("Session déjà terminée ou annulée — impossible d'annuler");
      }

      // Restaurer le transfert en 'arrive' uniquement s'il est toujours en_pesee et lié à cette session
      await tx
        .update(transfertsStockTable)
        .set({ statut: "arrive", sessionPeseeId: null, updatedAt: new Date() })
        .where(and(
          eq(transfertsStockTable.id, transfertId),
          eq(transfertsStockTable.sessionPeseeId, sessionId),
          eq(transfertsStockTable.statut, "en_pesee"),
        ));
    });
    return;
  }

  // Session membre classique : annulation conditionnelle
  const cancelled = await db
    .update(sessionsPeseeTable)
    .set({ statut: "annulee", dateFin: new Date() })
    .where(and(
      eq(sessionsPeseeTable.id, sessionId),
      sql`${sessionsPeseeTable.statut}::text NOT IN ('terminee', 'annulee')`,
    ))
    .returning({ id: sessionsPeseeTable.id });

  if (cancelled.length === 0) {
    throw new Error("Session déjà terminée ou annulée");
  }
}
