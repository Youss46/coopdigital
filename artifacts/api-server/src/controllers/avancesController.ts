import { type Request, type Response } from "express";
import { checkAvance, creerAnomalies } from "../services/anomalieService";
import { db, avancesTable, membresTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { CreateAvanceBody, RembourserAvanceBody } from "@workspace/api-zod";
import { generateEcrituresAvance } from "../services/comptabiliteService";

export async function listAvances(req: Request, res: Response): Promise<void> {
  try {
    const statut = req.query["statut"] as string | undefined;
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;

    const conditions = [];
    if (statut) conditions.push(eq(avancesTable.statut, statut as "en_cours" | "rembourse" | "en_retard"));
    if (membreId) conditions.push(eq(avancesTable.membreId, membreId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
      .where(where)
      .orderBy(desc(avancesTable.createdAt));

    res.json({ avances, total: avances.length });
  } catch (err) {
    req.log.error({ err }, "Erreur listAvances");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createAvance(req: Request, res: Response): Promise<void> {
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

    // ── Détection anomalies ──────────────────────────────────────────────
    const anomaliesDetectees = await checkAvance({
      membreId, montantOctroyeFcfa,
      agentId: req.user?.id ?? null,
    });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(anomaliesCritiques, "avances");
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
      void creerAnomalies(anomaliesAttention, "avances", { entiteId: avance!.id, entiteType: "avance" });
    }

    void generateEcrituresAvance({
      avanceId: avance!.id,
      membreNom: `${membre.prenoms} ${membre.nom}`,
      montantFcfa: montantOctroyeFcfa,
      dateOctroi: avance!.dateOctroi,
    });

    res.status(201).json(avance);
  } catch (err) {
    req.log.error({ err }, "Erreur createAvance");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getAvancesEncours(req: Request, res: Response): Promise<void> {
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
      .where(eq(avancesTable.statut, "en_cours"))
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
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function rembourserAvance(req: Request, res: Response): Promise<void> {
  const parse = RembourserAvanceBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  const { montantFcfa } = parse.data;
  const id = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [avance] = await db.select().from(avancesTable).where(eq(avancesTable.id, id)).limit(1);
    if (!avance) {
      res.status(404).json({ erreur: "Avance introuvable" });
      return;
    }

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

    res.json(avanceMaj);
  } catch (err) {
    req.log.error({ err }, "Erreur rembourserAvance");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
