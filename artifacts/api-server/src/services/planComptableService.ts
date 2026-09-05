import { db, planComptableTable, parametresComptesModulesTable, ecrituresComptablesTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { normaliserNumeroCompte } from "../lib/numeroCompte.js";



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

// ── Seed SYSCOHADA ────────────────────────────────────────────────────────────

import sysCohada from "../data/syscohada_plan.json" assert { type: "json" };

/**
 * Charge le plan comptable SYSCOHADA complet (1346 comptes) pour une coopérative.
 * Insère en batch par paquets de 100 — ON CONFLICT DO NOTHING pour ne pas écraser
 * les comptes déjà personnalisés.
 * Retourne { inseres, deja_presents }.
 */
export async function seederPlanSyscohadaPourCooperative(cooperativeId: number): Promise<{
  inseres: number;
  dejaPresents: number;
}> {
  type PlanRow = {
    numeroCompte: string;
    libelle: string;
    type: "actif" | "passif" | "charge" | "produit";
    classe: number | null;
    compteParent: string | null;
    ordreAffichage: number;
  };
  const plan = sysCohada as PlanRow[];

  const BATCH = 100;
  let inseres = 0;

  for (let i = 0; i < plan.length; i += BATCH) {
    const slice = plan.slice(i, i + BATCH);
    const result = await db
      .insert(planComptableTable)
      .values(
        slice.map((c) => ({
          cooperativeId,
           numeroCompte:   normaliserNumeroCompte(c.numeroCompte),
          libelle:        c.libelle,
          type:           c.type,
          classe:         c.classe,
           compteParent:   c.compteParent ? normaliserNumeroCompte(c.compteParent) : null,
          ordreAffichage: c.ordreAffichage,
          actif:          true,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: planComptableTable.id });
    inseres += result.length;
  }

  return { inseres, dejaPresents: plan.length - inseres };
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
  const numeroCompte = normaliserNumeroCompte(payload.numeroCompte);
  const compteParent = payload.compteParent ? normaliserNumeroCompte(payload.compteParent) : null;
  const classe = payload.classe ?? (numeroCompte ? parseInt(numeroCompte[0]!) : undefined);

  const [compte] = await db
    .insert(planComptableTable)
    .values({
      cooperativeId: coopId,
       numeroCompte,
      libelle: payload.libelle,
      type: payload.type,
      classe: classe ?? null,
       compteParent,
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
  const numeroNormalise = normaliserNumeroCompte(numero);
  const [compte] = await db
    .select()
    .from(planComptableTable)
    .where(and(
      eq(planComptableTable.cooperativeId, cooperativeId),
       eq(planComptableTable.numeroCompte, numeroNormalise),
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
  const coopId = cooperativeId;
  const conditions = [
    ...(coopId != null ? [eq(parametresComptesModulesTable.cooperativeId, coopId)] : []),
    ...(module ? [eq(parametresComptesModulesTable.module, module)] : []),
  ];
  const rows = await db
    .select()
    .from(parametresComptesModulesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
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
  "livraisons:achat_cacao_producteur":    { compteDebit: "601000",  compteCredit: "401000",  libelle: "Achat cacao {fournisseur} - {date}" },
  "livraisons:paiement_producteur_banque":{ compteDebit: "401000",  compteCredit: "521000",  libelle: "Paiement {fournisseur} - {ref}" },
  "livraisons:paiement_producteur_caisse":{ compteDebit: "401000",  compteCredit: "571000",  libelle: "Paiement caisse {fournisseur}" },
  "avances:octroi_avance_producteur":     { compteDebit: "409100", compteCredit: "521000",  libelle: "Avance {membre} - {date}" },
  "avances:remboursement_avance":         { compteDebit: "401000",  compteCredit: "409100", libelle: "Remboursement avance {membre}" },
  "ventes_export:vente_cacao_exportateur":{ compteDebit: "411100", compteCredit: "701000",  libelle: "Vente lot {lot} à {exportateur}" },
  "ventes_export:encaissement_exportateur":{ compteDebit: "521000", compteCredit: "411100", libelle: "Encaissement {exportateur} - {ref}" },
  "salaires:salaire_brut":                { compteDebit: "661000",  compteCredit: "422000",  libelle: "Salaires {mois} {annee}" },
  "salaires:charges_sociales_patronales": { compteDebit: "664000",  compteCredit: "431000",  libelle: "CNPS patronal {mois} {annee}" },
  "salaires:paiement_salaire":            { compteDebit: "422000",  compteCredit: "521000",  libelle: "Paiement salaires {mois}" },
  "salaires:avance_personnel":            { compteDebit: "425000",  compteCredit: "521000",  libelle: "Avance {employe} - {date}" },
  "dons:don_effectue_especes":            { compteDebit: "658000",  compteCredit: "521000",  libelle: "Don {categorie} - {beneficiaire}" },
  "dons:don_effectue_nature":             { compteDebit: "658000",  compteCredit: "311000",   libelle: "Don nature {designation}" },
  "dons:don_recu_especes":                { compteDebit: "521000",  compteCredit: "758000",  libelle: "Don reçu {donateur} - {date}" },
  "dons:don_recu_nature":                 { compteDebit: "311000",   compteCredit: "758000",  libelle: "Don nature reçu {donateur}" },
  "intrants:appro_intrants":              { compteDebit: "311000",   compteCredit: "401000",  libelle: "Appro {intrant} - {fournisseur}" },
  "intrants:distribution_credit":         { compteDebit: "409100", compteCredit: "311000",   libelle: "Intrants {intrant} à {membre}" },
  "emprunts:reception_emprunt":           { compteDebit: "521000",  compteCredit: "164000",  libelle: "Emprunt {preteur} - {ref}" },
  "emprunts:remboursement_capital":       { compteDebit: "164000",  compteCredit: "521000",  libelle: "Rembt capital {preteur}" },
  "emprunts:paiement_interets":           { compteDebit: "671000",  compteCredit: "521000",  libelle: "Intérêts {preteur} {mois}" },
  "transport:frais_transport":            { compteDebit: "624000",  compteCredit: "521000",  libelle: "Transport {mission} - {date}" },
  "amortissements:dotation_mensuelle":    { compteDebit: "681000",  compteCredit: "284000",  libelle: "Amort. {equipement} {mois}" },
  "parts_sociales:liberation_parts":      { compteDebit: "521000",  compteCredit: "101000",  libelle: "Parts sociales {membre}" },
  // Salaires — cotisations salarié
  "salaires:cotisations_salarie":         { compteDebit: "431000",  compteCredit: "421000",  libelle: "Cotisations CNPS salarié {employe}" },
  // Primes
  "primes:reception_prime":              { compteDebit: "521000",  compteCredit: "758800", libelle: "Prime {type} – {exportateur}" },
  "primes:paiement_prime":              { compteDebit: "601800", compteCredit: "521000",  libelle: "Prime producteur – {membre}" },
  // Commissions délégués
  "commissions_delegues:paiement_commission": { compteDebit: "632200", compteCredit: "521000", libelle: "Commission délégué – {delegue}" },
  // Règlement intégré des membres délégués de localités depuis le bon réception.
  "receptions_membres_delegues:frais_carburant":      { compteDebit: "409100", compteCredit: "521000",  libelle: "Carburant avancé pour le membre – {membre}" },
  "receptions_membres_delegues:retenue_carburant":    { compteDebit: "401000",  compteCredit: "409100", libelle: "Récupération carburant sur règlement – {membre}" },
  "receptions_membres_delegues:autres_charges":       { compteDebit: "409100", compteCredit: "521000",  libelle: "Autres charges avancées pour le membre – {membre}" },
  "receptions_membres_delegues:retenue_autres_charges": { compteDebit: "401000", compteCredit: "409100", libelle: "Récupération autres charges sur règlement – {membre}" },
};

export async function modifierParams(cooperativeId: number, id: number, payload: {
  compteDebit?: string;
  compteCredit?: string;
  libelleEcritureAuto?: string;
  modifiePar?: number;
}) {
  // Valider les comptes
  if (payload.compteDebit) {
    const compteDebit = normaliserNumeroCompte(payload.compteDebit);
    const chk = await validerNumeroCompte(cooperativeId, compteDebit);
    if (!chk.valide) throw new Error(`Compte débit "${compteDebit}" introuvable dans le plan comptable`);
    if (!chk.actif) throw new Error(`Compte débit "${compteDebit}" est désactivé`);
  }
  if (payload.compteCredit) {
    const compteCredit = normaliserNumeroCompte(payload.compteCredit);
    const chk = await validerNumeroCompte(cooperativeId, compteCredit);
    if (!chk.valide) throw new Error(`Compte crédit "${compteCredit}" introuvable dans le plan comptable`);
    if (!chk.actif) throw new Error(`Compte crédit "${compteCredit}" est désactivé`);
  }

  const [updated] = await db
    .update(parametresComptesModulesTable)
    .set({
       ...(payload.compteDebit ? { compteDebit: normaliserNumeroCompte(payload.compteDebit) } : {}),
       ...(payload.compteCredit ? { compteCredit: normaliserNumeroCompte(payload.compteCredit) } : {}),
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

/**
 * Upsert d'un ensemble de lignes dans parametres_comptes_modules.
 * – Si la ligne (cooperative_id, module, operation) existe → UPDATE
 * – Sinon → INSERT
 */
async function upsertParams(
  cooperativeId: number,
  entries: { module: string; operation: string; compteDebit: string; compteCredit: string; libelle: string }[],
  modifiePar?: number,
): Promise<number> {
  // Récupérer les lignes existantes pour ce cooperative
  const existing = await db
    .select({ module: parametresComptesModulesTable.module, operation: parametresComptesModulesTable.operation })
    .from(parametresComptesModulesTable)
    .where(eq(parametresComptesModulesTable.cooperativeId, cooperativeId));

  const existingSet = new Set(existing.map(r => `${r.module}:${r.operation}`));

  const toInsert = entries.filter(e => !existingSet.has(`${e.module}:${e.operation}`));
  const toUpdate = entries.filter(e => existingSet.has(`${e.module}:${e.operation}`));

  if (toInsert.length > 0) {
    await db.insert(parametresComptesModulesTable).values(
      toInsert.map(e => ({
        cooperativeId,
        module: e.module,
        operation: e.operation,
        compteDebit: e.compteDebit,
        compteCredit: e.compteCredit,
        libelleEcritureAuto: e.libelle,
        actif: true,
        modifiePar: modifiePar ?? null,
        updatedAt: new Date(),
      }))
    );
  }

  for (const e of toUpdate) {
    await db
      .update(parametresComptesModulesTable)
      .set({ compteDebit: e.compteDebit, compteCredit: e.compteCredit, libelleEcritureAuto: e.libelle, modifiePar: modifiePar ?? null, updatedAt: new Date() })
      .where(and(
        eq(parametresComptesModulesTable.cooperativeId, cooperativeId),
        eq(parametresComptesModulesTable.module, e.module),
        eq(parametresComptesModulesTable.operation, e.operation),
      ));
  }

  return entries.length;
}

export async function resetModuleOhada(cooperativeId: number, module: string, modifiePar?: number) {
  const entries = Object.entries(OHADA_DEFAULTS)
    .filter(([k]) => k.startsWith(`${module}:`))
    .map(([k, v]) => ({ module, operation: k.split(":")[1]!, ...v }));

  if (entries.length === 0) throw new Error(`Module "${module}" non reconnu ou sans défaut OHADA`);

  await upsertParams(cooperativeId, entries, modifiePar);
  invaliderCacheParams(cooperativeId);
  return { module, operations: entries.length };
}

/**
 * Initialise TOUS les modules OHADA pour une coopérative.
 * Insère les lignes manquantes, met à jour les existantes.
 */
export async function seederParamsTousModules(cooperativeId: number, modifiePar?: number): Promise<{
  inseres: number; mises_a_jour: number;
}> {
  const entries = Object.entries(OHADA_DEFAULTS).map(([k, v]) => {
    const [mod, op] = k.split(":");
    return { module: mod!, operation: op!, ...v };
  });

  // Compter les existants avant pour calculer la répartition
  const existing = await db
    .select({ module: parametresComptesModulesTable.module, operation: parametresComptesModulesTable.operation })
    .from(parametresComptesModulesTable)
    .where(eq(parametresComptesModulesTable.cooperativeId, cooperativeId));

  const existingSet = new Set(existing.map(r => `${r.module}:${r.operation}`));
  const inseres = entries.filter(e => !existingSet.has(`${e.module}:${e.operation}`)).length;
  const mises_a_jour = entries.length - inseres;

  await upsertParams(cooperativeId, entries, modifiePar);
  invaliderCacheParams(cooperativeId);

  return { inseres, mises_a_jour };
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
