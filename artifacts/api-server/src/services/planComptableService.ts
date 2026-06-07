import { db, planComptableTable, parametresComptesModulesTable, ecrituresComptablesTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";



// ── Cache in-memory (10 min TTL) ─────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number }
const paramsCache = new Map<string, CacheEntry<ParamEcriture>>();
const CACHE_TTL = 10 * 60 * 1000;

function cacheKey(cooperativeId: number, module: string, operation: string) {
  return `${cooperativeId}:${module}:${operation}`;
}
function getCached(key: string): ParamEcriture | null {
  const e = paramsCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { paramsCache.delete(key); return null; }
  return e.data;
}
function setCache(key: string, data: ParamEcriture) {
  paramsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

export interface ParamEcriture {
  id: number;
  compteDebit: string;
  compteCredit: string;
  libelleTemplate: string;
}

// ── Plan comptable ────────────────────────────────────────────────────────────

export async function listerPlanComptable(opts: {
  cooperativeId?: number;
  classe?: number;
  type?: string;
  actif?: boolean;
  search?: string;
}) {
  const coopId = opts.cooperativeId;
  if (!coopId) throw new Error("cooperativeId requis");
  const rows = await db
    .select()
    .from(planComptableTable)
    .where(eq(planComptableTable.cooperativeId, coopId))
    .orderBy(asc(planComptableTable.numeroCompte));

  return rows.filter((r) => {
    if (opts.classe !== undefined && r.classe !== opts.classe) return false;
    if (opts.type !== undefined && r.type !== opts.type) return false;
    if (opts.actif !== undefined && r.actif !== opts.actif) return false;
    if (opts.search) {
      const s = opts.search.toLowerCase();
      if (!r.numeroCompte.toLowerCase().includes(s) && !r.libelle.toLowerCase().includes(s)) return false;
    }
    return true;
  });
}

export async function ajouterCompte(payload: {
  cooperativeId?: number;
  numeroCompte: string;
  libelle: string;
  type: "actif" | "passif" | "charge" | "produit";
  classe?: number;
  compteParent?: string;
  soldeNormal?: string;
  ordreAffichage?: number;
}) {
  const coopId = payload.cooperativeId;
  if (!coopId) throw new Error("cooperativeId requis");
  // Calculer classe automatiquement depuis le numéro si non fourni
  const classe = payload.classe ?? (payload.numeroCompte ? parseInt(payload.numeroCompte[0]!) : undefined);

  const [compte] = await db
    .insert(planComptableTable)
    .values({
      cooperativeId: coopId,
      numeroCompte: payload.numeroCompte,
      libelle: payload.libelle,
      type: payload.type,
      classe: classe ?? null,
      compteParent: payload.compteParent ?? null,
      soldeNormal: payload.soldeNormal ?? (["charge", "actif"].includes(payload.type) ? "debiteur" : "crediteur"),
      actif: true,
      ordreAffichage: payload.ordreAffichage ?? null,
    })
    .returning();
  if (!compte) throw new Error("Erreur lors de la création du compte");
  return compte;
}

export async function modifierCompte(cooperativeId: number, id: number, payload: {
  libelle?: string;
  actif?: boolean;
  ordreAffichage?: number;
}) {
  const [updated] = await db
    .update(planComptableTable)
    .set({ ...payload, updatedAt: new Date() })
    .where(and(eq(planComptableTable.id, id), eq(planComptableTable.cooperativeId, cooperativeId)))
    .returning();
  if (!updated) throw new Error("Compte introuvable");
  return updated;
}

export async function desactiverCompte(cooperativeId: number, id: number) {
  // Vérifier si le compte a des écritures
  const compte = await db
    .select()
    .from(planComptableTable)
    .where(and(eq(planComptableTable.id, id), eq(planComptableTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!compte[0]) throw new Error("Compte introuvable");

  const num = compte[0].numeroCompte;
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(ecrituresComptablesTable)
    .where(
      and(
        eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
        sql`(${ecrituresComptablesTable.compteDebit} = ${num} OR ${ecrituresComptablesTable.compteCredit} = ${num})`
      )
    );
  if (cnt > 0) throw new Error(`Ce compte a ${cnt} écriture(s). Désactivation refusée.`);

  const [updated] = await db
    .update(planComptableTable)
    .set({ actif: false, updatedAt: new Date() })
    .where(eq(planComptableTable.id, id))
    .returning();
  return updated;
}

export async function validerNumeroCompte(cooperativeId: number, numero: string) {
  const [compte] = await db
    .select()
    .from(planComptableTable)
    .where(and(
      eq(planComptableTable.cooperativeId, cooperativeId),
      eq(planComptableTable.numeroCompte, numero),
    ))
    .limit(1);
  return {
    valide: !!compte,
    actif: compte?.actif ?? false,
    libelle: compte?.libelle ?? null,
    typeCompte: compte?.type ?? null,
  };
}

// ── Paramètres comptes modules ────────────────────────────────────────────────

export async function listerParams(cooperativeId?: number, module?: string) {
  const coopId = cooperativeId ?? cooperativeId;
  const rows = await db
    .select()
    .from(parametresComptesModulesTable)
    .where(and(
      eq(parametresComptesModulesTable.cooperativeId, coopId),
      ...(module ? [eq(parametresComptesModulesTable.module, module)] : []),
    ))
    .orderBy(asc(parametresComptesModulesTable.module), asc(parametresComptesModulesTable.operation));
  return rows;
}

export async function getParamsEcriture(
  cooperativeId: number,
  module: string,
  operation: string,
): Promise<ParamEcriture | null> {
  const key = cacheKey(cooperativeId, module, operation);
  const cached = getCached(key);
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(parametresComptesModulesTable)
    .where(and(
      eq(parametresComptesModulesTable.cooperativeId, cooperativeId),
      eq(parametresComptesModulesTable.module, module),
      eq(parametresComptesModulesTable.operation, operation),
      eq(parametresComptesModulesTable.actif, true),
    ))
    .limit(1);

  if (!row) return null;
  const result: ParamEcriture = {
    id: row.id,
    compteDebit: row.compteDebit,
    compteCredit: row.compteCredit,
    libelleTemplate: row.libelleEcritureAuto ?? "",
  };
  setCache(key, result);
  return result;
}

export function invaliderCacheParams(cooperativeId: number) {
  for (const key of paramsCache.keys()) {
    if (key.startsWith(`${cooperativeId}:`)) paramsCache.delete(key);
  }
}

export function genererLibelle(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => context[key] ?? `{${key}}`);
}

// Valeurs OHADA par défaut pour chaque opération
const OHADA_DEFAULTS: Record<string, { compteDebit: string; compteCredit: string; libelle: string }> = {
  "livraisons:achat_cacao_producteur":    { compteDebit: "601",  compteCredit: "401",  libelle: "Achat cacao {fournisseur} - {date}" },
  "livraisons:paiement_producteur_banque":{ compteDebit: "401",  compteCredit: "521",  libelle: "Paiement {fournisseur} - {ref}" },
  "livraisons:paiement_producteur_caisse":{ compteDebit: "401",  compteCredit: "571",  libelle: "Paiement caisse {fournisseur}" },
  "avances:octroi_avance_producteur":     { compteDebit: "416",  compteCredit: "521",  libelle: "Avance {membre} - {date}" },
  "avances:remboursement_avance":         { compteDebit: "401",  compteCredit: "416",  libelle: "Remboursement avance {membre}" },
  "ventes_export:vente_cacao_exportateur":{ compteDebit: "4111", compteCredit: "701",  libelle: "Vente lot {lot} à {exportateur}" },
  "ventes_export:encaissement_exportateur":{ compteDebit: "521", compteCredit: "4111", libelle: "Encaissement {exportateur} - {ref}" },
  "salaires:salaire_brut":                { compteDebit: "661",  compteCredit: "422",  libelle: "Salaires {mois} {annee}" },
  "salaires:charges_sociales_patronales": { compteDebit: "664",  compteCredit: "431",  libelle: "CNPS patronal {mois} {annee}" },
  "salaires:paiement_salaire":            { compteDebit: "422",  compteCredit: "521",  libelle: "Paiement salaires {mois}" },
  "salaires:avance_personnel":            { compteDebit: "425",  compteCredit: "521",  libelle: "Avance {employe} - {date}" },
  "dons:don_effectue_especes":            { compteDebit: "658",  compteCredit: "521",  libelle: "Don {categorie} - {beneficiaire}" },
  "dons:don_effectue_nature":             { compteDebit: "658",  compteCredit: "31",   libelle: "Don nature {designation}" },
  "dons:don_recu_especes":                { compteDebit: "521",  compteCredit: "754",  libelle: "Don reçu {donateur} - {date}" },
  "dons:don_recu_nature":                 { compteDebit: "31",   compteCredit: "754",  libelle: "Don nature reçu {donateur}" },
  "intrants:appro_intrants":              { compteDebit: "31",   compteCredit: "401",  libelle: "Appro {intrant} - {fournisseur}" },
  "intrants:distribution_credit":         { compteDebit: "416",  compteCredit: "31",   libelle: "Intrants {intrant} à {membre}" },
  "emprunts:reception_emprunt":           { compteDebit: "521",  compteCredit: "164",  libelle: "Emprunt {preteur} - {ref}" },
  "emprunts:remboursement_capital":       { compteDebit: "164",  compteCredit: "521",  libelle: "Rembt capital {preteur}" },
  "emprunts:paiement_interets":           { compteDebit: "671",  compteCredit: "521",  libelle: "Intérêts {preteur} {mois}" },
  "transport:frais_transport":            { compteDebit: "624",  compteCredit: "521",  libelle: "Transport {mission} - {date}" },
  "amortissements:dotation_mensuelle":    { compteDebit: "681",  compteCredit: "284",  libelle: "Amort. {equipement} {mois}" },
  "parts_sociales:liberation_parts":      { compteDebit: "521",  compteCredit: "101",  libelle: "Parts sociales {membre}" },
};

export async function modifierParams(cooperativeId: number, id: number, payload: {
  compteDebit?: string;
  compteCredit?: string;
  libelleEcritureAuto?: string;
  modifiePar?: number;
}) {
  // Valider les comptes
  if (payload.compteDebit) {
    const chk = await validerNumeroCompte(cooperativeId, payload.compteDebit);
    if (!chk.valide) throw new Error(`Compte débit "${payload.compteDebit}" introuvable dans le plan comptable`);
    if (!chk.actif) throw new Error(`Compte débit "${payload.compteDebit}" est désactivé`);
  }
  if (payload.compteCredit) {
    const chk = await validerNumeroCompte(cooperativeId, payload.compteCredit);
    if (!chk.valide) throw new Error(`Compte crédit "${payload.compteCredit}" introuvable dans le plan comptable`);
    if (!chk.actif) throw new Error(`Compte crédit "${payload.compteCredit}" est désactivé`);
  }

  const [updated] = await db
    .update(parametresComptesModulesTable)
    .set({
      ...(payload.compteDebit ? { compteDebit: payload.compteDebit } : {}),
      ...(payload.compteCredit ? { compteCredit: payload.compteCredit } : {}),
      ...(payload.libelleEcritureAuto !== undefined ? { libelleEcritureAuto: payload.libelleEcritureAuto } : {}),
      modifiePar: payload.modifiePar ?? null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(parametresComptesModulesTable.id, id),
      eq(parametresComptesModulesTable.cooperativeId, cooperativeId),
    ))
    .returning();
  if (!updated) throw new Error("Paramètre introuvable");
  invaliderCacheParams(cooperativeId);
  return updated;
}

export async function resetModuleOhada(cooperativeId: number, module: string, modifiePar?: number) {
  const defaults = Object.entries(OHADA_DEFAULTS)
    .filter(([k]) => k.startsWith(`${module}:`))
    .map(([k, v]) => ({ operation: k.split(":")[1]!, ...v }));

  if (defaults.length === 0) throw new Error(`Module "${module}" non reconnu ou sans défaut OHADA`);

  for (const d of defaults) {
    await db
      .update(parametresComptesModulesTable)
      .set({
        compteDebit: d.compteDebit,
        compteCredit: d.compteCredit,
        libelleEcritureAuto: d.libelle,
        modifiePar: modifiePar ?? null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(parametresComptesModulesTable.cooperativeId, cooperativeId),
        eq(parametresComptesModulesTable.module, module),
        eq(parametresComptesModulesTable.operation, d.operation),
      ));
  }
  invaliderCacheParams(cooperativeId);
  return { module, operations: defaults.length };
}

// ── Correction d'écriture ─────────────────────────────────────────────────────

export async function corrigerEcriture(
  cooperativeId: number,
  ecritureId: number,
  payload: {
    nouveauCompteDebit?: string;
    nouveauCompteCredit?: string;
    nouveauMontant?: number;
    nouveauLibelle?: string;
    motifCorrection: string;
    corrigePar: number;
  },
) {
  // 1. Récupérer l'écriture originale
  const [original] = await db
    .select()
    .from(ecrituresComptablesTable)
    .where(and(
      eq(ecrituresComptablesTable.id, ecritureId),
      eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
    ))
    .limit(1);
  if (!original) throw new Error("Écriture introuvable");
  if (original.typeEcriture !== "normale") throw new Error("Seules les écritures normales peuvent être corrigées");

  // 2. Valider les nouveaux comptes si fournis
  if (payload.nouveauCompteDebit) {
    const chk = await validerNumeroCompte(cooperativeId, payload.nouveauCompteDebit);
    if (!chk.valide) throw new Error(`Compte débit "${payload.nouveauCompteDebit}" introuvable`);
  }
  if (payload.nouveauCompteCredit) {
    const chk = await validerNumeroCompte(cooperativeId, payload.nouveauCompteCredit);
    if (!chk.valide) throw new Error(`Compte crédit "${payload.nouveauCompteCredit}" introuvable`);
  }

  const pieceBase = original.numeroPiece ?? `EC-${original.id}`;

  // 3. Écriture de contre-passation (annulation)
  const [annulation] = await db
    .insert(ecrituresComptablesTable)
    .values({
      cooperativeId: cooperativeId,
      dateEcriture: original.dateEcriture,
      numeroPiece: `ANN-${pieceBase}`,
      libelle: `ANNULATION - ${original.libelle}`,
      compteDebit: original.compteCredit,
      compteCredit: original.compteDebit,
      montantFcfa: original.montantFcfa,
      source: original.source,
      sourceId: original.sourceId ?? null,
      exercice: original.exercice,
      typeEcriture: "annulation",
      ecritureSourceId: original.id,
      motifCorrection: payload.motifCorrection,
      corrigePar: payload.corrigePar,
      corrigeLe: new Date(),
    })
    .returning();

  if (!annulation) throw new Error("Erreur lors de la création de l'écriture de contre-passation");

  // 4. Écriture de correction
  const [correction] = await db
    .insert(ecrituresComptablesTable)
    .values({
      cooperativeId: cooperativeId,
      dateEcriture: original.dateEcriture,
      numeroPiece: `COR-${pieceBase}`,
      libelle: `CORRECTION - ${payload.nouveauLibelle ?? original.libelle}`,
      compteDebit: payload.nouveauCompteDebit ?? original.compteDebit,
      compteCredit: payload.nouveauCompteCredit ?? original.compteCredit,
      montantFcfa: payload.nouveauMontant ?? original.montantFcfa,
      source: original.source,
      sourceId: original.sourceId ?? null,
      exercice: original.exercice,
      typeEcriture: "correction",
      ecritureSourceId: original.id,
      motifCorrection: payload.motifCorrection,
      corrigePar: payload.corrigePar,
      corrigeLe: new Date(),
    })
    .returning();

  if (!correction) throw new Error("Erreur lors de la création de l'écriture de correction");

  // 5. Marquer l'originale comme corrigée
  await db
    .update(ecrituresComptablesTable)
    .set({ motifCorrection: payload.motifCorrection, corrigePar: payload.corrigePar, corrigeLe: new Date() })
    .where(eq(ecrituresComptablesTable.id, original.id));

  logger.info({ ecritureId: original.id, annulationId: annulation.id, correctionId: correction.id }, "Écriture corrigée");

  return { original, annulation, correction };
}

export async function getHistoriqueCorrections(cooperativeId: number, ecritureId: number) {
  const [original] = await db
    .select()
    .from(ecrituresComptablesTable)
    .where(and(
      eq(ecrituresComptablesTable.id, ecritureId),
      eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
    ))
    .limit(1);
  if (!original) throw new Error("Écriture introuvable");

  const liees = await db
    .select()
    .from(ecrituresComptablesTable)
    .where(and(
      eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
      eq(ecrituresComptablesTable.ecritureSourceId, ecritureId),
    ))
    .orderBy(asc(ecrituresComptablesTable.id));

  return { original, corrections: liees };
}

export async function rechercherEcritures(cooperativeId: number, query: string) {
  const rows = await db
    .select()
    .from(ecrituresComptablesTable)
    .where(and(
      eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
      sql`(
        ${ecrituresComptablesTable.numeroPiece} ILIKE ${"%" + query + "%"} OR
        ${ecrituresComptablesTable.libelle} ILIKE ${"%" + query + "%"}
      )`
    ))
    .orderBy(asc(ecrituresComptablesTable.dateEcriture))
    .limit(20);
  return rows;
}
