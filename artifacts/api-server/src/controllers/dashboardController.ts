import { type Request, type Response } from "express";
import { db, membresTable, avancesTable, livraisonsTable, paiementsTable } from "@workspace/db";
import { eq, sql, desc, gte, and } from "drizzle-orm";

export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const debutMoisStr = debutMois.toISOString().split("T")[0]!;

    const [
      [membresActifsRow],
      [avancesRow],
      [tonnageRow],
      [paiementsRow],
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(eq(membresTable.statut, "actif")),
      db
        .select({ total: sql<number>`coalesce(sum(solde_restant_fcfa),0)::int` })
        .from(avancesTable)
        .where(eq(avancesTable.statut, "en_cours")),
      db
        .select({ tonnage: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
        .from(livraisonsTable)
        .where(gte(livraisonsTable.dateLivraison, debutMoisStr)),
      db
        .select({ total: sql<number>`coalesce(sum(montant_fcfa),0)::int` })
        .from(paiementsTable)
        .where(and(eq(paiementsTable.statut, "confirme"), gte(paiementsTable.createdAt, debutMois))),
    ]);

    res.json({
      membresActifs: membresActifsRow?.count ?? 0,
      avancesEnCoursMontant: avancesRow?.total ?? 0,
      tonnageMois: tonnageRow?.tonnage ?? 0,
      paiementsMois: paiementsRow?.total ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboard");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDashboardLivraisons(req: Request, res: Response): Promise<void> {
  try {
    const livraisons = await db
      .select({
        id: livraisonsTable.id,
        membreId: livraisonsTable.membreId,
        poidsKg: livraisonsTable.poidsKg,
        prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
        montantBrutFcfa: livraisonsTable.montantBrutFcfa,
        avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
        montantNetFcfa: livraisonsTable.montantNetFcfa,
        dateLivraison: livraisonsTable.dateLivraison,
        agentId: livraisonsTable.agentId,
        createdAt: livraisonsTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .orderBy(desc(livraisonsTable.createdAt))
      .limit(5);

    res.json(livraisons);
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardLivraisons");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDashboardAvancesRetard(req: Request, res: Response): Promise<void> {
  try {
    const aujourd_hui = new Date().toISOString().split("T")[0]!;

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
      .where(eq(avancesTable.statut, "en_retard"))
      .orderBy(desc(avancesTable.dateEcheance));

    res.json(avances);
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardAvancesRetard");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
