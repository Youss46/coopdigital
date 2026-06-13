import { db, expeditionsTable, expeditionLotsTable, expeditionHistoriqueTable, campagnesTable, membresTable, livraisonsTable, exportateursTable } from "@workspace/db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { proposerEcriture } from "./comptabiliteService";
import { logger } from "../lib/logger";

// ── Numérotation automatique EXP-AAAA-XXXX ──────────────────────────────────

export async function genererNumeroExpedition(cooperativeId: number): Promise<string> {
  const annee = new Date().getFullYear();
  const prefixe = `EXP-${annee}-`;
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
    const num = parseInt(last.split("-")[2] ?? "0", 10);
    suivant = num + 1;
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
      membreId:        expeditionLotsTable.membreId,
      livraisonId:     expeditionLotsTable.livraisonId,
      poidsKg:         expeditionLotsTable.poidsKg,
      nombreSacs:      expeditionLotsTable.nombreSacs,
      certificatEudr:  expeditionLotsTable.certificatEudr,
      parcelleOrigine: expeditionLotsTable.parcelleOrigine,
      membreNom:       membresTable.nom,
      membrePrenoms:   membresTable.prenoms,
    })
    .from(expeditionLotsTable)
    .leftJoin(membresTable, eq(membresTable.id, expeditionLotsTable.membreId))
    .where(eq(expeditionLotsTable.expeditionId, expeditionId));

  const historique = await db
    .select()
    .from(expeditionHistoriqueTable)
    .where(eq(expeditionHistoriqueTable.expeditionId, expeditionId))
    .orderBy(desc(expeditionHistoriqueTable.dateChangement));

  return { ...exp, lots, historique };
}

// ── Création ────────────────────────────────────────────────────────────────

export interface CreateExpeditionInput {
  campagneId?: number;
  exerciceId?: number;
  typeVehicule: "propre" | "location";
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
  const numero = await genererNumeroExpedition(cooperativeId);

  const [exp] = await db.insert(expeditionsTable).values({
    cooperativeId,
    numeroExpedition:   numero,
    campagneId:         input.campagneId ?? null,
    exerciceId:         input.exerciceId ?? null,
    typeVehicule:       input.typeVehicule,
    immatriculation:    input.immatriculation ?? null,
    nomChauffeur:       input.nomChauffeur ?? null,
    telephoneChauffeur: input.telephoneChauffeur ?? null,
    transporteur:       input.transporteur ?? null,
    numeroBonTransport: input.numeroBonTransport ?? null,
    dateDepart:         input.dateDepart ? new Date(input.dateDepart).toISOString() : null,
    lieuDepart:         input.lieuDepart ?? "Magasin central",
    poidsChargeKg:      input.poidsChargeKg ? String(input.poidsChargeKg) : null,
    nombreSacs:         input.nombreSacs ?? null,
    numeroLots:         input.numeroLots ?? null,
    port:               input.port,
    entrepotDestination: input.entrepotDestination ?? null,
    exportateurId:      input.exportateurId ?? null,
    exportateurNom:     input.exportateurNom ?? null,
    numeroContratExport: input.numeroContratExport ?? null,
    heureEstimeeArrivee: input.heureEstimeeArrivee ? new Date(input.heureEstimeeArrivee).toISOString() : null,
    documents:          input.documents ?? [],
    statut:             "en_preparation",
    creePar:            userId,
  }).returning();

  if (!exp) throw new Error("Échec création expédition");

  if (input.lots && input.lots.length > 0) {
    await db.insert(expeditionLotsTable).values(
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

  await db.insert(expeditionHistoriqueTable).values({
    expeditionId:   exp.id,
    statutPrecedent: null,
    statutNouveau:  "en_preparation",
    faitPar:        userId,
    notes:          "Expédition créée",
  });

  return exp;
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
    updatedAt: new Date().toISOString(),
  };

  if (nouveauStatut === "en_transit") {
    updateValues.dateDepart = updateValues.dateDepart ?? new Date().toISOString();
  }
  if (nouveauStatut === "arrive_port") {
    updateValues.dateArriveePort = new Date().toISOString();
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

  // Écriture comptable au chargement (en_preparation → charge)
  if (nouveauStatut === "charge" && exp.poidsChargeKg) {
    const dateStr = new Date().toISOString().split("T")[0]!;
    const montant = Math.round(parseFloat(String(exp.poidsChargeKg)) * 500);
    try {
      await proposerEcriture(cooperativeId, {
        source:    "stock",
        sourceId:  expeditionId,
        libelle:   `Départ ${exp.numeroExpedition} vers Port ${exp.port}`,
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
    numeroRecepissePort: string;
    nomReceptionnaire: string;
    dateArriveePort?: string;
    motifEcart?: string;
    fraisTransportFcfa?: number;
    exportateurId?: number;
  }
) {
  const rows = await db
    .select()
    .from(expeditionsTable)
    .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Expédition introuvable");
  const exp = rows[0]!;

  if (!["arrive_port", "en_transit"].includes(exp.statut)) {
    throw new Error("L'expédition doit être en transit ou arrivée au port pour confirmer la réception");
  }

  const poidsCharge = parseFloat(String(exp.poidsChargeKg ?? "0"));
  const poidsRecu   = input.poidsRecuPortKg;
  const ecart       = poidsCharge - poidsRecu;
  const tauxEcart   = poidsCharge > 0 ? Math.abs(ecart) / poidsCharge : 0;

  const nouveauStatut: "receptionne" | "litige" = tauxEcart > SEUIL_LITIGE ? "litige" : "receptionne";
  const provisionLitige = nouveauStatut === "litige";

  await db.update(expeditionsTable).set({
    statut:             nouveauStatut,
    poidsRecuPortKg:    String(poidsRecu),
    ecartPoidsKg:       String(ecart),
    motifEcart:         (input.motifEcart as typeof expeditionsTable.$inferSelect["motifEcart"]) ?? null,
    numeroRecepissePort: input.numeroRecepissePort,
    nomReceptionnaire:  input.nomReceptionnaire,
    dateArriveePort:    input.dateArriveePort ? new Date(input.dateArriveePort).toISOString() : new Date().toISOString(),
    statutReception:    nouveauStatut === "receptionne" ? "accepte" : "litige",
    provisionLitige,
    updatedAt:          new Date().toISOString(),
  }).where(eq(expeditionsTable.id, expeditionId));

  await db.insert(expeditionHistoriqueTable).values({
    expeditionId,
    statutPrecedent: exp.statut,
    statutNouveau:   nouveauStatut,
    faitPar:         userId,
    notes:           `Réception port. Poids reçu: ${poidsRecu} kg. Écart: ${ecart.toFixed(2)} kg (${(tauxEcart * 100).toFixed(2)}%)`,
  });

  const dateStr = new Date().toISOString().split("T")[0]!;
  const montantStockTransit = Math.round(poidsCharge * 500);
  const montantVente        = Math.round(poidsRecu * 600);

  if (nouveauStatut === "receptionne") {
    try {
      const exportateurId = input.exportateurId ?? exp.exportateurId;
      const libExport = exp.exportateurNom ? `Client ${exp.exportateurNom}` : "Client exportateur";
      await proposerEcriture(cooperativeId, {
        source:      "vente",
        sourceId:    expeditionId,
        libelle:     `Réception ${exp.numeroExpedition} — Port ${exp.port}`,
        compteDebit:  "4111",
        compteCredit: "701",
        montantFcfa:  montantVente,
        date:         dateStr,
        numeroPiece:  exp.numeroExpedition,
      });
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

    if (input.fraisTransportFcfa && input.fraisTransportFcfa > 0) {
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
    const montantEcart = Math.round(Math.abs(ecart) * 500);
    try {
      await proposerEcriture(cooperativeId, {
        source:      "stock",
        sourceId:    expeditionId,
        libelle:     `Écart litige ${exp.numeroExpedition} — ${ecart.toFixed(1)} kg`,
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
  }

  return {
    statut:         nouveauStatut,
    ecartKg:        ecart,
    tauxEcartPct:   tauxEcart * 100,
    provisionLitige,
    niveauAlerte:
      tauxEcart <= SEUIL_ACCEPTABLE  ? "acceptable" :
      tauxEcart <= SEUIL_LITIGE      ? "a_justifier" : "litige",
  };
}

// ── Rapport EUDR ─────────────────────────────────────────────────────────────

export async function getRapportEudr(cooperativeId: number, expeditionId: number) {
  const exp = await getExpedition(cooperativeId, expeditionId);
  if (!exp) throw new Error("Expédition introuvable");

  const poidsTotal = exp.lots.reduce((s, l) => s + parseFloat(String(l.poidsKg ?? "0")), 0);
  const avecParcelle  = exp.lots.filter(l => l.parcelleOrigine).length;
  const avecCertificat = exp.lots.filter(l => l.certificatEudr).length;

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
