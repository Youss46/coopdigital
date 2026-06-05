import { db } from "@workspace/db";
import {
  equipementsTable, categoriesEquipementsTable,
  dotationsAmortissementTable, maintenancesEquipementTable,
  Equipement,
} from "@workspace/db";
import { eq, and, lte, lt, isNotNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ─── Amortissement ────────────────────────────────────────────────────────────

export function calculerDotationMensuelle(equipement: {
  valeur_acquisition_fcfa: string | null;
  valeur_residuelle_fcfa: string | null;
  valeur_nette_comptable_fcfa: string | null;
  duree_amortissement_ans: number;
  methode_amortissement: string;
}): number {
  const base =
    toNum(equipement.valeur_acquisition_fcfa) -
    toNum(equipement.valeur_residuelle_fcfa);
  const duree = equipement.duree_amortissement_ans || 1;

  if (equipement.methode_amortissement === "degressif") {
    const tauxDegressif = (1 / duree) * 2;
    const vnc = toNum(equipement.valeur_nette_comptable_fcfa);
    const dotAnnuelle = vnc * tauxDegressif;
    return Math.round(dotAnnuelle / 12);
  }

  // linéaire (défaut)
  return Math.round(base / duree / 12);
}

export function genererTableauAmortissement(equipement: {
  id: number;
  valeur_acquisition_fcfa: string | null;
  valeur_residuelle_fcfa: string | null;
  valeur_nette_comptable_fcfa: string | null;
  cumul_amortissement_fcfa: string | null;
  duree_amortissement_ans: number;
  methode_amortissement: string;
  date_mise_service: string | null;
  date_acquisition: string;
}): Array<{
  periode: string; exercice: number; mois: number;
  dotation_fcfa: number; cumul_fcfa: number; vnc_fcfa: number;
}> {
  const valBrute = toNum(equipement.valeur_acquisition_fcfa);
  const valRes = toNum(equipement.valeur_residuelle_fcfa);
  const base = valBrute - valRes;
  const duree = equipement.duree_amortissement_ans || 1;
  const start = new Date(equipement.date_mise_service ?? equipement.date_acquisition);
  const totalMois = duree * 12;

  const lignes: Array<{
    periode: string; exercice: number; mois: number;
    dotation_fcfa: number; cumul_fcfa: number; vnc_fcfa: number;
  }> = [];

  let cumul = 0;
  let vnc = base;

  for (let i = 0; i < totalMois; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const mois = d.getMonth() + 1;
    const exercice = d.getFullYear();
    const periode = `${String(mois).padStart(2, "0")}/${exercice}`;

    let dotation: number;
    if (equipement.methode_amortissement === "degressif") {
      const taux = (1 / duree) * 2;
      dotation = Math.round(vnc * taux / 12);
    } else {
      dotation = Math.round(base / duree / 12);
    }

    // Ne pas dépasser la valeur résiduelle
    if (vnc - dotation < valRes) {
      dotation = Math.max(0, vnc - valRes);
    }

    cumul += dotation;
    vnc -= dotation;

    lignes.push({ periode, exercice, mois, dotation_fcfa: dotation, cumul_fcfa: cumul, vnc_fcfa: Math.max(0, vnc) });

    if (vnc <= valRes) break;
  }

  return lignes;
}

// ─── CRUD Catégories ──────────────────────────────────────────────────────────

export async function listerCategories(cooperativeId: number) {
  return db
    .select()
    .from(categoriesEquipementsTable)
    .where(eq(categoriesEquipementsTable.cooperativeId, cooperativeId))
    .orderBy(categoriesEquipementsTable.libelle);
}

// ─── CRUD Équipements ─────────────────────────────────────────────────────────

export async function listerEquipements(cooperativeId: number, params: {
  categorieId?: number; statut?: string;
}) {
  const conditions = [eq(equipementsTable.cooperativeId, cooperativeId)];
  if (params.categorieId) conditions.push(eq(equipementsTable.categorieId, params.categorieId));
  if (params.statut) conditions.push(eq(equipementsTable.statut, params.statut));

  return db
    .select({
      id: equipementsTable.id,
      cooperative_id: equipementsTable.cooperativeId,
      categorie_id: equipementsTable.categorieId,
      designation: equipementsTable.designation,
      marque: equipementsTable.marque,
      modele: equipementsTable.modele,
      numero_serie: equipementsTable.numeroSerie,
      date_acquisition: equipementsTable.dateAcquisition,
      valeur_acquisition_fcfa: equipementsTable.valeurAcquisitionFcfa,
      valeur_residuelle_fcfa: equipementsTable.valeurResiduelleFcfa,
      duree_amortissement_ans: equipementsTable.dureeAmortissementAns,
      methode_amortissement: equipementsTable.methodeAmortissement,
      valeur_nette_comptable_fcfa: equipementsTable.valeurNetteComptableFcfa,
      cumul_amortissement_fcfa: equipementsTable.cumulAmortissementFcfa,
      statut: equipementsTable.statut,
      affecte_a: equipementsTable.affecteA,
      affecte_user_id: equipementsTable.affecteUserId,
      date_mise_service: equipementsTable.dateMiseService,
      garantie_expiration: equipementsTable.garantieExpiration,
      photo_url: equipementsTable.photoUrl,
      created_at: equipementsTable.createdAt,
      updated_at: equipementsTable.updatedAt,
      categorie_libelle: categoriesEquipementsTable.libelle,
      compte_amortissement: categoriesEquipementsTable.compteAmortissement,
    })
    .from(equipementsTable)
    .leftJoin(categoriesEquipementsTable, eq(equipementsTable.categorieId, categoriesEquipementsTable.id))
    .where(and(...conditions))
    .orderBy(equipementsTable.designation);
}

export async function getEquipement(id: number, cooperativeId: number) {
  const [row] = await db
    .select({
      id: equipementsTable.id,
      cooperative_id: equipementsTable.cooperativeId,
      categorie_id: equipementsTable.categorieId,
      designation: equipementsTable.designation,
      marque: equipementsTable.marque,
      modele: equipementsTable.modele,
      numero_serie: equipementsTable.numeroSerie,
      date_acquisition: equipementsTable.dateAcquisition,
      valeur_acquisition_fcfa: equipementsTable.valeurAcquisitionFcfa,
      valeur_residuelle_fcfa: equipementsTable.valeurResiduelleFcfa,
      duree_amortissement_ans: equipementsTable.dureeAmortissementAns,
      methode_amortissement: equipementsTable.methodeAmortissement,
      valeur_nette_comptable_fcfa: equipementsTable.valeurNetteComptableFcfa,
      cumul_amortissement_fcfa: equipementsTable.cumulAmortissementFcfa,
      statut: equipementsTable.statut,
      affecte_a: equipementsTable.affecteA,
      affecte_user_id: equipementsTable.affecteUserId,
      date_mise_service: equipementsTable.dateMiseService,
      garantie_expiration: equipementsTable.garantieExpiration,
      photo_url: equipementsTable.photoUrl,
      created_at: equipementsTable.createdAt,
      updated_at: equipementsTable.updatedAt,
      categorie_libelle: categoriesEquipementsTable.libelle,
      compte_amortissement: categoriesEquipementsTable.compteAmortissement,
    })
    .from(equipementsTable)
    .leftJoin(categoriesEquipementsTable, eq(equipementsTable.categorieId, categoriesEquipementsTable.id))
    .where(and(eq(equipementsTable.id, id), eq(equipementsTable.cooperativeId, cooperativeId)));
  return row ?? null;
}

export async function creerEquipement(cooperativeId: number, data: {
  categorie_id: number;
  designation: string;
  marque?: string;
  modele?: string;
  numero_serie?: string;
  date_acquisition: string;
  valeur_acquisition_fcfa: number;
  valeur_residuelle_fcfa?: number;
  duree_amortissement_ans: number;
  methode_amortissement?: string;
  affecte_a?: string;
  affecte_user_id?: number;
  date_mise_service?: string;
  garantie_expiration?: string;
}) {
  const valBrute = data.valeur_acquisition_fcfa;
  const valRes = data.valeur_residuelle_fcfa ?? 0;
  const vnc = valBrute - valRes;

  const [eq_] = await db.insert(equipementsTable).values({
    cooperativeId,
    categorieId: data.categorie_id,
    designation: data.designation,
    marque: data.marque,
    modele: data.modele,
    numeroSerie: data.numero_serie,
    dateAcquisition: data.date_acquisition,
    valeurAcquisitionFcfa: String(valBrute),
    valeurResiduelleFcfa: String(valRes),
    dureeAmortissementAns: data.duree_amortissement_ans,
    methodeAmortissement: data.methode_amortissement ?? "lineaire",
    valeurNetteComptableFcfa: String(vnc),
    cumulAmortissementFcfa: "0",
    statut: "actif",
    affecteA: data.affecte_a,
    affecteUserId: data.affecte_user_id,
    dateMiseService: data.date_mise_service,
    garantieExpiration: data.garantie_expiration,
  }).returning();
  return eq_;
}

export async function modifierEquipement(id: number, cooperativeId: number, data: Partial<{
  designation: string;
  marque: string;
  modele: string;
  numero_serie: string;
  date_acquisition: string;
  valeur_acquisition_fcfa: number;
  valeur_residuelle_fcfa: number;
  duree_amortissement_ans: number;
  methode_amortissement: string;
  statut: string;
  affecte_a: string;
  affecte_user_id: number;
  date_mise_service: string;
  garantie_expiration: string;
}>) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.designation !== undefined) updateData.designation = data.designation;
  if (data.marque !== undefined) updateData.marque = data.marque;
  if (data.modele !== undefined) updateData.modele = data.modele;
  if (data.numero_serie !== undefined) updateData.numeroSerie = data.numero_serie;
  if (data.date_acquisition !== undefined) updateData.dateAcquisition = data.date_acquisition;
  if (data.valeur_acquisition_fcfa !== undefined) updateData.valeurAcquisitionFcfa = String(data.valeur_acquisition_fcfa);
  if (data.valeur_residuelle_fcfa !== undefined) updateData.valeurResiduelleFcfa = String(data.valeur_residuelle_fcfa);
  if (data.duree_amortissement_ans !== undefined) updateData.dureeAmortissementAns = data.duree_amortissement_ans;
  if (data.methode_amortissement !== undefined) updateData.methodeAmortissement = data.methode_amortissement;
  if (data.statut !== undefined) updateData.statut = data.statut;
  if (data.affecte_a !== undefined) updateData.affecteA = data.affecte_a;
  if (data.affecte_user_id !== undefined) updateData.affecteUserId = data.affecte_user_id;
  if (data.date_mise_service !== undefined) updateData.dateMiseService = data.date_mise_service;
  if (data.garantie_expiration !== undefined) updateData.garantieExpiration = data.garantie_expiration;

  const [updated] = await db
    .update(equipementsTable)
    .set(updateData)
    .where(and(eq(equipementsTable.id, id), eq(equipementsTable.cooperativeId, cooperativeId)))
    .returning();
  return updated ?? null;
}

export async function supprimerEquipement(id: number, cooperativeId: number) {
  const [deleted] = await db
    .delete(equipementsTable)
    .where(and(eq(equipementsTable.id, id), eq(equipementsTable.cooperativeId, cooperativeId)))
    .returning();
  return deleted ?? null;
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function getAlertes(cooperativeId: number) {
  const today = new Date().toISOString().slice(0, 10);

  const [maintenancesDepassees, garantiesExpirees, totAmortis] = await Promise.all([
    db.select({ id: equipementsTable.id, designation: equipementsTable.designation })
      .from(equipementsTable)
      .leftJoin(maintenancesEquipementTable, eq(equipementsTable.id, maintenancesEquipementTable.equipementId))
      .where(and(
        eq(equipementsTable.cooperativeId, cooperativeId),
        eq(equipementsTable.statut, "actif"),
        isNotNull(maintenancesEquipementTable.prochaineMaintenance),
        lte(maintenancesEquipementTable.prochaineMaintenance, today),
      )),
    db.select({ id: equipementsTable.id, designation: equipementsTable.designation, garantie_expiration: equipementsTable.garantieExpiration })
      .from(equipementsTable)
      .where(and(
        eq(equipementsTable.cooperativeId, cooperativeId),
        eq(equipementsTable.statut, "actif"),
        isNotNull(equipementsTable.garantieExpiration),
        lte(equipementsTable.garantieExpiration, today),
      )),
    db.select({ id: equipementsTable.id, designation: equipementsTable.designation })
      .from(equipementsTable)
      .where(and(
        eq(equipementsTable.cooperativeId, cooperativeId),
        eq(equipementsTable.statut, "actif"),
        lte(equipementsTable.valeurNetteComptableFcfa, equipementsTable.valeurResiduelleFcfa),
      )),
  ]);

  return {
    maintenances_depassees: maintenancesDepassees,
    garanties_expirees: garantiesExpirees,
    totalement_amortis: totAmortis,
  };
}

export async function getEquipementsAmortis(cooperativeId: number) {
  return db.select({
    id: equipementsTable.id,
    designation: equipementsTable.designation,
    valeur_acquisition_fcfa: equipementsTable.valeurAcquisitionFcfa,
    valeur_residuelle_fcfa: equipementsTable.valeurResiduelleFcfa,
    valeur_nette_comptable_fcfa: equipementsTable.valeurNetteComptableFcfa,
    cumul_amortissement_fcfa: equipementsTable.cumulAmortissementFcfa,
    statut: equipementsTable.statut,
  })
    .from(equipementsTable)
    .where(and(
      eq(equipementsTable.cooperativeId, cooperativeId),
      lte(equipementsTable.valeurNetteComptableFcfa, equipementsTable.valeurResiduelleFcfa),
    ));
}

// ─── Dotations ────────────────────────────────────────────────────────────────

export async function genererDotationsMensuelles(cooperativeId: number, mois: number, annee: number) {
  const equips = await db
    .select()
    .from(equipementsTable)
    .where(and(
      eq(equipementsTable.cooperativeId, cooperativeId),
      eq(equipementsTable.statut, "actif"),
      isNotNull(equipementsTable.dateMiseService),
      lt(equipementsTable.valeurNetteComptableFcfa, equipementsTable.valeurAcquisitionFcfa),
    ));

  let nb = 0;
  for (const eq_ of equips) {
    // Vérifier si dotation déjà générée pour ce mois/année
    const [existing] = await db
      .select({ id: dotationsAmortissementTable.id })
      .from(dotationsAmortissementTable)
      .where(and(
        eq(dotationsAmortissementTable.equipementId, eq_.id),
        eq(dotationsAmortissementTable.exercice, annee),
        eq(dotationsAmortissementTable.mois, mois),
      ));
    if (existing) continue;

    // VNC actuelle > valeur résiduelle ?
    const vnc = toNum(eq_.valeurNetteComptableFcfa);
    const valRes = toNum(eq_.valeurResiduelleFcfa);
    if (vnc <= valRes) continue;

    const equip = {
      valeur_acquisition_fcfa: eq_.valeurAcquisitionFcfa,
      valeur_residuelle_fcfa: eq_.valeurResiduelleFcfa,
      valeur_nette_comptable_fcfa: eq_.valeurNetteComptableFcfa,
      duree_amortissement_ans: eq_.dureeAmortissementAns,
      methode_amortissement: eq_.methodeAmortissement,
    };

    let dotation = calculerDotationMensuelle(equip);
    if (vnc - dotation < valRes) dotation = Math.max(0, vnc - valRes);
    if (dotation <= 0) continue;

    const cumulAnt = toNum(eq_.cumulAmortissementFcfa);
    const nouveauCumul = cumulAnt + dotation;
    const nouvelleVnc = vnc - dotation;

    await db.transaction(async (tx) => {
      await tx.insert(dotationsAmortissementTable).values({
        equipementId: eq_.id,
        cooperativeId,
        exercice: annee,
        mois,
        dotationFcfa: String(dotation),
        cumulFcfa: String(nouveauCumul),
        vncFcfa: String(Math.max(0, nouvelleVnc)),
      });

      await tx
        .update(equipementsTable)
        .set({
          cumulAmortissementFcfa: String(nouveauCumul),
          valeurNetteComptableFcfa: String(Math.max(0, nouvelleVnc)),
          updatedAt: new Date(),
        })
        .where(eq(equipementsTable.id, eq_.id));
    });

    nb++;
  }

  logger.info({ cooperativeId, mois, annee, nb }, "Dotations amortissement générées");
  return { nb_dotations: nb, mois, annee };
}

// ─── Rapport inventaire ───────────────────────────────────────────────────────

export async function getRapportInventaire(cooperativeId: number) {
  const rows = await db
    .select({
      categorie_libelle: categoriesEquipementsTable.libelle,
      valeur_brute: sql<string>`SUM(${equipementsTable.valeurAcquisitionFcfa})`,
      cumul_amortissement: sql<string>`SUM(${equipementsTable.cumulAmortissementFcfa})`,
      vnc: sql<string>`SUM(${equipementsTable.valeurNetteComptableFcfa})`,
      nb_equipements: sql<number>`COUNT(${equipementsTable.id})`,
    })
    .from(equipementsTable)
    .leftJoin(categoriesEquipementsTable, eq(equipementsTable.categorieId, categoriesEquipementsTable.id))
    .where(eq(equipementsTable.cooperativeId, cooperativeId))
    .groupBy(categoriesEquipementsTable.libelle);

  const totBrut = rows.reduce((s, r) => s + toNum(r.valeur_brute), 0);
  const totAmort = rows.reduce((s, r) => s + toNum(r.cumul_amortissement), 0);
  const totVnc = rows.reduce((s, r) => s + toNum(r.vnc), 0);

  return {
    valeur_brute_totale: totBrut,
    cumul_amortissements: totAmort,
    vnc_totale: totVnc,
    par_categorie: rows.map((r) => ({
      categorie: r.categorie_libelle ?? "Non classifié",
      valeur_brute: toNum(r.valeur_brute),
      cumul_amortissement: toNum(r.cumul_amortissement),
      vnc: toNum(r.vnc),
      nb_equipements: Number(r.nb_equipements),
    })),
  };
}

// ─── Maintenances ─────────────────────────────────────────────────────────────

export async function listerMaintenances(equipementId: number) {
  return db
    .select()
    .from(maintenancesEquipementTable)
    .where(eq(maintenancesEquipementTable.equipementId, equipementId))
    .orderBy(sql`${maintenancesEquipementTable.dateMaintenance} DESC`);
}

export async function enregistrerMaintenance(equipementId: number, data: {
  type: string;
  date_maintenance: string;
  description?: string;
  cout_fcfa?: number;
  prestataire?: string;
  prochaine_maintenance?: string;
}) {
  const [row] = await db.insert(maintenancesEquipementTable).values({
    equipementId,
    type: data.type,
    dateMaintenance: data.date_maintenance,
    description: data.description,
    coutFcfa: data.cout_fcfa !== undefined ? String(data.cout_fcfa) : null,
    prestataire: data.prestataire,
    prochaineMaintenance: data.prochaine_maintenance,
  }).returning();
  return row;
}
