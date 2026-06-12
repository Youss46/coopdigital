import { type Request, type Response } from "express";
import { db, paiementsTable, membresTable, livraisonsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql, gte, lt, lte } from "drizzle-orm";
import { envoyerPushGroupePortail } from "../services/pushService";

// ─── Helper ─────────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ─── Sélection enrichie partagée ────────────────────────────────────────────

const agentAlias = usersTable;

const SELECT_FIELDS = {
  id: paiementsTable.id,
  livraisonId: paiementsTable.livraisonId,
  membreId: paiementsTable.membreId,
  montantFcfa: paiementsTable.montantFcfa,
  modePaiement: paiementsTable.modePaiement,
  referenceTransaction: paiementsTable.referenceTransaction,
  statut: paiementsTable.statut,
  createdAt: paiementsTable.createdAt,
  motifRejet: paiementsTable.motifRejet,
  dateValidation: paiementsTable.dateValidation,
  // Membre
  membreNom: membresTable.nom,
  membrePrenoms: membresTable.prenoms,
  telephone: membresTable.telephone,
  // Livraison
  dateLivraison: livraisonsTable.dateLivraison,
  poidsNetKg: livraisonsTable.poidsNetKg,
  poidsKg: livraisonsTable.poidsKg,
  montantBrutFcfa: livraisonsTable.montantBrutFcfa,
  avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
  intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
  montantNetFcfa: livraisonsTable.montantNetFcfa,
  agentId: livraisonsTable.agentId,
};

async function fetchEnrichedPaiement(id: number) {
  const [row] = await db
    .select(SELECT_FIELDS)
    .from(paiementsTable)
    .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
    .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
    .where(eq(paiementsTable.id, id))
    .limit(1);
  return row ?? null;
}

// ─── GET /paiements ──────────────────────────────────────────────────────────

export async function listPaiements(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const statut = req.query["statut"] as string | undefined;
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const periode = req.query["periode"] as string | undefined;
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "100")));

    const conditions: ReturnType<typeof eq>[] = [eq(membresTable.cooperativeId, cooperativeId)];
    if (statut) conditions.push(eq(paiementsTable.statut, statut as "en_attente" | "confirme" | "echec" | "rejete" | "en_cours" | "effectue"));
    if (membreId) conditions.push(eq(paiementsTable.membreId, membreId));

    const now = new Date();
    if (periode === "today") {
      conditions.push(gte(paiementsTable.createdAt, startOfDay(now)));
    } else if (periode === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      conditions.push(gte(paiementsTable.createdAt, weekAgo));
    } else if (periode === "month") {
      conditions.push(gte(paiementsTable.createdAt, startOfMonth(now)));
    }

    const paiements = await db
      .select(SELECT_FIELDS)
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .where(and(...conditions))
      .orderBy(desc(paiementsTable.createdAt))
      .limit(limit);

    res.json(paiements);
  } catch (err) {
    req.log.error({ err }, "Erreur listPaiements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /paiements/stats ────────────────────────────────────────────────────

export async function statsPaiements(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const rows = await db
      .select({
        statut: paiementsTable.statut,
        montantFcfa: paiementsTable.montantFcfa,
        dateValidation: paiementsTable.dateValidation,
        createdAt: paiementsTable.createdAt,
        cooperativeId: membresTable.cooperativeId,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .where(eq(membresTable.cooperativeId, cooperativeId));

    let enAttente = { count: 0, montant_total: 0 };
    let valideAujourdhui = { count: 0, montant_total: 0 };
    let rejete = { count: 0 };
    let effectueCeMois = { montant_total: 0 };

    for (const r of rows) {
      if (r.statut === "en_attente") {
        enAttente.count++;
        enAttente.montant_total += r.montantFcfa;
      }
      if ((r.statut === "confirme" || r.statut === "effectue" || r.statut === "en_cours") && r.dateValidation) {
        const dv = new Date(r.dateValidation);
        if (dv >= todayStart) {
          valideAujourdhui.count++;
          valideAujourdhui.montant_total += r.montantFcfa;
        }
      }
      if (r.statut === "rejete") {
        rejete.count++;
      }
      if (r.statut === "effectue" && r.dateValidation) {
        const dv = new Date(r.dateValidation);
        if (dv >= monthStart && dv <= monthEnd) {
          effectueCeMois.montant_total += r.montantFcfa;
        }
      }
    }

    res.json({
      en_attente: enAttente,
      valide_aujourd_hui: valideAujourdhui,
      rejete,
      effectue_ce_mois: effectueCeMois,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur statsPaiements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── PATCH /paiements/:id/valider ────────────────────────────────────────────

export async function validerPaiement(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) {
    res.status(400).json({ erreur: "ID invalide" });
    return;
  }

  const body = (req.body ?? {}) as { referenceTransaction?: string | null; telephone?: string | null };

  try {
    // Vérification appartenance + statut
    const [row] = await db
      .select({
        paiement: paiementsTable,
        membreCoopId: membresTable.cooperativeId,
        telephone: membresTable.telephone,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être validés.` });
      return;
    }

    const mode = row.paiement.modePaiement;
    const nouveauStatut = mode === "especes" ? "effectue" : "en_cours";

    await db.transaction(async (tx) => {
      // 1. Mettre à jour le paiement
      await tx
        .update(paiementsTable)
        .set({
          statut: nouveauStatut as "effectue" | "en_cours",
          validePar: userId ?? null,
          dateValidation: new Date(),
          referenceTransaction: body.referenceTransaction ?? row.paiement.referenceTransaction,
        })
        .where(eq(paiementsTable.id, id));

      // 2. Mettre à jour le statut paiement de la livraison
      await tx
        .update(livraisonsTable)
        .set({ statutPaiement: "PAYÉ" })
        .where(eq(livraisonsTable.id, row.paiement.livraisonId));
    });

    // 3. Notifier le producteur (best-effort)
    void envoyerPushGroupePortail([row.paiement.membreId], {
      title: "✅ Paiement validé",
      body: `${new Intl.NumberFormat("fr-FR").format(row.paiement.montantFcfa)} FCFA — ${mode === "orange_money" ? "Orange Money" : mode === "mtn_momo" ? "MTN MoMo" : "espèces"}`,
      url: "/paiements",
    });

    const updated = await fetchEnrichedPaiement(id);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur validerPaiement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── POST /paiements/:id/rejeter ─────────────────────────────────────────────

export async function rejeterPaiement(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) {
    res.status(400).json({ erreur: "ID invalide" });
    return;
  }

  const body = (req.body ?? {}) as { motifRejet: string };
  if (!body.motifRejet?.trim()) {
    res.status(400).json({ erreur: "Le motif de rejet est obligatoire" });
    return;
  }

  try {
    const [row] = await db
      .select({
        paiement: paiementsTable,
        membreCoopId: membresTable.cooperativeId,
        telephone: membresTable.telephone,
        nom: membresTable.nom,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être rejetés.` });
      return;
    }

    await db.transaction(async (tx) => {
      // 1. Rejeter le paiement
      await tx
        .update(paiementsTable)
        .set({
          statut: "rejete",
          validePar: userId ?? null,
          dateValidation: new Date(),
          motifRejet: body.motifRejet.trim(),
        })
        .where(eq(paiementsTable.id, id));

      // 2. Remettre la livraison en EN_ATTENTE
      await tx
        .update(livraisonsTable)
        .set({ statutPaiement: "EN_ATTENTE" })
        .where(eq(livraisonsTable.id, row.paiement.livraisonId));
    });

    // 3. Notifier le producteur (best-effort)
    void envoyerPushGroupePortail([row.paiement.membreId], {
      title: "❌ Paiement rejeté",
      body: `Motif : ${body.motifRejet.trim().slice(0, 120)}`,
      url: "/paiements",
    });

    const updated = await fetchEnrichedPaiement(id);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur rejeterPaiement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
