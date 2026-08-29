import { db, expeditionsTable, expeditionLotsTable, expeditionHistoriqueTable, campagnesTable, membresTable, livraisonsTable, exportateursTable, vehiculesTable, chauffeursTable, lotsTable, lotLivraisonsTable, parcellesTable, ventesExportateursTable, entrepotsTable, mouvementsStockTable, traitementsRefusTable } from "@workspace/db";
import { calculerPoidsAcceptePort } from "./venteReceptionService";
import { eq, and, desc, sql, count, notInArray, inArray } from "drizzle-orm";
import { proposerEcriture, proposerEcrituresDansTransaction } from "./comptabiliteService";
import { enregistrerMouvement as enregistrerMouvementCaisse } from "./caisseService.js";
import { enregistrerMouvement as enregistrerMouvementBanque } from "./banqueService.js";
import type { ComptabiliteTransaction } from "./comptabiliteService.js";
import { notifExpeditionArriveePort, notifExpeditionLitige } from "./notificationService.js";
import { logger } from "../lib/logger";

// ── Numérotation automatique EXP-AAAA-XXXX ──────────────────────────────────

export async function genererNumeroExpedition(cooperativeId: number): Promise<string> {
  const annee = new Date().getFullYear();
  // Format multi-tenant : EXP-{année}-{coopId}-{seq}
  // Garantit l'unicité globale même si deux coopératives commencent leur séquence à 0001
  const prefixe = `EXP-${annee}-${cooperativeId}-`;
  const rows = await db
    .select({ numero: expeditionsTable.numeroExpedition })
    .from(expeditionsTable)
    .where(
      and(
        eq(expeditionsTable.cooperativeId, cooperativeId),
        sql`numero_expedition LIKE ${prefixe + "%"}`
      )
    )
    .orderBy(desc(expeditionsTable.numeroExpedition))
    .limit(1);

  let suivant = 1;
  if (rows.length > 0) {
    const last = rows[0]!.numero;
    // Dernier segment = numéro séquentiel
    const parts = last.split("-");
    const num = parseInt(parts[parts.length - 1] ?? "0", 10);
    suivant = isNaN(num) ? 1 : num + 1;
  }
  return `${prefixe}${String(suivant).padStart(4, "0")}`;
}

// ── Liste des expéditions ───────────────────────────────────────────────────

export async function listExpeditions(cooperativeId: number, filtres?: {
  statut?: string;
  port?: string;
  typeVehicule?: string;
  litiges?: boolean;
}) {
  const conditions = [eq(expeditionsTable.cooperativeId, cooperativeId)];

  if (filtres?.statut) {
    conditions.push(eq(expeditionsTable.statut, filtres.statut as typeof expeditionsTable.$inferSelect["statut"]));
  }
  if (filtres?.litiges) {
    conditions.push(eq(expeditionsTable.statut, "litige"));
  }
  if (filtres?.port) {
    conditions.push(eq(expeditionsTable.port, filtres.port));
  }
  if (filtres?.typeVehicule) {
    conditions.push(eq(expeditionsTable.typeVehicule, filtres.typeVehicule as "propre" | "location"));
  }

  const rows = await db
    .select({
      id:               expeditionsTable.id,
      numeroExpedition: expeditionsTable.numeroExpedition,
      statut:           expeditionsTable.statut,
      typeVehicule:     expeditionsTable.typeVehicule,
      immatriculation:  expeditionsTable.immatriculation,
      nomChauffeur:     expeditionsTable.nomChauffeur,
      transporteur:     expeditionsTable.transporteur,
      port:             expeditionsTable.port,
      dateDepart:       expeditionsTable.dateDepart,
      poidsChargeKg:    expeditionsTable.poidsChargeKg,
      nombreSacs:       expeditionsTable.nombreSacs,
      poidsRecuPortKg:  expeditionsTable.poidsRecuPortKg,
      ecartPoidsKg:     expeditionsTable.ecartPoidsKg,
      provisionLitige:  expeditionsTable.provisionLitige,
      exportateurNom:   expeditionsTable.exportateurNom,
      campagneId:       expeditionsTable.campagneId,
      createdAt:        expeditionsTable.createdAt,
      nbLots: sql<number>`(
        SELECT COUNT(*) FROM expedition_lots
        WHERE expedition_id = ${expeditionsTable.id}
      )::int`,
    })
    .from(expeditionsTable)
    .where(and(...conditions))
    .orderBy(desc(expeditionsTable.createdAt));

  return rows;
}

// ── Statistiques résumées ───────────────────────────────────────────────────

export async function getExpeditionsStats(cooperativeId: number) {
  const rows = await db
    .select({
      statut: expeditionsTable.statut,
      nb: count(expeditionsTable.id),
    })
    .from(expeditionsTable)
    .where(eq(expeditionsTable.cooperativeId, cooperativeId))
    .groupBy(expeditionsTable.statut);

  const stats: Record<string, number> = {};
  for (const row of rows) stats[row.statut] = row.nb;

  return {
    enCours:     (stats["en_preparation"] ?? 0) + (stats["charge"] ?? 0) + (stats["en_transit"] ?? 0) + (stats["arrive_port"] ?? 0),
    receptionnes: stats["receptionne"] ?? 0,
    litiges:     stats["litige"] ?? 0,
  };
}

// ── Détail expédition ───────────────────────────────────────────────────────

export async function getExpedition(cooperativeId: number, expeditionId: number) {
  const rows = await db
    .select()
    .from(expeditionsTable)
    .where(and(
      eq(expeditionsTable.id, expeditionId),
      eq(expeditionsTable.cooperativeId, cooperativeId),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  const exp = rows[0]!;

  const lots = await db
    .select({
      id:              expeditionLotsTable.id,
      lotId:           expeditionLotsTable.lotId,
      membreId:        expeditionLotsTable.membreId,
      livraisonId:     expeditionLotsTable.livraisonId,
      poidsKg:         expeditionLotsTable.poidsKg,
      nombreSacs:      expeditionLotsTable.nombreSacs,
      certificatEudr:  expeditionLotsTable.certificatEudr,
      parcelleOrigine: expeditionLotsTable.parcelleOrigine,
      membreNom:       membresTable.nom,
      membrePrenoms:   membresTable.prenoms,
      lotStatut:       lotsTable.statut,
      lotEntrepot:     lotsTable.entrepot,
    })
    .from(expeditionLotsTable)
    .leftJoin(membresTable, eq(membresTable.id, expeditionLotsTable.membreId))
    .leftJoin(lotsTable, eq(lotsTable.id, expeditionLotsTable.lotId))
    .where(eq(expeditionLotsTable.expeditionId, expeditionId));

  const historique = await db
    .select()
    .from(expeditionHistoriqueTable)
    .where(eq(expeditionHistoriqueTable.expeditionId, expeditionId))
    .orderBy(desc(expeditionHistoriqueTable.dateChangement));

  // Détecte si TOUS les lots rattachés proviennent de fournisseurs externes (pas de membres)
  const lotIds = lots.map(l => l.lotId).filter((id): id is number => id !== null && id !== undefined);
  let lotsNonMembres = false;
  if (lotIds.length > 0) {
    const [membreCheck] = await db
      .select({ nb: count() })
      .from(lotLivraisonsTable)
      .innerJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
      .where(and(
        inArray(lotLivraisonsTable.lotId, lotIds),
        sql`${livraisonsTable.membreId} IS NOT NULL`,
      ));
    lotsNonMembres = (membreCheck?.nb ?? 0) === 0;
  }

  return { ...exp, lots, historique, lotsNonMembres };
}

// ── Lots disponibles pour rattachement ──────────────────────────────────────

export async function getLotsDisponibles(cooperativeId: number, expeditionId: number) {
  // Lots déjà rattachés à cette expédition
  const deja = await db
    .select({ lotId: expeditionLotsTable.lotId })
    .from(expeditionLotsTable)
    .where(
      and(
        eq(expeditionLotsTable.expeditionId, expeditionId),
        sql`${expeditionLotsTable.lotId} IS NOT NULL`
      )
    );

  const dejaIds = deja.map(r => r.lotId as number).filter(Boolean);

  const query = db
    .select({
      id:            lotsTable.id,
      statut:        lotsTable.statut,
      poidsTotalKg:  lotsTable.poidsTotalKg,
      entrepot:      lotsTable.entrepot,
      dateCreation:  lotsTable.dateCreation,
      qrCodeLot:     lotsTable.qrCodeLot,
      campagneId:    lotsTable.campagneId,
      nombreSacs:    lotsTable.nombreSacs,
    })
    .from(lotsTable)
    .where(
      and(
        eq(lotsTable.cooperativeId, cooperativeId),
        inArray(lotsTable.statut, ["en_stock", "vendu"]),
        ...(dejaIds.length > 0 ? [notInArray(lotsTable.id, dejaIds)] : [])
      )
    )
    .orderBy(desc(lotsTable.dateCreation));

  return query;
}

export async function rattacherLot(expeditionId: number, lotId: number, cooperativeId: number) {
  // Vérifier que le lot appartient à la coopérative
  const [lot] = await db
    .select()
    .from(lotsTable)
    .where(and(eq(lotsTable.id, lotId), eq(lotsTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!lot) throw new Error("Lot introuvable ou accès refusé");

  // Vérifier que le lot n'est pas déjà rattaché à cette expédition
  const [existing] = await db
    .select({ id: expeditionLotsTable.id })
    .from(expeditionLotsTable)
    .where(
      and(
        eq(expeditionLotsTable.expeditionId, expeditionId),
        eq(expeditionLotsTable.lotId, lotId)
      )
    )
    .limit(1);

  if (existing) throw new Error("Lot déjà rattaché à cette expédition");

  const [row] = await db
    .insert(expeditionLotsTable)
    .values({
      expeditionId,
      lotId,
      poidsKg:    lot.poidsTotalKg,
      nombreSacs: lot.nombreSacs ?? null,
    })
    .returning();

  return row;
}

export async function detacherLot(expeditionLotId: number, expeditionId: number) {
  const [row] = await db
    .delete(expeditionLotsTable)
    .where(
      and(
        eq(expeditionLotsTable.id, expeditionLotId),
        eq(expeditionLotsTable.expeditionId, expeditionId)
      )
    )
    .returning();

  if (!row) throw new Error("Ligne introuvable");
  return row;
}

// ── Flotte disponible ────────────────────────────────────────────────────────

export async function getFlotteVehicules(cooperativeId: number) {
  return db
    .select({
      id:              vehiculesTable.id,
      immatriculation: vehiculesTable.immatriculation,
      marque:          vehiculesTable.marque,
      modele:          vehiculesTable.modele,
      capaciteKg:      vehiculesTable.capaciteKg,
      statut:          vehiculesTable.statut,
    })
    .from(vehiculesTable)
    .where(
      and(
        eq(vehiculesTable.cooperativeId, cooperativeId),
        eq(vehiculesTable.proprietaire, "cooperative"),
      )
    )
    .orderBy(vehiculesTable.immatriculation);
}

export async function getFlotteChauffeurs(cooperativeId: number) {
  return db
    .select({
      id:        chauffeursTable.id,
      nom:       chauffeursTable.nom,
      prenoms:   chauffeursTable.prenoms,
      telephone: chauffeursTable.telephone,
      statut:    chauffeursTable.statut,
    })
    .from(chauffeursTable)
    .where(
      and(
        eq(chauffeursTable.cooperativeId, cooperativeId),
        eq(chauffeursTable.statut, "actif"),
      )
    )
    .orderBy(chauffeursTable.nom);
}

// ── Création ─────────────────────────────────────────────────────────────────

export interface CreateExpeditionInput {
  campagneId?: number;
  exerciceId?: number;
  typeVehicule: "propre" | "location";
  vehiculeId?: number;
  chauffeurId?: number;
  immatriculation?: string;
  nomChauffeur?: string;
  telephoneChauffeur?: string;
  transporteur?: string;
  numeroBonTransport?: string;
  dateDepart?: string;
  lieuDepart?: string;
  poidsChargeKg?: number;
  nombreSacs?: number;
  numeroLots?: string;
  port: string;
  entrepotDestination?: string;
  exportateurId?: number;
  exportateurNom?: string;
  numeroContratExport?: string;
  heureEstimeeArrivee?: string;
  // Certificat phytosanitaire
  certificatPhytoNumero?: string;
  certificatPhytoDateEmission?: string;
  certificatPhytoDateExpiration?: string;
  certificatPhytoOrganisme?: string;
  documents?: unknown[];
  lots?: Array<{
    membreId?: number;
    livraisonId?: number;
    poidsKg?: number;
    nombreSacs?: number;
    certificatEudr?: string;
    parcelleOrigine?: string;
  }>;
}

export async function createExpedition(cooperativeId: number, userId: number, input: CreateExpeditionInput) {
  // Normalise les champs optionnels : chaîne vide → null (le formulaire peut envoyer "" pour les champs non remplis)
  const toIntOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const toDateStrOrNull = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    return String(v);
  };

  // Si camion propre avec vehiculeId, auto-résoudre immatriculation depuis flotte
  let immatriculation = input.immatriculation ?? null;
  let nomChauffeur    = input.nomChauffeur ?? null;
  let telephoneChauffeur = input.telephoneChauffeur ?? null;

  if (input.vehiculeId) {
    const veh = await db.select({ immatriculation: vehiculesTable.immatriculation })
      .from(vehiculesTable).where(eq(vehiculesTable.id, input.vehiculeId)).limit(1);
    if (veh[0]) immatriculation = veh[0].immatriculation;
  }
  if (input.chauffeurId) {
    const ch = await db.select({ nom: chauffeursTable.nom, prenoms: chauffeursTable.prenoms, telephone: chauffeursTable.telephone })
      .from(chauffeursTable).where(eq(chauffeursTable.id, input.chauffeurId)).limit(1);
    if (ch[0]) {
      nomChauffeur       = `${ch[0].nom} ${ch[0].prenoms ?? ""}`.trim();
      telephoneChauffeur = ch[0].telephone ?? null;
    }
  }

  // Rattachement automatique à la campagne en cours si non fourni
  let campagneId = toIntOrNull(input.campagneId);
  if (!campagneId) {
    const [campagneActive] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(
        eq(campagnesTable.cooperativeId, cooperativeId),
        eq(campagnesTable.statut, "ouverte"),
      ))
      .orderBy(desc(campagnesTable.createdAt))
      .limit(1);
    campagneId = campagneActive?.id ?? null;
  }

  const values = {
    cooperativeId,
    campagneId,
    exerciceId:         toIntOrNull(input.exerciceId),
    typeVehicule:       input.typeVehicule,
    vehiculeId:         toIntOrNull(input.vehiculeId),
    chauffeurId:        toIntOrNull(input.chauffeurId),
    immatriculation,
    nomChauffeur,
    telephoneChauffeur,
    transporteur:       input.transporteur || null,
    numeroBonTransport: input.numeroBonTransport || null,
    dateDepart:         input.dateDepart ? new Date(input.dateDepart) : null,
    lieuDepart:         input.lieuDepart || "Magasin central",
    poidsChargeKg:      input.poidsChargeKg ? String(input.poidsChargeKg) : null,
    nombreSacs:         toIntOrNull(input.nombreSacs),
    numeroLots:         input.numeroLots || null,
    port:               input.port,
    entrepotDestination: input.entrepotDestination || null,
    exportateurId:      toIntOrNull(input.exportateurId),
    exportateurNom:     input.exportateurNom || null,
    numeroContratExport: input.numeroContratExport || null,
    heureEstimeeArrivee: input.heureEstimeeArrivee ? new Date(input.heureEstimeeArrivee) : null,
    certificatPhytoNumero:         input.certificatPhytoNumero || null,
    certificatPhytoDateEmission:   toDateStrOrNull(input.certificatPhytoDateEmission),
    certificatPhytoDateExpiration: toDateStrOrNull(input.certificatPhytoDateExpiration),
    certificatPhytoOrganisme:      input.certificatPhytoOrganisme || "DPVC",
    documents:          input.documents ?? [],
    statut:             "en_preparation" as const,
    creePar:            userId,
  };

  // Tente l'insertion dans une transaction atomique.
  // En cas de doublon sur numero_expedition (résidu de tests partiels),
  // on régénère un numéro plus élevé et on réessaie une fois.
  const isUniqueViolation = (err: unknown) =>
    err instanceof Error &&
    (err.message.includes("duplicate key") || (err.cause instanceof Error && err.cause.message.includes("duplicate key")));

  const tryInsert = async (numero: string) =>
    db.transaction(async (tx) => {
      const [exp] = await tx.insert(expeditionsTable).values({ numeroExpedition: numero, ...values }).returning();
      if (!exp) throw new Error("Échec création expédition");

      if (input.lots && input.lots.length > 0) {
        await tx.insert(expeditionLotsTable).values(
          input.lots.map(l => ({
            expeditionId:    exp.id,
            membreId:        l.membreId ?? null,
            livraisonId:     l.livraisonId ?? null,
            poidsKg:         l.poidsKg ? String(l.poidsKg) : null,
            nombreSacs:      l.nombreSacs ?? null,
            certificatEudr:  l.certificatEudr ?? null,
            parcelleOrigine: l.parcelleOrigine ?? null,
          }))
        );
      }

      await tx.insert(expeditionHistoriqueTable).values({
        expeditionId:   exp.id,
        statutPrecedent: null,
        statutNouveau:  "en_preparation",
        faitPar:        userId,
        notes:          "Expédition créée",
      });

      return exp;
    });

  const numero = await genererNumeroExpedition(cooperativeId);
  try {
    return await tryInsert(numero);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Numéro déjà pris (résidu d'un test partiel) — on régénère le suivant
      const numeroSuivant = await genererNumeroExpedition(cooperativeId);
      return await tryInsert(numeroSuivant);
    }
    throw err;
  }
}

// ── Prix unitaire réel de l'expédition ───────────────────────────────────────
// Cherche le prix unitaire (FCFA/kg) dans la vente exportateur liée aux lots
// de cette expédition. Retourne la valeur réelle si trouvée, sinon 0 (indication
// que la vente n'a pas encore été saisie — le montant sera recalculé ultérieurement).

const PRIX_COUT_DEFAUT_KG = 0;

async function getPrixUnitaireExpedition(expeditionId: number): Promise<number> {
  const lots = await db
    .select({ lotId: expeditionLotsTable.lotId })
    .from(expeditionLotsTable)
    .where(eq(expeditionLotsTable.expeditionId, expeditionId));

  if (lots.length === 0) return PRIX_COUT_DEFAUT_KG;

  const lotIds = lots.map((l) => l.lotId).filter((id): id is number => id !== null);

  const ventes = await db
    .select({
      prixUnitaireFcfa: ventesExportateursTable.prixUnitaireFcfa,
      poidsKg:          ventesExportateursTable.poidsKg,
    })
    .from(ventesExportateursTable)
    .where(inArray(ventesExportateursTable.lotId, lotIds));

  if (ventes.length === 0) return PRIX_COUT_DEFAUT_KG;

  // Moyenne pondérée des prix unitaires des ventes liées
  let totalMontant = 0;
  let totalPoids   = 0;
  for (const v of ventes) {
    const poids = parseFloat(String(v.poidsKg ?? "0"));
    const prix  = Number(v.prixUnitaireFcfa ?? 0);
    totalMontant += poids * prix;
    totalPoids   += poids;
  }
  return totalPoids > 0 ? Math.round(totalMontant / totalPoids) : PRIX_COUT_DEFAUT_KG;
}

// ── Déduction stock lors du chargement ──────────────────────────────────────
// Appelé lors de la transition en_preparation → charge.
// Pour chaque lot attaché à l'expédition, crée un mouvement de sortie dans
// l'entrepôt source du lot. Non-bloquant : les erreurs sont loguées seulement.

async function deduireStockChargement(
  expeditionId: number,
  cooperativeId: number,
  userId: number,
  numeroExpedition: string,
): Promise<void> {
  // Récupérer les lots attachés avec leur entrepôt source et leur poids
  const lotsAttaches = await db
    .select({
      lotId:       expeditionLotsTable.lotId,
      poidsKg:     expeditionLotsTable.poidsKg,
      nombreSacs:  expeditionLotsTable.nombreSacs,
      entrepotNom: lotsTable.entrepot,
    })
    .from(expeditionLotsTable)
    .leftJoin(lotsTable, eq(lotsTable.id, expeditionLotsTable.lotId))
    .where(
      and(
        eq(expeditionLotsTable.expeditionId, expeditionId),
        sql`${expeditionLotsTable.lotId} IS NOT NULL`,
      )
    );

  if (lotsAttaches.length === 0) return;

  // Regrouper par nom d'entrepôt (un lot → un entrepôt)
  const parEntrepot = new Map<string, { poidsKg: number; nombreSacs: number; lotId: number | null }>();
  for (const lot of lotsAttaches) {
    const nom = (lot.entrepotNom ?? "").trim();
    if (!nom) continue;
    const poids = parseFloat(String(lot.poidsKg ?? "0"));
    if (poids <= 0) continue;
    const existing = parEntrepot.get(nom);
    if (existing) {
      existing.poidsKg   += poids;
      existing.nombreSacs += lot.nombreSacs ?? 0;
    } else {
      parEntrepot.set(nom, {
        poidsKg:    poids,
        nombreSacs: lot.nombreSacs ?? 0,
        lotId:      lot.lotId ?? null,
      });
    }
  }

  if (parEntrepot.size === 0) return;

  // Pour chaque entrepôt impliqué, insérer un mouvement de sortie
  for (const [nomEntrepot, data] of parEntrepot) {
    const [entrepot] = await db
      .select({ id: entrepotsTable.id })
      .from(entrepotsTable)
      .where(and(
        eq(entrepotsTable.cooperativeId, cooperativeId),
        eq(entrepotsTable.nom, nomEntrepot),
      ))
      .limit(1);

    if (!entrepot) {
      logger.warn(
        { nomEntrepot, expeditionId },
        "Entrepôt introuvable pour déduction stock – mouvement ignoré",
      );
      continue;
    }

    await db.insert(mouvementsStockTable).values({
      entrepotId:  entrepot.id,
      lotId:       data.lotId,
      type:        "sortie",
      poidsKg:     String(data.poidsKg.toFixed(2)),
      nombreSacs:  data.nombreSacs > 0 ? data.nombreSacs : null,
      motif:       `Chargement expédition ${numeroExpedition}`,
      agentId:     userId,
    });

    logger.info(
      { entrepotId: entrepot.id, poidsKg: data.poidsKg, expeditionId },
      "Sortie stock enregistrée – chargement expédition",
    );
  }
}

// ── Changement de statut ────────────────────────────────────────────────────

const TRANSITIONS_VALIDES: Record<string, string[]> = {
  en_preparation: ["charge"],
  charge:         ["en_transit"],
  en_transit:     ["arrive_port"],
  arrive_port:    ["receptionne", "litige"],
  receptionne:    [],
  litige:         ["receptionne"],
};

export async function changerStatut(
  cooperativeId: number,
  expeditionId: number,
  userId: number,
  nouveauStatut: string,
  notes?: string,
  positionGps?: unknown
) {
  const rows = await db
    .select()
    .from(expeditionsTable)
    .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Expédition introuvable");
  const exp = rows[0]!;

  const trans = TRANSITIONS_VALIDES[exp.statut] ?? [];
  if (!trans.includes(nouveauStatut)) {
    throw new Error(`Transition ${exp.statut} → ${nouveauStatut} non autorisée`);
  }

  const updateValues: Partial<typeof expeditionsTable.$inferInsert> = {
    statut: nouveauStatut as typeof expeditionsTable.$inferSelect["statut"],
    updatedAt: new Date(),
  };

  if (nouveauStatut === "en_transit") {
    updateValues.dateDepart = updateValues.dateDepart ?? new Date();
  }
  if (nouveauStatut === "arrive_port") {
    updateValues.dateArriveePort = new Date();
    // Notification arrivée port (fire-and-forget)
    void notifExpeditionArriveePort(
      cooperativeId,
      exp.numeroExpedition,
      exp.port,
      expeditionId,
    );
  }

  await db.update(expeditionsTable).set(updateValues).where(eq(expeditionsTable.id, expeditionId));

  await db.insert(expeditionHistoriqueTable).values({
    expeditionId,
    statutPrecedent: exp.statut,
    statutNouveau:   nouveauStatut,
    faitPar:         userId,
    notes:           notes ?? null,
    positionGps:     positionGps ?? null,
  });

  // Déduction stock + écriture comptable au chargement (en_preparation → charge)
  if (nouveauStatut === "charge") {
    // 1. Mouvement de sortie dans les entrepôts sources (non-bloquant)
    try {
      await deduireStockChargement(expeditionId, cooperativeId, userId, exp.numeroExpedition);
    } catch (err) {
      logger.error({ err }, "Erreur déduction stock chargement");
    }

    // 2. Mettre à jour expeditionsTable.nombreSacs avec le total des lots rattachés
    //    et passer le statut des lots en "transit"
    try {
      const lotsChargement = await db
        .select({
          lotId:      expeditionLotsTable.lotId,
          nombreSacs: expeditionLotsTable.nombreSacs,
        })
        .from(expeditionLotsTable)
        .where(eq(expeditionLotsTable.expeditionId, expeditionId));

      const totalSacs = lotsChargement.reduce((sum, l) => sum + (l.nombreSacs ?? 0), 0);
      if (totalSacs > 0) {
        await db
          .update(expeditionsTable)
          .set({ nombreSacs: totalSacs })
          .where(eq(expeditionsTable.id, expeditionId));
      }

      const lotIds = lotsChargement
        .map(l => l.lotId)
        .filter((id): id is number => id !== null);
      if (lotIds.length > 0) {
        await db
          .update(lotsTable)
          .set({ statut: "transit" })
          .where(inArray(lotsTable.id, lotIds));
      }
    } catch (err) {
      logger.error({ err }, "Erreur mise à jour sacs/statut lots au chargement");
    }

    // 3. Écriture comptable si prix unitaire connu (vente exportateur déjà saisie)
    if (exp.poidsChargeKg) {
      const dateStr = new Date().toISOString().split("T")[0]!;
      const prixKg = await getPrixUnitaireExpedition(expeditionId);
      if (prixKg > 0) {
        const montant = Math.round(parseFloat(String(exp.poidsChargeKg)) * prixKg);
        try {
          await proposerEcriture(cooperativeId, {
            source:       "stock",
            sourceId:     expeditionId,
            libelle:      `Départ ${exp.numeroExpedition} vers Port ${exp.port}`,
            compteDebit:  "381",
            compteCredit: "311",
            montantFcfa:  montant,
            date:         dateStr,
            numeroPiece:  exp.numeroExpedition,
          });
        } catch (err) {
          logger.error({ err }, "Erreur écriture comptable chargement");
        }
      }
    }
  }

  // Une réception passée en litige peut être résolue ultérieurement. Si des
  // frais de transport avaient été saisis à la réception, leur dette est
  // constatée au moment où la réception devient définitivement acceptée.
  if (
    nouveauStatut === "receptionne" &&
    exp.statut === "litige" &&
    exp.fraisTransportFcfa &&
    Number(exp.fraisTransportFcfa) > 0
  ) {
    try {
      await proposerEcriture(cooperativeId, {
        source:      "transport",
        sourceId:    expeditionId,
        libelle:     `Frais transport ${exp.numeroExpedition}`,
        compteDebit:  "612",
        compteCredit: "401",
        montantFcfa:  Math.round(Number(exp.fraisTransportFcfa)),
        date:         new Date().toISOString().slice(0, 10),
        numeroPiece:  exp.numeroExpedition,
      });
    } catch (err) {
      logger.error({ err }, "Erreur écriture frais transport après résolution du litige");
    }
  }

  return { ok: true, statut: nouveauStatut };
}

// ── Réception au port ────────────────────────────────────────────────────────

const SEUIL_ACCEPTABLE = 0.005;
const SEUIL_LITIGE     = 0.02;

export async function confirmerReception(
  cooperativeId: number,
  expeditionId: number,
  userId: number,
  input: {
    poidsRecuPortKg: number;
    nombreSacsRecuPort?: number;
    numeroRecepissePort: string;
    nomReceptionnaire: string;
    dateArriveePort?: string;
    motifEcart?: string;
    fraisTransportFcfa?: number;
    exportateurId?: number;
    poidsRefuleKg?: number;
    nombreSacsRefoules?: number;
    motifRefus?: string;
  }
) {
  const rows = await db
    .select()
    .from(expeditionsTable)
    .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Expédition introuvable");
  const exp = rows[0]!;

  if (!["arrive_port", "en_transit", "receptionne", "litige"].includes(exp.statut)) {
    throw new Error("L'expédition doit être en transit ou arrivée au port pour confirmer la réception");
  }

  const poidsCharge = parseFloat(String(exp.poidsChargeKg ?? "0"));
  const poidsRecu   = input.poidsRecuPortKg;
  const poidsRefoule = input.poidsRefuleKg ?? 0;
  const poidsAccepte = calculerPoidsAcceptePort(poidsRecu, poidsRefoule);
  const ecartPoids  = poidsCharge - poidsRecu;
  const tauxEcart   = poidsCharge > 0 ? Math.abs(ecartPoids) / poidsCharge : 0;

  // Écart sacs — calculé uniquement si les deux valeurs sont connues
  const sacsCharges = exp.nombreSacs ?? null;
  const sacsRecus   = input.nombreSacsRecuPort ?? null;
  const ecartSacs   = sacsCharges !== null && sacsRecus !== null ? sacsCharges - sacsRecus : null;
  const tauxEcartSacs = ecartSacs !== null && sacsCharges !== null && sacsCharges > 0
    ? Math.abs(ecartSacs) / sacsCharges
    : null;

  // Litige si l'écart de POIDS OU l'écart de SACS dépasse le seuil de 2 %
  const littigePoids = tauxEcart > SEUIL_LITIGE;
  const littigeSacs  = tauxEcartSacs !== null && tauxEcartSacs > SEUIL_LITIGE;
  const nouveauStatut: "receptionne" | "litige" = littigePoids || littigeSacs ? "litige" : "receptionne";
  const provisionLitige = nouveauStatut === "litige";
  const fraisTransport = input.fraisTransportFcfa === undefined
    ? null
    : Math.round(Number(input.fraisTransportFcfa));
  if (fraisTransport !== null && (!Number.isFinite(fraisTransport) || fraisTransport < 0)) {
    throw new Error("Les frais de transport doivent être un montant positif");
  }

  // Notes enrichies avec infos sacs
  const notesSacs = ecartSacs !== null
    ? `. Sacs reçus : ${sacsRecus}/${sacsCharges}. Écart sacs : ${ecartSacs > 0 ? "-" : "+"}${Math.abs(ecartSacs)} sac(s) (${((tauxEcartSacs ?? 0) * 100).toFixed(2)}%)`
    : "";

  await db.update(expeditionsTable).set({
    statut:             nouveauStatut,
    poidsRecuPortKg:    String(poidsRecu),
    poidsAcceptePortKg: String(poidsAccepte),
    nombreSacsRecuPort: sacsRecus,
    ecartPoidsKg:       String(ecartPoids),
    motifEcart:         (input.motifEcart as typeof expeditionsTable.$inferSelect["motifEcart"]) ?? null,
    numeroRecepissePort: input.numeroRecepissePort,
    nomReceptionnaire:  input.nomReceptionnaire,
    dateArriveePort:    input.dateArriveePort ? new Date(input.dateArriveePort) : new Date(),
    statutReception:    nouveauStatut === "receptionne" ? "accepte" : "litige",
    provisionLitige,
    ...(fraisTransport !== null && exp.fraisTransportFcfa == null
      ? { fraisTransportFcfa: fraisTransport > 0 ? String(fraisTransport) : null, fraisTransportStatut: "non_paye" }
      : {}),
    updatedAt:          new Date(),
  }).where(eq(expeditionsTable.id, expeditionId));

  await db.insert(expeditionHistoriqueTable).values({
    expeditionId,
    statutPrecedent: exp.statut,
    statutNouveau:   nouveauStatut,
    faitPar:         userId,
    notes:           `Réception port. Poids reçu : ${poidsRecu} kg. Écart poids : ${ecartPoids.toFixed(2)} kg (${(tauxEcart * 100).toFixed(2)}%)${notesSacs}`,
  });

  // ── Enregistrement du stock refoulé si présent ──────────────────────────────
  if (poidsRefoule > 0) {
    const dateRefus = (input.dateArriveePort ?? new Date().toISOString()).split("T")[0]!;
    await db.insert(traitementsRefusTable).values({
      cooperativeId,
      expeditionId,
      sourceType:          "reception_port",
      dateRefus,
      poidsRefuleKg:       String(poidsRefoule),
      nombreSacsRefoules:  input.nombreSacsRefoules ?? 0,
      motifRefus:          input.motifRefus ?? null,
      statut:              "en_attente",
    });
  }

  const dateStr = new Date().toISOString().split("T")[0]!;
  const prixKg = await getPrixUnitaireExpedition(expeditionId);
  const montantStockTransit = Math.round(poidsCharge * prixKg);

  if (nouveauStatut === "receptionne") {
    try {
      // Solde stock transit : soldé au même prix que le départ (381 → 4111)
      // NB : le chiffre d'affaires est enregistré séparément via "Vente cacao"
      //      (generateEcrituresVente) lorsque la vente exportateur est créée.
      await proposerEcriture(cooperativeId, {
        source:      "stock",
        sourceId:    expeditionId,
        libelle:     `Solde stock transit ${exp.numeroExpedition}`,
        compteDebit:  "4111",
        compteCredit: "381",
        montantFcfa:  montantStockTransit,
        date:         dateStr,
        numeroPiece:  exp.numeroExpedition,
      });
    } catch (err) {
      logger.error({ err }, "Erreur écriture comptable réception");
    }

    if (
      input.fraisTransportFcfa &&
      input.fraisTransportFcfa > 0 &&
      exp.fraisTransportFcfa == null
    ) {
      try {
        await proposerEcriture(cooperativeId, {
          source:      "transport",
          sourceId:    expeditionId,
          libelle:     `Frais transport ${exp.numeroExpedition}`,
          compteDebit:  "612",
          compteCredit: "401",
          montantFcfa:  input.fraisTransportFcfa,
          date:         dateStr,
          numeroPiece:  exp.numeroExpedition,
        });
      } catch (err) {
        logger.error({ err }, "Erreur écriture frais transport");
      }
    }
  } else {
    const montantEcart = Math.round(Math.abs(ecartPoids) * prixKg);
    try {
      await proposerEcriture(cooperativeId, {
        source:      "stock",
        sourceId:    expeditionId,
        libelle:     `Écart litige ${exp.numeroExpedition} — ${ecartPoids.toFixed(1)} kg`,
        compteDebit:  "6511",
        compteCredit: "381",
        montantFcfa:  montantEcart,
        date:         dateStr,
        numeroPiece:  exp.numeroExpedition,
      });
      await proposerEcriture(cooperativeId, {
        source:      "stock",
        sourceId:    expeditionId,
        libelle:     `Provision litige ${exp.numeroExpedition}`,
        compteDebit:  "6591",
        compteCredit: "191",
        montantFcfa:  montantEcart,
        date:         dateStr,
        numeroPiece:  exp.numeroExpedition,
      });
    } catch (err) {
      logger.error({ err }, "Erreur écriture litige");
    }
    // Notification litige (fire-and-forget)
    void notifExpeditionLitige(
      cooperativeId,
      exp.numeroExpedition,
      exp.port,
      ecartPoids,
      tauxEcart * 100,
      expeditionId,
    );
  }

  return {
    statut:         nouveauStatut,
    ecartKg:        ecartPoids,
    tauxEcartPct:   tauxEcart * 100,
    provisionLitige,
    niveauAlerte:
      tauxEcart <= SEUIL_ACCEPTABLE  ? "acceptable" :
      tauxEcart <= SEUIL_LITIGE      ? "a_justifier" : "litige",
  };
}

// ── Règlement des frais de transport ─────────────────────────────────────────

export interface ReglerFraisTransportInput {
  modePaiement: "especes" | "banque";
  caisseId?: number;
  compteBancaireId?: number;
  dateReglement?: string;
  reference?: string;
}

export async function reglerFraisTransport(
  cooperativeId: number,
  expeditionId: number,
  userId: number,
  input: ReglerFraisTransportInput,
) {
  if (input.modePaiement !== "especes" && input.modePaiement !== "banque") {
    throw new Error("Le mode de paiement doit être espèces ou banque");
  }
  if (input.modePaiement === "especes" && !input.caisseId) {
    throw new Error("Une caisse est requise pour un règlement en espèces");
  }
  if (input.modePaiement === "banque" && !input.compteBancaireId) {
    throw new Error("Un compte bancaire est requis pour un règlement par banque");
  }

  return db.transaction(async (tx: ComptabiliteTransaction) => {
    // Ce verrou fait de la transition non_paye → paye une opération
    // idempotente, même si deux règlements sont soumis simultanément.
    const [exp] = await tx
      .select()
      .from(expeditionsTable)
      .where(and(
        eq(expeditionsTable.id, expeditionId),
        eq(expeditionsTable.cooperativeId, cooperativeId),
      ))
      .for("update")
      .limit(1);

    if (!exp) throw new Error("Expédition introuvable");
    if (exp.statut === "litige" || String(exp.statut) === "annule" || exp.statutReception === "annule") {
      throw new Error("Le règlement est impossible pour une réception en litige ou annulée");
    }
    if (exp.statut !== "receptionne") {
      throw new Error("Les frais ne peuvent être réglés que pour une réception acceptée");
    }

    const montant = Math.round(Number(exp.fraisTransportFcfa ?? 0));
    if (!Number.isFinite(montant) || montant <= 0) {
      throw new Error("Aucun frais de transport à régler pour cette expédition");
    }
    if (exp.fraisTransportStatut === "paye") {
      throw new Error("Les frais de transport de cette expédition sont déjà réglés");
    }

    const dateReglement = input.dateReglement ?? new Date().toISOString().slice(0, 10);
    const reference = input.reference ?? `EXP-${exp.numeroExpedition}-TRANSPORT`;
    const libelle = `Règlement frais transport ${exp.numeroExpedition}`;

    let mouvementId: number;
    if (input.modePaiement === "especes") {
      const result = await enregistrerMouvementCaisse(input.caisseId!, {
        type: "sortie",
        motif: "reglement_frais_exportation",
        montantFcfa: montant,
        libelle,
        referenceOperation: reference,
        userId,
        cooperativeId,
        skipAccounting: true,
      }, tx);
      mouvementId = result.mouvement.id;
    } else {
      const result = await enregistrerMouvementBanque(input.compteBancaireId!, cooperativeId, {
        type: "debit",
        motif: "reglement_frais_exportation",
        montantFcfa: montant,
        libelle,
        reference,
        dateOperation: dateReglement,
        userId,
        skipAccounting: true,
      }, tx);
      mouvementId = result.mouvement.id;
    }

    // Le compte de dette est soldé vers l'actif réellement débité. La source
    // transport conserve le paramétrage autoTransport et les exports
    // comptables identifient l'expédition comme pièce d'origine.
    await proposerEcrituresDansTransaction(tx, cooperativeId, [{
      source:       "transport",
      sourceId:     expeditionId,
      libelle,
      compteDebit:  "401",
      compteCredit: input.modePaiement === "especes" ? "571" : "521",
      montantFcfa:  montant,
      date:         dateReglement,
      numeroPiece:  `${exp.numeroExpedition}-REG`,
    }]);

    const [updated] = await tx
      .update(expeditionsTable)
      .set({
        fraisTransportStatut:             "paye",
        fraisTransportModePaiement:       input.modePaiement,
        fraisTransportCaisseId:           input.modePaiement === "especes" ? input.caisseId! : null,
        fraisTransportCompteBancaireId:   input.modePaiement === "banque" ? input.compteBancaireId! : null,
        fraisTransportDateReglement:      dateReglement,
        fraisTransportReferenceReglement: reference,
        fraisTransportReglePar:           userId,
        updatedAt:                        new Date(),
      })
      .where(and(
        eq(expeditionsTable.id, expeditionId),
        eq(expeditionsTable.cooperativeId, cooperativeId),
        eq(expeditionsTable.fraisTransportStatut, "non_paye"),
      ))
      .returning();

    if (!updated) throw new Error("Le règlement des frais de transport a déjà été enregistré");
    return {
      expeditionId,
      statut: updated.fraisTransportStatut,
      modePaiement: input.modePaiement,
      montantFcfa: montant,
      mouvementId,
    };
  });
}

// ── Rapport EUDR ─────────────────────────────────────────────────────────────

export async function getRapportEudr(cooperativeId: number, expeditionId: number) {
  const exp = await getExpedition(cooperativeId, expeditionId);
  if (!exp) throw new Error("Expédition introuvable");

  const poidsTotal = exp.lots.reduce((s, l) => s + parseFloat(String(l.poidsKg ?? "0")), 0);
  const avecCertificat = exp.lots.filter(l => l.certificatEudr).length;

  // Récupère les parcelles GPS (parcellesTable) pour tous les membres du lot
  const membreIds = exp.lots
    .map(l => l.membreId)
    .filter((id): id is number => id !== null && id !== undefined);

  const parcellesGpsRows = membreIds.length
    ? await db
        .select({
          membreId:         parcellesTable.membreId,
          coordonneesPoint: parcellesTable.coordonneesPoint,
          polygone:         parcellesTable.polygone,
        })
        .from(parcellesTable)
        .where(and(inArray(parcellesTable.membreId, membreIds), eq(parcellesTable.actif, true)))
    : [];

  const membresAvecGps = new Set<number>();
  for (const p of parcellesGpsRows) {
    if (!p.membreId) continue;
    const hasPoint   = !!(p.coordonneesPoint);
    const hasPolygon = !!(p.polygone && (p.polygone as unknown[]).length > 0);
    if (hasPoint || hasPolygon) membresAvecGps.add(p.membreId);
  }

  const avecParcelle = exp.lots.filter(l => l.membreId !== null && l.membreId !== undefined && membresAvecGps.has(l.membreId!)).length;

  return {
    numeroExpedition: exp.numeroExpedition,
    nbProducteurs:    exp.lots.length,
    poidsKg:          poidsTotal,
    lots:             exp.lots,
    parcellesGps:     { total: exp.lots.length, renseignees: avecParcelle },
    certifications:   { total: exp.lots.length, renseignees: avecCertificat },
    conformite:       avecParcelle === exp.lots.length && avecCertificat === exp.lots.length,
  };
}
