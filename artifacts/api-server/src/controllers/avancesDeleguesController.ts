import { type Request, type Response } from "express";
import {
  db,
  avancesDeleguesTable,
  remboursementsAvancesDeleguesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, inArray, ne, isNull, or, lt } from "drizzle-orm";

// ─── Liste des avances d'un délégué ──────────────────────────────────────────
export async function listAvancesDelegueHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const delegueId = Number(req.params.agentId);
  try {
    const avances = await db
      .select()
      .from(avancesDeleguesTable)
      .where(and(
        eq(avancesDeleguesTable.delegueId, delegueId),
        eq(avancesDeleguesTable.cooperativeId, cooperativeId),
      ))
      .orderBy(desc(avancesDeleguesTable.createdAt));
    res.json(avances);
  } catch (err) {
    req.log.error(err, "listAvancesDelegueHandler");
    res.status(500).json({ erreur: "Erreur lors de la récupération des avances" });
  }
}

// ─── Octroyer une avance à un délégué ────────────────────────────────────────
export async function createAvanceDelegueHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const delegueId = Number(req.params.agentId);
  const { montantOctroyeFcfa, dateOctroi, dateEcheance, motif, planType, montantPartielFcfa, reportDate } =
    req.body as Record<string, unknown>;

  if (!montantOctroyeFcfa || Number(montantOctroyeFcfa) <= 0) {
    res.status(400).json({ erreur: "Montant invalide" });
    return;
  }

  // Vérifier que le délégué appartient à la coopérative
  const [delegue] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, delegueId), eq(usersTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!delegue) { res.status(404).json({ erreur: "Délégué introuvable" }); return; }

  try {
    const montant = Number(montantOctroyeFcfa);
    const plan = (planType as "integral" | "partiel" | "reporte") ?? "integral";
    const [avance] = await db.insert(avancesDeleguesTable).values({
      delegueId,
      cooperativeId,
      montantOctroyeFcfa: montant,
      montantRembourse: 0,
      soldeRestantFcfa: montant,
      dateOctroi: String(dateOctroi ?? new Date().toISOString().slice(0, 10)),
      dateEcheance: dateEcheance ? String(dateEcheance) : null,
      motif: motif ? String(motif) : null,
      statut: "en_cours",
      agentId: req.user!.id,
      planType: plan,
      montantPartielFcfa: plan === "partiel" && montantPartielFcfa ? Number(montantPartielFcfa) : null,
      reportDate: plan === "reporte" && reportDate ? String(reportDate) : null,
    }).returning();
    res.status(201).json(avance);
  } catch (err) {
    req.log.error(err, "createAvanceDelegueHandler");
    res.status(500).json({ erreur: "Erreur lors de l'octroi de l'avance" });
  }
}

// ─── Remboursement manuel ─────────────────────────────────────────────────────
export async function rembourserAvanceDelegueHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const avanceId = Number(req.params.avanceId);
  const { montantFcfa, note } = req.body as { montantFcfa?: number; note?: string };

  if (!montantFcfa || montantFcfa <= 0) {
    res.status(400).json({ erreur: "Montant de remboursement invalide" });
    return;
  }

  try {
    const [avance] = await db
      .select()
      .from(avancesDeleguesTable)
      .where(and(
        eq(avancesDeleguesTable.id, avanceId),
        eq(avancesDeleguesTable.cooperativeId, cooperativeId),
      ))
      .limit(1);

    if (!avance) { res.status(404).json({ erreur: "Avance introuvable" }); return; }
    if (avance.statut === "rembourse") {
      res.status(400).json({ erreur: "Avance déjà remboursée" });
      return;
    }

    const montant = Math.min(montantFcfa, avance.soldeRestantFcfa);
    const nouveauSolde = avance.soldeRestantFcfa - montant;
    const nouveauRembourse = avance.montantRembourse + montant;
    const nouveauStatut = nouveauSolde === 0 ? "rembourse" : "en_cours";

    await db.transaction(async (tx) => {
      await tx.update(avancesDeleguesTable).set({
        montantRembourse: nouveauRembourse,
        soldeRestantFcfa: nouveauSolde,
        statut: nouveauStatut,
      }).where(eq(avancesDeleguesTable.id, avanceId));

      await tx.insert(remboursementsAvancesDeleguesTable).values({
        avanceId,
        montantFcfa: montant,
        note: note ?? null,
      });
    });

    res.json({ ok: true, soldeRestant: nouveauSolde, statut: nouveauStatut });
  } catch (err) {
    req.log.error(err, "rembourserAvanceDelegueHandler");
    res.status(500).json({ erreur: "Erreur lors du remboursement" });
  }
}

// ─── Historique des remboursements d'une avance ───────────────────────────────
export async function getRemboursementsAvanceDelegueHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const avanceId = Number(req.params.avanceId);
  try {
    const rows = await db
      .select()
      .from(remboursementsAvancesDeleguesTable)
      .where(eq(remboursementsAvancesDeleguesTable.avanceId, avanceId))
      .orderBy(desc(remboursementsAvancesDeleguesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error(err, "getRemboursementsAvanceDelegueHandler");
    res.status(500).json({ erreur: "Erreur" });
  }
}

// ─── Modifier le plan d'une avance (integral / partiel / reporte + date) ──────
export async function patchPlanAvanceDelegueHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const avanceId = Number(req.params.avanceId);
  const { plan_type, montant_partiel_fcfa, report_date } = req.body as {
    plan_type?: "integral" | "partiel" | "reporte";
    montant_partiel_fcfa?: number | null;
    report_date?: string | null;
  };

  if (!plan_type || !["integral", "partiel", "reporte"].includes(plan_type)) {
    res.status(400).json({ erreur: "plan_type invalide (integral | partiel | reporte)" });
    return;
  }

  try {
    const [avance] = await db
      .select({ id: avancesDeleguesTable.id, statut: avancesDeleguesTable.statut })
      .from(avancesDeleguesTable)
      .where(and(eq(avancesDeleguesTable.id, avanceId), eq(avancesDeleguesTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!avance) { res.status(404).json({ erreur: "Avance introuvable" }); return; }
    if (avance.statut === "rembourse") {
      res.status(400).json({ erreur: "Impossible de modifier le plan d'une avance déjà remboursée" });
      return;
    }

    const [updated] = await db.update(avancesDeleguesTable).set({
      planType: plan_type,
      montantPartielFcfa: plan_type === "partiel" && montant_partiel_fcfa ? montant_partiel_fcfa : null,
      reportDate: plan_type === "reporte" && report_date ? report_date : null,
    }).where(eq(avancesDeleguesTable.id, avanceId)).returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err, "patchPlanAvanceDelegueHandler");
    res.status(500).json({ erreur: "Erreur lors de la modification du plan" });
  }
}

// ─── Avances délégués reportées avec date dépassée ou nulle ──────────────────
export async function getAvancesDeleguesReporteesHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }

  try {
    const today = new Date().toISOString().split("T")[0]!;

    const conditions: ReturnType<typeof eq>[] = [
      eq(avancesDeleguesTable.cooperativeId, cooperativeId),
      eq(avancesDeleguesTable.planType, "reporte"),
      ne(avancesDeleguesTable.statut, "rembourse"),
      or(isNull(avancesDeleguesTable.reportDate), lt(avancesDeleguesTable.reportDate, today))!,
    ];

    // Un délégué ne voit que ses propres avances
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(eq(avancesDeleguesTable.delegueId, req.user.id));
    }

    const avances = await db
      .select({
        id:                 avancesDeleguesTable.id,
        delegueId:          avancesDeleguesTable.delegueId,
        montantOctroyeFcfa: avancesDeleguesTable.montantOctroyeFcfa,
        montantRembourse:   avancesDeleguesTable.montantRembourse,
        soldeRestantFcfa:   avancesDeleguesTable.soldeRestantFcfa,
        dateOctroi:         avancesDeleguesTable.dateOctroi,
        dateEcheance:       avancesDeleguesTable.dateEcheance,
        statut:             avancesDeleguesTable.statut,
        planType:           avancesDeleguesTable.planType,
        reportDate:         avancesDeleguesTable.reportDate,
        delegueNom:         usersTable.nom,
        deleguePrenoms:     usersTable.prenoms,
      })
      .from(avancesDeleguesTable)
      .innerJoin(usersTable, eq(usersTable.id, avancesDeleguesTable.delegueId))
      .where(and(...conditions))
      .orderBy(desc(avancesDeleguesTable.dateOctroi));

    const soldeTotal = avances.reduce((s: number, a) => s + a.soldeRestantFcfa, 0);
    res.json({ avances, total: avances.length, soldeTotal });
  } catch (err) {
    req.log.error(err, "getAvancesDeleguesReporteesHandler");
    res.status(500).json({ erreur: "Erreur lors de la récupération" });
  }
}

// ─── Résumé avances d'un délégué (solde total, nb en cours) ──────────────────
export async function getAvancesDelegueResumeHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const delegueId = Number(req.params.agentId);
  try {
    const avances = await db
      .select()
      .from(avancesDeleguesTable)
      .where(and(
        eq(avancesDeleguesTable.delegueId, delegueId),
        eq(avancesDeleguesTable.cooperativeId, cooperativeId),
        inArray(avancesDeleguesTable.statut, ["en_cours", "en_retard"]),
      ));
    const soldeTotalFcfa = avances.reduce((s, a) => s + a.soldeRestantFcfa, 0);
    res.json({ nb: avances.length, soldeTotalFcfa });
  } catch (err) {
    req.log.error(err, "getAvancesDelegueResumeHandler");
    res.status(500).json({ erreur: "Erreur" });
  }
}
