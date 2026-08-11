import { type Request, type Response } from "express";
import { db, usersTable, membresTable, avancesTable, livraisonsTable, paiementsTable, ventesExportateursTable, exportateursTable, parcellesTable, missionsTerrainTable, campagnesTable } from "@workspace/db";
import { eq, sql, desc, gte, lte, and, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    // Période par défaut : mois en cours. Paramètres optionnels pour filtrer.
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const debutMoisStr = debutMois.toISOString().split("T")[0]!;

    const rawDebut = typeof req.query.dateDebut === "string" ? req.query.dateDebut : null;
    const rawFin   = typeof req.query.dateFin   === "string" ? req.query.dateFin   : null;
    const periodeDebut = rawDebut ?? debutMoisStr;
    const periodeFin   = rawFin   ?? new Date().toISOString().split("T")[0]!;

    const debutPaiements = new Date(periodeDebut + "T00:00:00.000Z");

    const [
      [membresActifsRow],
      [membresHommesRow],
      [membresFemmesRow],
      [avancesRow],
      [tonnageRow],
      [paiementsRow],
      [creancesRow],
      [sacsRow],
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
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          gte(livraisonsTable.dateLivraison, periodeDebut),
          sql`${livraisonsTable.dateLivraison} <= ${periodeFin}`,
        )),
      db
        .select({ total: sql<number>`coalesce(sum(montant_fcfa),0)::int` })
        .from(paiementsTable)
        .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          sql`${paiementsTable.statut} IN ('confirme','effectue','en_cours')`,
          gte(paiementsTable.createdAt, debutPaiements),
        )),
      db
        .select({ total: sql<number>`coalesce(sum(solde_du_fcfa),0)::int` })
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
        .where(and(eq(exportateursTable.cooperativeId, cooperativeId), sql`${ventesExportateursTable.statut} != 'regle'`)),
      db
        .select({ sacs: sql<number>`coalesce(sum(nombre_sacs),0)::int` })
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(
          eq(membresTable.cooperativeId, cooperativeId),
          gte(livraisonsTable.dateLivraison, periodeDebut),
          sql`${livraisonsTable.dateLivraison} <= ${periodeFin}`,
        )),
    ]);

    res.json({
      membresActifs: membresActifsRow?.count ?? 0,
      membresHommes: membresHommesRow?.count ?? 0,
      membresFemmes: membresFemmesRow?.count ?? 0,
      avancesEnCoursMontant: avancesRow?.total ?? 0,
      tonnageMois: tonnageRow?.tonnage ?? 0,
      nombreSacsMois: sacsRow?.sacs ?? 0,
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
        nombreSacs: livraisonsTable.nombreSacs,
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
    const today = new Date();
    const debutMois = new Date(today.getFullYear(), today.getMonth(), 1);
    const debutMoisStr = debutMois.toISOString().split("T")[0]!;

    const dateDebut = typeof req.query.dateDebut === "string" && req.query.dateDebut ? req.query.dateDebut : debutMoisStr;
    const dateFin   = typeof req.query.dateFin   === "string" && req.query.dateFin   ? req.query.dateFin   : null;

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
      [sacsMoisRow],
      [sacsCampagneRow],
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
        .where(and(
          membresCond,
          gte(livraisonsTable.dateLivraison, dateDebut),
          ...(dateFin ? [lte(livraisonsTable.dateLivraison, dateFin)] : []),
        )),

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
          nombreSacs: livraisonsTable.nombreSacs,
          membreNom: membresTable.nom,
          membrePrenoms: membresTable.prenoms,
        })
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(membresCond)
        .orderBy(desc(livraisonsTable.createdAt))
        .limit(5),

      db.select({ sacs: sql<number>`coalesce(sum(nombre_sacs),0)::int` })
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(
          membresCond,
          gte(livraisonsTable.dateLivraison, dateDebut),
          ...(dateFin ? [lte(livraisonsTable.dateLivraison, dateFin)] : []),
        )),

      campagneId
        ? db.select({ sacs: sql<number>`coalesce(sum(nombre_sacs),0)::int` })
            .from(livraisonsTable)
            .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
            .where(and(membresCond, eq(livraisonsTable.campagneId, campagneId)))
        : Promise.resolve([{ sacs: 0 }]),
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
      nombreSacsMois: sacsMoisRow?.sacs ?? 0,
      nombreSacsCampagne: sacsCampagneRow?.sacs ?? 0,
      nbLivraisonsCampagne: livraisonsCampagneRow?.count ?? 0,
      campagne: campagneActive ?? null,
      dernieresLivraisons,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getDashboardDelegue");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /dashboard/peseurs-collectes  (délégué uniquement) ────────────────
export async function getDeleguesPeseursCollectes(req: Request, res: Response): Promise<void> {
  const delegueId    = req.user?.id;
  const cooperativeId = req.user?.cooperativeId;

  if (!delegueId || !cooperativeId) {
    res.status(401).json({ erreur: "Non authentifié" });
    return;
  }
  if (req.user?.role !== "delegue") {
    res.status(403).json({ erreur: "Réservé aux délégués" });
    return;
  }

  // Filtres optionnels
  const rawAgentId  = typeof req.query.agentId   === "string" ? parseInt(req.query.agentId, 10) : null;
  const rawDateDebut = typeof req.query.dateDebut === "string" && req.query.dateDebut ? req.query.dateDebut : null;
  const rawDateFin   = typeof req.query.dateFin   === "string" && req.query.dateFin   ? req.query.dateFin   : null;

  try {
    // 1. Trouver les peseurs rattachés à ce délégué
    const peseurs = await db
      .select({ id: usersTable.id, nom: usersTable.nom, prenoms: usersTable.prenoms, actif: usersTable.actif })
      .from(usersTable)
      .where(eq(usersTable.delegueId, delegueId));

    if (peseurs.length === 0) {
      res.json({ peseurs: [], collectes: [], stats: { nbPeseurs: 0, nbCollectes: 0, tonnageKg: 0, montantFcfa: 0 } });
      return;
    }

    const peseurIds = peseurs.map((p) => p.id);

    // Sécurité : vérifier que l'agentId demandé appartient bien à ce délégué
    const agentIdFilter = rawAgentId && peseurIds.includes(rawAgentId) ? rawAgentId : null;

    // 2. Collectes filtrées enregistrées par ces peseurs (100 max)
    // Depuis le changement agentId → delegueId, les livraisons des peseurs sont tracées
    // via livraisons.peseur_id. On inclut aussi livraisons.agent_id pour la rétrocompatibilité
    // (livraisons créées avant ce changement).
    const peseurIdsArr = sql.join(peseurIds.map((id) => sql`${id}`), sql`, `);
    const peseurFilter = agentIdFilter
      ? or(eq(livraisonsTable.peseurId, agentIdFilter), eq(livraisonsTable.agentId, agentIdFilter))!
      : or(
          sql`${livraisonsTable.peseurId} = ANY(ARRAY[${peseurIdsArr}]::int[])`,
          sql`${livraisonsTable.agentId}  = ANY(ARRAY[${peseurIdsArr}]::int[])`,
        )!;

    const conditions = [
      peseurFilter,
      eq(membresTable.cooperativeId, cooperativeId),
      ...(rawDateDebut ? [gte(livraisonsTable.dateLivraison, rawDateDebut)] : []),
      ...(rawDateFin   ? [lte(livraisonsTable.dateLivraison, rawDateFin)]   : []),
    ];

    // Alias pour joindre l'utilisateur peseur (via peseur_id en priorité, sinon agent_id)
    const peseurUserAlias = alias(usersTable, "peseur_user");

    const rows = await db
      .select({
        id:             livraisonsTable.id,
        dateLivraison:  livraisonsTable.dateLivraison,
        poidsKg:        livraisonsTable.poidsKg,
        montantNetFcfa: livraisonsTable.montantNetFcfa,
        statutPaiement: livraisonsTable.statutPaiement,
        peseurId:       livraisonsTable.peseurId,
        agentId:        livraisonsTable.agentId,
        membreNom:      membresTable.nom,
        membrePrenoms:  membresTable.prenoms,
        peseurNom:      peseurUserAlias.nom,
        peseurPrenoms:  peseurUserAlias.prenoms,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
      .leftJoin(peseurUserAlias, eq(peseurUserAlias.id, sql`COALESCE(${livraisonsTable.peseurId}, ${livraisonsTable.agentId})`))
      .where(and(...conditions))
      .orderBy(desc(livraisonsTable.dateLivraison), desc(livraisonsTable.id))
      .limit(100);

    const collectes = rows.map((r) => ({
      id:             r.id,
      dateLivraison:  r.dateLivraison,
      poidsKg:        parseFloat(r.poidsKg ?? "0"),
      montantNetFcfa: r.montantNetFcfa,
      statutPaiement: r.statutPaiement ?? "PAYÉ",
      membreNom:      r.membreNom ?? "—",
      membrePrenoms:  r.membrePrenoms ?? "",
      peseurId:       r.peseurId ?? r.agentId,
      peseurNom:      r.peseurNom ?? "—",
      peseurPrenoms:  r.peseurPrenoms ?? "",
    }));

    // 3. Stats agrégées
    const stats = {
      nbPeseurs:   peseurs.length,
      nbCollectes: collectes.length,
      tonnageKg:   collectes.reduce((s, c) => s + c.poidsKg, 0),
      montantFcfa: collectes.reduce((s, c) => s + c.montantNetFcfa, 0),
    };

    res.json({ peseurs, collectes, stats });
  } catch (err) {
    req.log.error({ err }, "Erreur getDeleguesPeseursCollectes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
