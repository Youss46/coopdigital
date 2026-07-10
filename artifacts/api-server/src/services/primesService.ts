import { db, primesReceptionsTable, primesDistributionsTable, primesMembresTable, membresTable, livraisonsTable, avancesTable, campagnesTable, exportateursTable, usersTable } from "@workspace/db";
// Note: campagnesTable.cooperativeId and exportateursTable.cooperativeId are validated in creerDistribution and createReception
import { eq, and, desc, sql, sum, inArray, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { generateEcrituresPrimeReception, generateEcrituresPrimePaiement } from "./comptabiliteService";
import { verifierCaisseCentrale, debiterCaissePourPrimeMembre, verifierCompteMobilePourPrime, debiterCompteMobilePourPrime } from "./caisseService";

/** Modes qui déclenchent un débit de la caisse centrale physique. */
const MODES_ESPECES = new Set(["especes", "espèces", "caisse"]);

/** Modes qui déclenchent un débit du compte Mobile Marchand correspondant. */
const MODES_MOBILE_MARCHAND = new Set(["orange_money", "mtn_momo", "wave"]);

// ── Labels ────────────────────────────────────────────────────────────────────

export const TYPE_PRIME_LABELS: Record<string, string> = {
  certification_ra:        "Rainforest Alliance",
  certification_fairtrade: "Fairtrade",
  certification_bio:       "Agriculture Bio",
  qualite:                 "Prime de qualité",
  fidelite:                "Prime de fidélité",
  ristourne:               "Ristourne fin de campagne",
};

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateReceptionInput {
  campagneId?: number | null;
  typePrime: string;
  exportateurId?: number | null;
  montantTotalFcfa: number;
  dateReception: string;
  tonnageReferenceKg?: number | null;
  notes?: string | null;
}

export interface CreateDistributionInput {
  campagneId?: number | null;
  primeReceptionId: number;
  dateDistribution: string;
  montantFraisFcfa?: number;
  inclureDeductionAvances?: boolean;
  notes?: string | null;
}

export interface PayerMembreInput {
  modePaiement: string;
  datePaiement: string;
  referencePaiement?: string | null;
  notes?: string | null;
}

// ── Réceptions ────────────────────────────────────────────────────────────────

export async function listReceptions(cooperativeId: number, campagneId?: number) {
  const where = campagneId
    ? and(eq(primesReceptionsTable.cooperativeId, cooperativeId), eq(primesReceptionsTable.campagneId, campagneId))
    : eq(primesReceptionsTable.cooperativeId, cooperativeId);

  const rows = await db
    .select({
      r: primesReceptionsTable,
      exportateurNom: exportateursTable.nom,
      campagneLibelle: campagnesTable.libelle,
    })
    .from(primesReceptionsTable)
    .leftJoin(exportateursTable, eq(exportateursTable.id, primesReceptionsTable.exportateurId))
    .leftJoin(campagnesTable, eq(campagnesTable.id, primesReceptionsTable.campagneId))
    .where(where)
    .orderBy(desc(primesReceptionsTable.createdAt));

  return rows.map(({ r, exportateurNom, campagneLibelle }) => ({
    ...r,
    exportateurNom,
    campagneLibelle,
    typePrimeLabel: TYPE_PRIME_LABELS[r.typePrime] ?? r.typePrime,
  }));
}

export async function createReception(cooperativeId: number, data: CreateReceptionInput, userId: number) {
  // Nom de l'exportateur pour le libellé de l'écriture
  let exportateurNom: string | null = null;
  if (data.exportateurId) {
    const [exp] = await db
      .select({ nom: exportateursTable.nom })
      .from(exportateursTable)
      .where(and(eq(exportateursTable.id, data.exportateurId), eq(exportateursTable.cooperativeId, cooperativeId)))
      .limit(1);
    exportateurNom = exp?.nom ?? null;
  }

  const [rec] = await db.insert(primesReceptionsTable).values({
    cooperativeId,
    campagneId: data.campagneId ?? null,
    typePrime: data.typePrime as "certification_ra" | "certification_fairtrade" | "certification_bio" | "qualite" | "fidelite" | "ristourne",
    exportateurId: data.exportateurId ?? null,
    montantTotalFcfa: data.montantTotalFcfa,
    dateReception: data.dateReception,
    tonnageReferenceKg: data.tonnageReferenceKg ? String(data.tonnageReferenceKg) : null,
    statut: "en_attente",
    notes: data.notes ?? null,
    createdBy: userId,
  }).returning();

  // Écriture OHADA : Débit 521 Banque / Crédit 7588 Autres produits (fire-and-forget)
  generateEcrituresPrimeReception(cooperativeId, {
    receptionId: rec.id,
    montantFcfa: rec.montantTotalFcfa,
    typePrimeLabel: TYPE_PRIME_LABELS[rec.typePrime] ?? rec.typePrime,
    exportateurNom,
    date: rec.dateReception,
  }).catch(err => logger.error({ err }, "Erreur écriture prime réception"));

  return rec;
}

export async function getReception(cooperativeId: number, id: number) {
  const [row] = await db
    .select({
      r: primesReceptionsTable,
      exportateurNom: exportateursTable.nom,
      campagneLibelle: campagnesTable.libelle,
    })
    .from(primesReceptionsTable)
    .leftJoin(exportateursTable, eq(exportateursTable.id, primesReceptionsTable.exportateurId))
    .leftJoin(campagnesTable, eq(campagnesTable.id, primesReceptionsTable.campagneId))
    .where(and(eq(primesReceptionsTable.id, id), eq(primesReceptionsTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!row) return null;
  return { ...row.r, exportateurNom: row.exportateurNom, campagneLibelle: row.campagneLibelle };
}

// ── Distributions ─────────────────────────────────────────────────────────────

export async function listDistributions(cooperativeId: number, campagneId?: number) {
  const where = campagneId
    ? and(eq(primesDistributionsTable.cooperativeId, cooperativeId), eq(primesDistributionsTable.campagneId, campagneId))
    : eq(primesDistributionsTable.cooperativeId, cooperativeId);

  const rows = await db
    .select({
      d: primesDistributionsTable,
      typePrime: primesReceptionsTable.typePrime,
      exportateurNom: exportateursTable.nom,
      campagneLibelle: campagnesTable.libelle,
      validePar: usersTable.nom,
    })
    .from(primesDistributionsTable)
    .innerJoin(primesReceptionsTable, eq(primesReceptionsTable.id, primesDistributionsTable.primeReceptionId))
    .leftJoin(exportateursTable, eq(exportateursTable.id, primesReceptionsTable.exportateurId))
    .leftJoin(campagnesTable, eq(campagnesTable.id, primesDistributionsTable.campagneId))
    .leftJoin(usersTable, eq(usersTable.id, primesDistributionsTable.validePar))
    .where(where)
    .orderBy(desc(primesDistributionsTable.createdAt));

  // Compte membres par distribution
  const distIds = rows.map(r => r.d.id);
  const membresCounts = distIds.length > 0
    ? await db.select({
        distributionId: primesMembresTable.distributionId,
        nbMembres: sql<number>`count(*)::int`,
        nbPayes: sql<number>`count(*) filter (where ${primesMembresTable.statut} = 'paye')::int`,
      })
      .from(primesMembresTable)
      .where(inArray(primesMembresTable.distributionId, distIds))
      .groupBy(primesMembresTable.distributionId)
    : [];

  const countMap = new Map(membresCounts.map(c => [c.distributionId, c]));

  return rows.map(({ d, typePrime, exportateurNom, campagneLibelle, validePar }) => ({
    ...d,
    typePrime,
    typePrimeLabel: TYPE_PRIME_LABELS[typePrime] ?? typePrime,
    exportateurNom,
    campagneLibelle,
    valideParNom: validePar,
    nbMembres: countMap.get(d.id)?.nbMembres ?? 0,
    nbPayes: countMap.get(d.id)?.nbPayes ?? 0,
  }));
}

export async function creerDistribution(cooperativeId: number, data: CreateDistributionInput, userId: number) {
  // 1. Vérifier la réception (scoping coopérative implicite via getReception)
  const reception = await getReception(cooperativeId, data.primeReceptionId);
  if (!reception) throw new Error("Réception introuvable");
  if (reception.statut === "distribuee") throw new Error("Cette prime a déjà été distribuée");

  const campagneId = data.campagneId ?? reception.campagneId;
  if (!campagneId) throw new Error("Campagne requise pour calculer la distribution");

  // Valider l'appartenance de la campagne à la coopérative
  const [campagneCheck] = await db
    .select({ id: campagnesTable.id })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!campagneCheck) throw new Error("Campagne introuvable ou hors périmètre");

  // Valider l'appartenance de l'exportateur si fourni
  if (reception.exportateurId) {
    const [expCheck] = await db
      .select({ id: exportateursTable.id })
      .from(exportateursTable)
      .where(and(eq(exportateursTable.id, reception.exportateurId), eq(exportateursTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!expCheck) throw new Error("Exportateur introuvable ou hors périmètre");
  }

  // 2. Calculer tonnage par membre (livraisons de la campagne)
  const livraisons = await db
    .select({
      membreId: livraisonsTable.membreId,
      totalKg: sum(livraisonsTable.poidsKg),
    })
    .from(livraisonsTable)
    .where(
      and(
        eq(livraisonsTable.campagneId, campagneId),
        // Exclure les livraisons de fournisseurs externes (membreId null)
        sql`${livraisonsTable.membreId} IS NOT NULL`,
        // Joindre coopérative via membres
        sql`${livraisonsTable.membreId} IN (
          SELECT id FROM membres WHERE cooperative_id = ${cooperativeId}
        )`,
      )
    )
    .groupBy(livraisonsTable.membreId);

  if (livraisons.length === 0) throw new Error("Aucune livraison trouvée pour cette campagne");

  const tonnageTotalKg = livraisons.reduce((acc, l) => acc + parseFloat(String(l.totalKg ?? 0)), 0);
  if (tonnageTotalKg === 0) throw new Error("Tonnage total nul");

  const montantFrais  = data.montantFraisFcfa ?? 0;
  const montantDistrib = reception.montantTotalFcfa - montantFrais;
  if (montantDistrib <= 0) throw new Error("Montant distribuable nul après déduction des frais");

  // 3. Avances impayées par membre si demandé
  const avancesMap = new Map<number, number>();
  if (data.inclureDeductionAvances) {
    const membreIds = livraisons.map(l => l.membreId!).filter(Boolean) as number[];
    const avancesEnCours = await db
      .select({
        membreId: avancesTable.membreId,
        solde: sum(avancesTable.soldeRestantFcfa),
      })
      .from(avancesTable)
      .where(
        and(
          inArray(avancesTable.membreId, membreIds),
          sql`${avancesTable.statut} IN ('en_cours', 'en_retard')`,
          sql`${avancesTable.soldeRestantFcfa} > 0`,
        )
      )
      .groupBy(avancesTable.membreId);
    for (const a of avancesEnCours) {
      if (a.membreId) avancesMap.set(a.membreId, parseInt(String(a.solde ?? 0)));
    }
  }

  return await db.transaction(async (tx) => {
    // 4. Créer la distribution
    const [dist] = await tx.insert(primesDistributionsTable).values({
      cooperativeId,
      campagneId,
      primeReceptionId: data.primeReceptionId,
      dateDistribution: data.dateDistribution,
      tonnageTotalKg: String(tonnageTotalKg),
      montantBrutFcfa: reception.montantTotalFcfa,
      montantFraisFcfa: montantFrais,
      montantDistribueFcfa: montantDistrib,
      statut: "brouillon",
      notes: data.notes ?? null,
      createdBy: userId,
    }).returning();

    // 5. Créer les allocations par membre
    const livraisionsFiltrees = livraisons.filter(l => l.membreId !== null);
    const allocations = livraisionsFiltrees.map(l => {
        const tonnage = parseFloat(String(l.totalKg ?? 0));
        const pct = tonnageTotalKg > 0 ? tonnage / tonnageTotalKg : 0;
        // montantBrut = part proportionnelle du montant APRÈS déduction globale des frais
        // (les frais ont déjà été soustraits de montantDistrib)
        const montantBrut = Math.round(montantDistrib * pct);
        const deductionAvances = Math.min(avancesMap.get(l.membreId!) ?? 0, montantBrut);
        // deductionFraisFcfa = 0 par membre : les frais sont gérés globalement
        const montantNet = Math.max(0, montantBrut - deductionAvances);
        return {
          cooperativeId,
          distributionId: dist.id,
          membreId: l.membreId!,
          tonnageKg: String(tonnage),
          montantBrutFcfa: montantBrut,
          deductionAvancesFcfa: deductionAvances,
          deductionFraisFcfa: 0,
          montantNetFcfa: montantNet,
          statut: "en_attente" as const,
        };
      });

    // Fix arrondi : affecter le résidu (quelques FCFA) au membre avec le plus grand tonnage
    if (allocations.length > 0) {
      const totalAlloue = allocations.reduce((s, a) => s + a.montantBrutFcfa, 0);
      const residuel = montantDistrib - totalAlloue;
      if (residuel !== 0) {
        const idxMax = allocations.reduce(
          (maxI, a, i, arr) => parseFloat(a.tonnageKg) > parseFloat(arr[maxI].tonnageKg) ? i : maxI,
          0,
        );
        const a = allocations[idxMax];
        a.montantBrutFcfa += residuel;
        // Re-cap la déduction d'avances au nouveau montant brut (évite over-repayment si résidu négatif)
        a.deductionAvancesFcfa = Math.min(a.deductionAvancesFcfa, Math.max(0, a.montantBrutFcfa));
        a.montantNetFcfa = Math.max(0, a.montantBrutFcfa - a.deductionAvancesFcfa);
      }
    }

    if (allocations.length > 0) {
      await tx.insert(primesMembresTable).values(allocations);
    }

    // 6. Marquer la réception comme distribuée
    await tx.update(primesReceptionsTable)
      .set({ statut: "distribuee", updatedAt: new Date() })
      .where(eq(primesReceptionsTable.id, data.primeReceptionId));

    return dist;
  });
}

export async function getDistribution(cooperativeId: number, id: number) {
  const [distRow] = await db
    .select({
      d: primesDistributionsTable,
      typePrime: primesReceptionsTable.typePrime,
      montantTotalReception: primesReceptionsTable.montantTotalFcfa,
      exportateurNom: exportateursTable.nom,
      campagneLibelle: campagnesTable.libelle,
      valideParNom: usersTable.nom,
    })
    .from(primesDistributionsTable)
    .innerJoin(primesReceptionsTable, eq(primesReceptionsTable.id, primesDistributionsTable.primeReceptionId))
    .leftJoin(exportateursTable, eq(exportateursTable.id, primesReceptionsTable.exportateurId))
    .leftJoin(campagnesTable, eq(campagnesTable.id, primesDistributionsTable.campagneId))
    .leftJoin(usersTable, eq(usersTable.id, primesDistributionsTable.validePar))
    .where(and(eq(primesDistributionsTable.id, id), eq(primesDistributionsTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!distRow) return null;

  const membres = await db
    .select({
      pm: primesMembresTable,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      membreCodeMembre: membresTable.numeroMembre,
      membreTelephone: membresTable.telephone,
      payeParNom: usersTable.nom,
    })
    .from(primesMembresTable)
    .innerJoin(membresTable, eq(membresTable.id, primesMembresTable.membreId))
    .leftJoin(usersTable, eq(usersTable.id, primesMembresTable.payePar))
    .where(eq(primesMembresTable.distributionId, id))
    .orderBy(desc(primesMembresTable.montantNetFcfa));

  return {
    ...distRow.d,
    typePrime: distRow.typePrime,
    typePrimeLabel: TYPE_PRIME_LABELS[distRow.typePrime] ?? distRow.typePrime,
    montantTotalReception: distRow.montantTotalReception,
    exportateurNom: distRow.exportateurNom,
    campagneLibelle: distRow.campagneLibelle,
    valideParNom: distRow.valideParNom,
    membres: membres.map(({ pm, membreNom, membrePrenoms, membreCodeMembre, membreTelephone, payeParNom }) => ({
      ...pm,
      membreNom,
      membrePrenoms,
      membreCodeMembre,
      membreTelephone,
      payeParNom,
    })),
  };
}

export async function validerDistribution(cooperativeId: number, id: number, userId: number) {
  const [dist] = await db
    .select()
    .from(primesDistributionsTable)
    .where(and(eq(primesDistributionsTable.id, id), eq(primesDistributionsTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!dist) throw new Error("Distribution introuvable");
  if (dist.statut !== "brouillon") throw new Error("Seule une distribution en brouillon peut être validée");

  const [updated] = await db
    .update(primesDistributionsTable)
    .set({ statut: "validee", validePar: userId, valideLe: new Date(), updatedAt: new Date() })
    .where(eq(primesDistributionsTable.id, id))
    .returning();
  return updated;
}

export async function payerMembre(cooperativeId: number, primeMembreId: number, data: PayerMembreInput, userId: number) {
  const [[pm], [membreRow]] = await Promise.all([
    db.select()
      .from(primesMembresTable)
      .where(and(eq(primesMembresTable.id, primeMembreId), eq(primesMembresTable.cooperativeId, cooperativeId)))
      .limit(1),
    // Pré-chargé après la vérification pm, mais on fait les deux en parallèle
    // (sera ignoré si pm est null)
    db.select({ id: primesMembresTable.id, membreId: primesMembresTable.membreId })
      .from(primesMembresTable)
      .where(eq(primesMembresTable.id, primeMembreId))
      .limit(1),
  ]);
  if (!pm) throw new Error("Allocation introuvable");
  if (pm.statut === "paye") throw new Error("Déjà payé");

  // Vérifier que la distribution est validée
  const [[dist], [membre]] = await Promise.all([
    db.select({ statut: primesDistributionsTable.statut })
      .from(primesDistributionsTable)
      .where(eq(primesDistributionsTable.id, pm.distributionId))
      .limit(1),
    db.select({ nom: membresTable.nom })
      .from(membresTable)
      .where(eq(membresTable.id, pm.membreId))
      .limit(1),
  ]);
  if (!dist || dist.statut === "brouillon") throw new Error("La distribution doit être validée avant paiement");

  const modeNorm       = data.modePaiement.toLowerCase();
  const modeEstEspeces = MODES_ESPECES.has(modeNorm);
  const modeEstMobile  = MODES_MOBILE_MARCHAND.has(modeNorm);

  // ── 1. Guards AVANT toute modification ────────────────────────────────────
  // Lève une exception immédiate si le compte/la caisse est absent(e) ou
  // le solde insuffisant — le membre reste 'en_attente', aucune incohérence.
  if (pm.montantNetFcfa > 0) {
    if (modeEstEspeces) await verifierCaisseCentrale(cooperativeId, pm.montantNetFcfa);
    if (modeEstMobile)  await verifierCompteMobilePourPrime(cooperativeId, modeNorm, pm.montantNetFcfa);
  }

  // ── 2. Débits AVANT le changement de statut ───────────────────────────────
  if (pm.montantNetFcfa > 0) {
    if (modeEstEspeces) {
      const { alerte } = await debiterCaissePourPrimeMembre(userId, cooperativeId, pm.montantNetFcfa, pm.id);
      if (alerte) logger.warn({ primeMembreId: pm.id, alerte }, "Alerte caisse après paiement prime");
    }
    if (modeEstMobile) {
      const { alerte } = await debiterCompteMobilePourPrime(cooperativeId, modeNorm, pm.montantNetFcfa, pm.id, userId);
      if (alerte) logger.warn({ primeMembreId: pm.id, alerte }, "Alerte compte mobile après paiement prime");
    }
  }

  // ── 3. Marquer le membre comme payé ───────────────────────────────────────
  const [updated] = await db
    .update(primesMembresTable)
    .set({
      statut: "paye",
      modePaiement: data.modePaiement,
      datePaiement: data.datePaiement,
      referencePaiement: data.referencePaiement ?? null,
      notes: data.notes ?? null,
      payePar: userId,
      updatedAt: new Date(),
    })
    .where(eq(primesMembresTable.id, primeMembreId))
    .returning();

  // ── 4. Réduire les avances (après paiement effectif) ──────────────────────
  if (pm.deductionAvancesFcfa > 0) {
    await reduireAvances(pm.membreId, pm.deductionAvancesFcfa);
  }

  // ── 5. Écriture OHADA : Débit 6018 / Crédit 554/571/521 (fire-and-forget) ─
  if (pm.montantNetFcfa > 0) {
    generateEcrituresPrimePaiement(cooperativeId, {
      primeMembreId: pm.id,
      membreNom: membre?.nom ?? `Membre #${pm.membreId}`,
      montantFcfa: pm.montantNetFcfa,
      modePaiement: data.modePaiement,
      date: data.datePaiement,
    }).catch(err => logger.error({ err }, "Erreur écriture prime paiement"));
  }

  // Si tous les membres sont payés → distribution = payee
  await syncStatutDistribution(pm.distributionId);
  return updated;
}

export async function payerBulk(
  cooperativeId: number,
  distributionId: number,
  data: { modePaiement: string; datePaiement: string },
  userId: number,
) {
  const [dist] = await db
    .select()
    .from(primesDistributionsTable)
    .where(and(eq(primesDistributionsTable.id, distributionId), eq(primesDistributionsTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!dist) throw new Error("Distribution introuvable");
  if (dist.statut === "brouillon") throw new Error("Veuillez d'abord valider la distribution");

  // Récupérer les membres non encore payés AVANT le bulk update (pour les effets de bord)
  const membresEnAttente = await db
    .select({
      pm: primesMembresTable,
      membreNom: membresTable.nom,
    })
    .from(primesMembresTable)
    .innerJoin(membresTable, eq(membresTable.id, primesMembresTable.membreId))
    .where(and(
      eq(primesMembresTable.distributionId, distributionId),
      eq(primesMembresTable.statut, "en_attente"),
    ));

  // Guards AVANT toute modification — vérifie compte + solde sur le total global
  const modeNormBulk   = data.modePaiement.toLowerCase();
  const modeEstEspeces = MODES_ESPECES.has(modeNormBulk);
  const modeEstMobile  = MODES_MOBILE_MARCHAND.has(modeNormBulk);
  const totalNet = membresEnAttente.reduce((s, { pm }) => s + pm.montantNetFcfa, 0);
  if (totalNet > 0) {
    if (modeEstEspeces) await verifierCaisseCentrale(cooperativeId, totalNet);
    if (modeEstMobile)  await verifierCompteMobilePourPrime(cooperativeId, modeNormBulk, totalNet);
  }

  // Paiement en masse
  await db
    .update(primesMembresTable)
    .set({
      statut: "paye",
      modePaiement: data.modePaiement,
      datePaiement: data.datePaiement,
      payePar: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(primesMembresTable.distributionId, distributionId),
        eq(primesMembresTable.statut, "en_attente"),
      )
    );

  // ── Effets financiers : séquentiels et awaités ────────────────────────────
  // Avances + débit caisse : opérations financières → awaited, erreur loguée.
  // Écritures OHADA : fire-and-forget (comptabilité non bloquante).
  for (const { pm, membreNom } of membresEnAttente) {
    // 1. Réduire les avances
    if (pm.deductionAvancesFcfa > 0) {
      await reduireAvances(pm.membreId, pm.deductionAvancesFcfa).catch(err =>
        logger.error({ err, primeMembreId: pm.id }, "Erreur réduction avance bulk"),
      );
    }

    if (pm.montantNetFcfa > 0) {
      // 2. Débit caisse (espèces uniquement) — la vérification totale a déjà eu lieu
      if (modeEstEspeces) {
        await debiterCaissePourPrimeMembre(userId, cooperativeId, pm.montantNetFcfa, pm.id)
          .then(({ alerte }) => {
            if (alerte) logger.warn({ primeMembreId: pm.id, alerte }, "Alerte caisse bulk");
          })
          .catch(err =>
            logger.error({ err, primeMembreId: pm.id }, "Erreur débit caisse bulk"),
          );
      }

      // 2b. Débit compte Mobile Marchand
      if (modeEstMobile) {
        await debiterCompteMobilePourPrime(cooperativeId, modeNormBulk, pm.montantNetFcfa, pm.id, userId)
          .then(({ alerte }) => {
            if (alerte) logger.warn({ primeMembreId: pm.id, alerte }, "Alerte compte mobile bulk");
          })
          .catch(err =>
            logger.error({ err, primeMembreId: pm.id }, "Erreur débit mobile bulk"),
          );
      }

      // 3. Écriture OHADA (fire-and-forget)
      generateEcrituresPrimePaiement(cooperativeId, {
        primeMembreId: pm.id,
        membreNom: membreNom ?? `Membre #${pm.membreId}`,
        montantFcfa: pm.montantNetFcfa,
        modePaiement: data.modePaiement,
        date: data.datePaiement,
      }).catch(err => logger.error({ err, primeMembreId: pm.id }, "Erreur écriture prime bulk"));
    }
  }

  await syncStatutDistribution(distributionId);
}

/**
 * Réduit le solde restant des avances actives d'un membre, en commençant par les plus anciennes.
 * Appelé lors du paiement effectif pour refléter la déduction déjà calculée à la création
 * de la distribution.
 */
async function reduireAvances(membreId: number, montantDeduction: number) {
  if (montantDeduction <= 0) return;

  const avancesActives = await db
    .select({ id: avancesTable.id, solde: avancesTable.soldeRestantFcfa })
    .from(avancesTable)
    .where(and(
      eq(avancesTable.membreId, membreId),
      sql`${avancesTable.statut} IN ('en_cours', 'en_retard')`,
      lt(sql`0`, avancesTable.soldeRestantFcfa),
    ))
    .orderBy(avancesTable.id); // plus ancienne d'abord

  let restant = montantDeduction;
  for (const avance of avancesActives) {
    if (restant <= 0) break;
    const solde = avance.solde ?? 0;
    const reduction = Math.min(solde, restant);
    const nouveauSolde = solde - reduction;
    await db
      .update(avancesTable)
      .set({
        soldeRestantFcfa: nouveauSolde,
        ...(nouveauSolde <= 0 ? { statut: "rembourse" as const } : {}),
      })
      .where(eq(avancesTable.id, avance.id));
    restant -= reduction;
  }
}

async function syncStatutDistribution(distributionId: number) {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      payes: sql<number>`count(*) filter (where ${primesMembresTable.statut} = 'paye')::int`,
    })
    .from(primesMembresTable)
    .where(eq(primesMembresTable.distributionId, distributionId));

  if (counts && counts.total > 0 && counts.total === counts.payes) {
    await db
      .update(primesDistributionsTable)
      .set({ statut: "payee", updatedAt: new Date() })
      .where(eq(primesDistributionsTable.id, distributionId));
  }
}

export async function statsGlobales(cooperativeId: number) {
  const [receptions] = await db
    .select({
      total: sql<number>`count(*)::int`,
      montantTotal: sql<number>`coalesce(sum(montant_total_fcfa), 0)::int`,
      enAttente: sql<number>`count(*) filter (where statut = 'en_attente')::int`,
    })
    .from(primesReceptionsTable)
    .where(eq(primesReceptionsTable.cooperativeId, cooperativeId));

  const [distributions] = await db
    .select({
      total: sql<number>`count(*)::int`,
      brouillon: sql<number>`count(*) filter (where statut = 'brouillon')::int`,
      validees: sql<number>`count(*) filter (where statut = 'validee')::int`,
      payees: sql<number>`count(*) filter (where statut = 'payee')::int`,
    })
    .from(primesDistributionsTable)
    .where(eq(primesDistributionsTable.cooperativeId, cooperativeId));

  const [membres] = await db
    .select({
      total: sql<number>`count(*)::int`,
      payes: sql<number>`count(*) filter (where ${primesMembresTable.statut} = 'paye')::int`,
      montantDistribue: sql<number>`coalesce(sum(${primesMembresTable.montantNetFcfa}), 0)::int`,
      montantPaye: sql<number>`coalesce(sum(${primesMembresTable.montantNetFcfa}) filter (where ${primesMembresTable.statut} = 'paye'), 0)::int`,
    })
    .from(primesMembresTable)
    .where(eq(primesMembresTable.cooperativeId, cooperativeId));

  return { receptions, distributions, membres };
}

export { logger };
