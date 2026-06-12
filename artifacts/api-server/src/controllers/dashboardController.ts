import { type Request, type Response } from "express";
import { db, membresTable, avancesTable, livraisonsTable, paiementsTable, ventesExportateursTable, exportateursTable, parcellesTable, missionsTerrainTable, campagnesTable } from "@workspace/db";
import { eq, sql, desc, gte, and, isNull } from "drizzle-orm";

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const debutMoisStr = debutMois.toISOString().split("T")[0]!;

    const [
      [membresActifsRow],
      [membresHommesRow],
      [membresFemmesRow],
      [avancesRow],
      [tonnageRow],
      [paiementsRow],
      [creancesRow],
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"), eq(membresTable.sexe, "M"))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"), eq(membresTable.sexe, "F"))),
      db
        .select({ total: sql<number>`coalesce(sum(solde_restant_fcfa),0)::int` })
        .from(avancesTable)
        .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_cours"))),
      db
        .select({ tonnage: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), gte(livraisonsTable.dateLivraison, debutMoisStr))),
      db
        .select({ total: sql<number>`coalesce(sum(montant_fcfa),0)::int` })
        .from(paiementsTable)
        .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(paiementsTable.statut, "confirme"), gte(paiementsTable.createdAt, debutMois))),
      db
        .select({ total: sql<number>`coalesce(sum(solde_du_fcfa),0)::int` })
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
        .where(and(eq(exportateursTable.cooperativeId, cooperativeId), sql`${ventesExportateursTable.statut} != 'regle'`)),
    ]);

    res.json({
      membresActifs: membresActifsRow?.count ?? 0,
      membresHommes: membresHommesRow?.count ?? 0,
      membresFemmes: membresFemmesRow?.count ?? 0,
      avancesEnCoursMontant: avancesRow?.total ?? 0,
      tonnageMois: tonnageRow?.tonnage ?? 0,
      paiementsMois: paiementsRow?.total ?? 0,
      creancesExportateurs: creancesRow?.total ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboard");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDashboardLivraisons(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

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
      .where(eq(membresTable.cooperativeId, cooperativeId))
      .orderBy(desc(livraisonsTable.createdAt))
      .limit(5);

    res.json(livraisons);
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardLivraisons");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDashboardAvancesRetard(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

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
      .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_retard")))
      .orderBy(desc(avancesTable.dateEcheance));

    res.json(avances);
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardAvancesRetard");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDashboardTracabilite(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    const [
      [membresRow],
      [sansGpsRow],
      [demandesRow],
      parcellesRows,
      [missionsRow],
      [eudrConformesRow],
      [identiteCompletsRow],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"))),
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          eq(membresTable.statut, "actif"),
          isNull(membresTable.polygoneGps),
          isNull(membresTable.gpsParcelles),
        )),
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          sql`${membresTable.statutMembre} = 'en_attente'`,
        )),
      db.select({ eudrStatut: membresTable.statutEudr, count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          sql`${membresTable.statutMembre} = 'actif'`,
          sql`${membresTable.gpsParcelles} IS NOT NULL`,
        ))
        .groupBy(membresTable.statutEudr),
      db.select({ count: sql<number>`count(*)::int` })
        .from(missionsTerrainTable)
        .where(and(
          eq(missionsTerrainTable.cooperativeId, cooperativeId),
          sql`${missionsTerrainTable.statut} = 'soumise'`,
        )),
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          sql`${membresTable.statutMembre} = 'actif'`,
          sql`${membresTable.completudeEudr} = 100`,
        )),
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          sql`${membresTable.statutMembre} = 'actif'`,
          sql`${membresTable.completudeIdentite} = 100`,
        )),
    ]);

    const membresTotal = membresRow?.count ?? 0;
    const membresSansGps = sansGpsRow?.count ?? 0;
    const demandesEnAttente = demandesRow?.count ?? 0;
    const missionsSoumises = missionsRow?.count ?? 0;
    const membresEudrConformes = eudrConformesRow?.count ?? 0;
    const membresIdentiteComplets = identiteCompletsRow?.count ?? 0;

    let parcellesTotal = 0, parcellesConformes = 0, parcellesNonConformes = 0, parcellesNonVerifiees = 0;
    for (const r of parcellesRows) {
      parcellesTotal += r.count;
      if (r.eudrStatut === "conforme")       parcellesConformes += r.count;
      else if (r.eudrStatut === "non_conforme") parcellesNonConformes += r.count;
      else                                    parcellesNonVerifiees += r.count;
    }

    const tauxEudrConforme   = parcellesTotal > 0 ? Math.round((parcellesConformes / parcellesTotal) * 100) : 0;
    const tauxCompletionGps  = membresTotal   > 0 ? Math.round(((membresTotal - membresSansGps) / membresTotal) * 100) : 0;
    const tauxEudrMembres    = membresTotal   > 0 ? Math.round((membresEudrConformes / membresTotal) * 100) : 0;
    const tauxIdentite       = membresTotal   > 0 ? Math.round((membresIdentiteComplets / membresTotal) * 100) : 0;

    res.json({
      membresTotal, membresSansGps, demandesEnAttente, missionsSoumises,
      parcellesTotal, parcellesConformes, parcellesNonConformes, parcellesNonVerifiees,
      tauxEudrConforme, tauxCompletionGps,
      membresEudrConformes, membresIdentiteComplets, tauxEudrMembres, tauxIdentite,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardTracabilite");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDashboardDelegue(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const delegueId = req.user?.id;
  if (!cooperativeId || !delegueId) {
    res.status(403).json({ erreur: "Accès refusé" });
    return;
  }

  try {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const debutMoisStr = debutMois.toISOString().split("T")[0]!;

    const [campagneActive] = await db
      .select({ id: campagnesTable.id, libelle: campagnesTable.libelle, anneeDebut: campagnesTable.anneeDebut, anneeFin: campagnesTable.anneeFin, tonnageCibleKg: campagnesTable.tonnageCibleKg })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
      .limit(1);

    const campagneId = campagneActive?.id ?? null;

    const membresCond = and(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(membresTable.delegueId, delegueId),
    );

    const [
      [membresRow],
      [avancesEnCoursRow],
      [avancesOctroye],
      [avancesRembourse],
      [avancesRetardRow],
      [tonnageCampagneRow],
      [tonnageMoisRow],
      [livraisonsCampagneRow],
      dernieresLivraisons,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(membresCond, eq(membresTable.statut, "actif"))),

      db.select({ total: sql<number>`coalesce(sum(solde_restant_fcfa),0)::int` })
        .from(avancesTable)
        .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(membresCond, eq(avancesTable.statut, "en_cours"))),

      db.select({ total: sql<number>`coalesce(sum(montant_octroye_fcfa),0)::int` })
        .from(avancesTable)
        .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(membresCond, eq(avancesTable.statut, "en_cours"))),

      db.select({ total: sql<number>`coalesce(sum(montant_rembourse_fcfa),0)::int` })
        .from(avancesTable)
        .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(membresCond, eq(avancesTable.statut, "en_cours"))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(avancesTable)
        .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(membresCond, eq(avancesTable.statut, "en_retard"))),

      campagneId
        ? db.select({ tonnage: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
            .from(livraisonsTable)
            .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
            .where(and(membresCond, eq(livraisonsTable.campagneId, campagneId)))
        : Promise.resolve([{ tonnage: 0 }]),

      db.select({ tonnage: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(membresCond, gte(livraisonsTable.dateLivraison, debutMoisStr))),

      campagneId
        ? db.select({ count: sql<number>`count(*)::int` })
            .from(livraisonsTable)
            .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
            .where(and(membresCond, eq(livraisonsTable.campagneId, campagneId)))
        : Promise.resolve([{ count: 0 }]),

      db.select({
          id: livraisonsTable.id,
          poidsKg: livraisonsTable.poidsKg,
          montantNetFcfa: livraisonsTable.montantNetFcfa,
          dateLivraison: livraisonsTable.dateLivraison,
          membreNom: membresTable.nom,
          membrePrenoms: membresTable.prenoms,
        })
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(membresCond)
        .orderBy(desc(livraisonsTable.createdAt))
        .limit(5),
    ]);

    const montantOctroye = avancesOctroye?.total ?? 0;
    const montantRembourse = avancesRembourse?.total ?? 0;
    const tauxRemboursement = montantOctroye > 0 ? Math.round((montantRembourse / montantOctroye) * 100) : 0;

    res.json({
      membresActifs: membresRow?.count ?? 0,
      avancesEnCoursMontant: avancesEnCoursRow?.total ?? 0,
      avancesEnRetardNb: avancesRetardRow?.count ?? 0,
      tauxRemboursement,
      tonnageCampagne: tonnageCampagneRow?.tonnage ?? 0,
      tonnageMois: tonnageMoisRow?.tonnage ?? 0,
      nbLivraisonsCampagne: livraisonsCampagneRow?.count ?? 0,
      campagne: campagneActive ?? null,
      dernieresLivraisons,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardDelegue");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
