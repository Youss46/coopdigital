import { type Request, type Response } from "express";
import { checkAvance, creerAnomalies } from "../services/anomalieService";
import { db, avancesTable, membresTable, campagnesTable, remboursementsAvancesMembresTable, usersTable } from "@workspace/db";
import { eq, and, sql, desc, ne, isNull, or, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const saisiseurAlias = alias(usersTable, "saisiseur_user");
import { CampagneFermeeError, assertCampagneActiveExiste } from "../lib/campagneGuard";
import { CreateAvanceBody, RembourserAvanceBody } from "@workspace/api-zod";
import { generateEcrituresAvance } from "../services/comptabiliteService";

export async function listAvances(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const statut = req.query["statut"] as string | undefined;
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;

    const conditions: ReturnType<typeof eq>[] = [eq(membresTable.cooperativeId, cooperativeId)];
    if (statut) conditions.push(eq(avancesTable.statut, statut as "en_cours" | "rembourse" | "en_retard"));
    if (membreId) conditions.push(eq(avancesTable.membreId, membreId));
    // Un délégué ne voit que les avances des membres qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(eq(membresTable.delegueId, req.user.id));
    }

    const avances = await db
      .select({
        id: avancesTable.id,
        membreId: avancesTable.membreId,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        montantRembourseFcfa: avancesTable.montantRembourse_fcfa,
        soldeRestantFcfa: avancesTable.soldeRestantFcfa,
        dateOctroi: avancesTable.dateOctroi,
        dateEcheance: avancesTable.dateEcheance,
        motif: avancesTable.motif,
        statut: avancesTable.statut,
        planType: avancesTable.planType,
        montantPartielFcfa: avancesTable.montantPartielFcfa,
        reportDate: avancesTable.reportDate,
        agentId: avancesTable.agentId,
        agentSaisiseurId: avancesTable.agentSaisiseurId,
        agentSaisiseurNom: saisiseurAlias.nom,
        createdAt: avancesTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .leftJoin(saisiseurAlias, eq(avancesTable.agentSaisiseurId, saisiseurAlias.id))
      .where(and(...conditions))
      .orderBy(desc(avancesTable.createdAt));

    res.json({ avances, total: avances.length });
  } catch (err) {
    req.log.error({ err }, "Erreur listAvances");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function createAvance(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateAvanceBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { membreId, montantOctroyeFcfa, dateOctroi, dateEcheance, motif } = parse.data;

  if (montantOctroyeFcfa <= 0) {
    res.status(400).json({ erreur: "Le montant de l'avance doit être supérieur à 0" });
    return;
  }

  try {
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, membreId)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    if (membre.cooperativeId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce membre n'appartient pas à votre coopérative" });
      return;
    }

    // Les avances ne peuvent être octroyées qu'en cours de campagne active
    try {
      await assertCampagneActiveExiste(cooperativeId);
    } catch (err) {
      if (err instanceof CampagneFermeeError) {
        res.status(err.status).json({ erreur: err.erreur });
        return;
      }
      throw err;
    }

    // ── Détection anomalies ──────────────────────────────────────────────
    const anomaliesDetectees = await checkAvance(cooperativeId, {
      membreId, montantOctroyeFcfa,
      agentId: req.user?.id ?? null,
    });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesCritiques, "avances");
      res.status(422).json({
        erreur: anomaliesCritiques[0]!.description,
        anomalie: "bloquee",
        anomalies: anomaliesCritiques,
      });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

    const [avance] = await db
      .insert(avancesTable)
      .values({
        membreId,
        montantOctroyeFcfa,
        soldeRestantFcfa: montantOctroyeFcfa,
        dateOctroi: dateOctroi ?? new Date().toISOString().split("T")[0]!,
        dateEcheance: dateEcheance ?? null,
        motif: motif ?? null,
        statut: "en_cours",
        agentId: req.user?.id ?? null,
      })
      .returning();

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesAttention, "avances", { entiteId: avance!.id, entiteType: "avance" });
    }

    void generateEcrituresAvance(cooperativeId, {
      avanceId: avance!.id,
      membreId,
      membreNom: `${membre.prenoms} ${membre.nom}`,
      montantFcfa: montantOctroyeFcfa,
      dateOctroi: avance!.dateOctroi,
    });

    res.status(201).json(avance);
  } catch (err) {
    req.log.error({ err }, "Erreur createAvance");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function getAvancesEncours(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const avances = await db
      .select({
        id: avancesTable.id,
        membreId: avancesTable.membreId,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        montantRembourseFcfa: avancesTable.montantRembourse_fcfa,
        soldeRestantFcfa: avancesTable.soldeRestantFcfa,
        dateOctroi: avancesTable.dateOctroi,
        dateEcheance: avancesTable.dateEcheance,
        motif: avancesTable.motif,
        statut: avancesTable.statut,
        agentId: avancesTable.agentId,
        createdAt: avancesTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_cours")))
      .orderBy(desc(avancesTable.createdAt));

    const totaux = avances.reduce(
      (acc, a) => ({
        totalOctroye: acc.totalOctroye + (a.montantOctroyeFcfa ?? 0),
        totalRembourse: acc.totalRembourse + (a.montantRembourseFcfa ?? 0),
        solde: acc.solde + (a.soldeRestantFcfa ?? 0),
      }),
      { totalOctroye: 0, totalRembourse: 0, solde: 0 },
    );

    res.json({
      totalOctroye: totaux.totalOctroye,
      totalRembourse: totaux.totalRembourse,
      soldeToral: totaux.solde,
      count: avances.length,
      avances,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getAvancesEncours");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function rembourserAvance(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = RembourserAvanceBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  const { montantFcfa } = parse.data;
  const id = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [row] = await db
      .select({ avance: avancesTable, membreCoopId: membresTable.cooperativeId })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(eq(avancesTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Avance introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Cette avance n'appartient pas à votre coopérative" });
      return;
    }
    const avance = row.avance;

    const montantReel = Math.min(montantFcfa, avance.soldeRestantFcfa);
    const nouveauRembourse = avance.montantRembourse_fcfa + montantReel;
    const nouveauSolde = avance.soldeRestantFcfa - montantReel;
    const nouveauStatut = nouveauSolde === 0 ? "rembourse" : "en_cours";

    const [avanceMaj] = await db
      .update(avancesTable)
      .set({
        montantRembourse_fcfa: nouveauRembourse,
        soldeRestantFcfa: nouveauSolde,
        statut: nouveauStatut,
      })
      .where(eq(avancesTable.id, id))
      .returning();

    // Enregistrer dans l'historique
    await db.insert(remboursementsAvancesMembresTable).values({
      avanceId: id,
      montantFcfa: montantReel,
      note: "Remboursement manuel",
    });

    res.json(avanceMaj);
  } catch (err) {
    req.log.error({ err }, "Erreur rembourserAvance");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Plan de déduction ────────────────────────────────────────────────────────

export async function updatePlanAvanceMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const { plan_type, montant_partiel_fcfa, report_date } = req.body as {
    plan_type?: string;
    montant_partiel_fcfa?: number | null;
    report_date?: string | null;
  };

  const validPlans = ["integral", "partiel", "reporte"];
  if (plan_type && !validPlans.includes(plan_type)) {
    res.status(400).json({ erreur: "plan_type invalide (integral | partiel | reporte)" });
    return;
  }

  try {
    const [row] = await db
      .select({ avance: avancesTable, coopId: membresTable.cooperativeId })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(eq(avancesTable.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ erreur: "Avance introuvable" }); return; }
    if (row.coopId !== cooperativeId) { res.status(403).json({ erreur: "Accès refusé" }); return; }
    if (row.avance.statut === "rembourse") {
      res.status(400).json({ erreur: "Cette avance est déjà remboursée" }); return;
    }

    const [updated] = await db
      .update(avancesTable)
      .set({
        ...(plan_type != null && { planType: plan_type as "integral" | "partiel" | "reporte" }),
        ...(montant_partiel_fcfa !== undefined && { montantPartielFcfa: montant_partiel_fcfa }),
        ...(report_date !== undefined && { reportDate: report_date }),
      })
      .where(eq(avancesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "updatePlanAvanceMembre");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Avances membres avec plan "reporté" et date dépassée ou nulle ───────────

export async function getAvancesReportees(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const today = new Date().toISOString().split("T")[0]!;

    const conditions: ReturnType<typeof eq>[] = [
      eq(membresTable.cooperativeId, cooperativeId),
      eq(avancesTable.planType, "reporte"),
      ne(avancesTable.statut, "rembourse"),
      or(isNull(avancesTable.reportDate), lt(avancesTable.reportDate, today))!,
    ];

    // Un délégué ne voit que les avances des membres qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(eq(membresTable.delegueId, req.user.id));
    }

    const avances = await db
      .select({
        id:                 avancesTable.id,
        membreId:           avancesTable.membreId,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        soldeRestantFcfa:   avancesTable.soldeRestantFcfa,
        dateOctroi:         avancesTable.dateOctroi,
        dateEcheance:       avancesTable.dateEcheance,
        statut:             avancesTable.statut,
        planType:           avancesTable.planType,
        reportDate:         avancesTable.reportDate,
        membreNom:          membresTable.nom,
        membrePrenoms:      membresTable.prenoms,
      })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(and(...conditions))
      .orderBy(desc(avancesTable.dateOctroi));

    const soldeTotal = avances.reduce((s: number, a) => s + (a.soldeRestantFcfa ?? 0), 0);
    res.json({ avances, total: avances.length, soldeTotal });
  } catch (err) {
    req.log.error({ err }, "getAvancesReportees");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function getRemboursementsAvanceMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [row] = await db
      .select({ coopId: membresTable.cooperativeId })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(eq(avancesTable.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ erreur: "Avance introuvable" }); return; }
    if (row.coopId !== cooperativeId) { res.status(403).json({ erreur: "Accès refusé" }); return; }

    const rows = await db
      .select()
      .from(remboursementsAvancesMembresTable)
      .where(eq(remboursementsAvancesMembresTable.avanceId, id))
      .orderBy(desc(remboursementsAvancesMembresTable.createdAt));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "getRemboursementsAvanceMembre");
    res.status(500).json({ erreur: apiError(err) });
  }
}
