import {
  db,
  sessionsPeseeTable,
  lignesPeseeTable,
  membresTable,
  livraisonsTable,
  paiementsTable,
  entrepotsTable,
  mouvementsStockTable,
  avancesTable,
  configPeseeTable,
} from "@workspace/db";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { getPrixActuel } from "./terrainService.js";
import { generateEcrituresLivraison } from "./comptabiliteService.js";
import { getEncoursMembreTx, enregistrerRemboursementParLivraison } from "./intrantsService.js";
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

export async function createSession(
  cooperativeId: number,
  data: {
    membreId?: number;
    produit?: string;
    operation?: string;
    peseurId?: number;
    balanceId?: number;
    notes?: string;
  },
) {
  // Guard: refuse to create a second concurrent session for the same member
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
        membreId: data.membreId,
        produit: data.produit ?? "cacao",
        operation: data.operation ?? "reception",
        peseurId: data.peseurId,
        balanceId: data.balanceId,
        notes: data.notes,
      })
      .returning();
    return session!;
  } catch (err) {
    // PostgreSQL unique-constraint violation (23505) means a concurrent request
    // won the race and already inserted an en_cours session for the same member.
    // Re-read that session and surface it as SessionEnCoursError so the caller
    // can return a 409 with the existing session id.
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
  opts: { statut?: string; membreId?: number; limit?: number; peseurId?: number } = {},
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
      createdAt: sessionsPeseeTable.createdAt,
    })
    .from(sessionsPeseeTable)
    .leftJoin(membresTable, eq(membresTable.id, sessionsPeseeTable.membreId))
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
  // Vérifie que la session appartient à la coop et est en cours
  const [session] = await db
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut, nbSacsTotal: sessionsPeseeTable.nbSacsTotal, poidsTotalKg: sessionsPeseeTable.poidsTotalKg })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");
  if (session.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");

  // Numéro de passage
  const [{ maxPassage }] = await db
    .select({ maxPassage: sql<number>`coalesce(max(${lignesPeseeTable.numeroPassage}), 0)::int` })
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId));

  const [ligne] = await db
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

  // Mise à jour des totaux
  const poidsNet = data.poidsBrutKg - (data.tareKg ?? 0);
  await db
    .update(sessionsPeseeTable)
    .set({
      nbSacsTotal: (session.nbSacsTotal ?? 0) + data.nbSacs,
      poidsTotalKg: String(parseFloat(String(session.poidsTotalKg ?? 0)) + poidsNet),
    })
    .where(eq(sessionsPeseeTable.id, sessionId));

  return ligne!;
}

// ─── Supprimer une ligne ──────────────────────────────────────────────────────
export async function deleteLigne(cooperativeId: number, sessionId: number, ligneId: number) {
  const [session] = await db
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");
  if (session.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");

  const [ligne] = await db
    .select()
    .from(lignesPeseeTable)
    .where(and(eq(lignesPeseeTable.id, ligneId), eq(lignesPeseeTable.sessionId, sessionId)))
    .limit(1);

  if (!ligne) throw new Error("Ligne introuvable");

  await db.delete(lignesPeseeTable).where(eq(lignesPeseeTable.id, ligneId));

  // Recalcul des totaux depuis les lignes restantes
  const [totaux] = await db
    .select({
      nbSacs: sql<number>`coalesce(sum(${lignesPeseeTable.nbSacs}), 0)::int`,
      poids: sql<number>`coalesce(sum(${lignesPeseeTable.poidsBrutKg}::numeric - ${lignesPeseeTable.tareKg}::numeric), 0)::float`,
    })
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId));

  await db
    .update(sessionsPeseeTable)
    .set({ nbSacsTotal: totaux?.nbSacs ?? 0, poidsTotalKg: String(totaux?.poids ?? 0) })
    .where(eq(sessionsPeseeTable.id, sessionId));
}

// ─── Terminer une session ─────────────────────────────────────────────────────
export async function terminerSession(cooperativeId: number, sessionId: number) {
  const detail = await getSessionDetail(cooperativeId, sessionId);
  if (!detail) throw new Error("Session introuvable");
  if (detail.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");
  if ((detail.lignes?.length ?? 0) === 0) throw new Error("Aucune pesée enregistrée dans cette session");

  const [updated] = await db
    .update(sessionsPeseeTable)
    .set({ statut: "terminee", dateFin: new Date() })
    .where(eq(sessionsPeseeTable.id, sessionId))
    .returning();

  return { ...detail, statut: "terminee" as const, dateFin: updated?.dateFin };
}

// ─── Convertir une session terminée en livraison ─────────────────────────────
export async function creerLivraisonDepuisSession(
  cooperativeId: number,
  sessionId: number,
  data: {
    modePaiement?: "especes" | "orange_money" | "mtn_momo" | "wave" | "cheque";
    entrepotId?: number;
    agentId?: number;
  },
) {
  // 1. Get current price + active campaign (before transaction — read-only, safe)
  const { prixBordChampFcfa, campagneId } = await getPrixActuel(cooperativeId);

  const modePaiement = data.modePaiement ?? "especes";

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
      })
      .returning();

    const [paiement] = await tx
      .insert(paiementsTable)
      .values({
        livraisonId: livraison!.id,
        membreId: session.membreId,
        montantFcfa: montantNet,
        modePaiement,
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

    // Stock movement — resolve entrepot scoped to this cooperative
    let entrepotId: number | null = null;
    if (data.entrepotId) {
      // Validate that the supplied entrepot belongs to this cooperative
      const [entrepot] = await tx
        .select({ id: entrepotsTable.id })
        .from(entrepotsTable)
        .where(and(eq(entrepotsTable.id, data.entrepotId), eq(entrepotsTable.cooperativeId, cooperativeId)))
        .limit(1);
      if (!entrepot) throw new Error("Entrepôt introuvable ou n'appartient pas à votre coopérative");
      entrepotId = entrepot.id;
    } else {
      // Fall back to first entrepot of cooperative
      const [entrepot] = await tx
        .select({ id: entrepotsTable.id })
        .from(entrepotsTable)
        .where(eq(entrepotsTable.cooperativeId, cooperativeId))
        .orderBy(entrepotsTable.id)
        .limit(1);
      entrepotId = entrepot?.id ?? null;
    }

    if (entrepotId) {
      await tx.insert(mouvementsStockTable).values({
        entrepotId,
        lotId: null,
        type: "entree",
        poidsKg: String(poidsKg),
        nombreSacs: session.nbSacsTotal ?? null,
        motif: `Livraison depuis session pesée #${sessionId}`,
        agentId: data.agentId ?? null,
      });
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
        livraisonId:      result.livraison.id,
        membreNom:        membre ? `${membre.nom} ${membre.prenoms}` : "—",
        montantBrutFcfa:  result.livraison.montantBrutFcfa,
        avanceDeduiteFcfa: result.livraison.avanceDeduiteFcfa,
        montantNetFcfa:   result.livraison.montantNetFcfa,
        dateLivraison:    result.livraison.dateLivraison,
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

  const expired = await db
    .update(sessionsPeseeTable)
    .set({ statut: "annulee", dateFin: new Date() })
    .where(
      and(
        eq(sessionsPeseeTable.cooperativeId, cooperativeId),
        sql`${sessionsPeseeTable.statut}::text = 'en_cours'`,
        sql`${sessionsPeseeTable.createdAt} < NOW() - interval '1 hour' * ${heures}`,
      ),
    )
    .returning({ id: sessionsPeseeTable.id });

  return expired.length;
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
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");
  if (session.statut === "terminee") throw new Error("Session déjà terminée");

  await db
    .update(sessionsPeseeTable)
    .set({ statut: "annulee", dateFin: new Date() })
    .where(eq(sessionsPeseeTable.id, sessionId));
}
