import { db } from "@workspace/db";
import {
  cooperativeFeaturesTable,
  cooperativeFeatureHistoryTable,
  cooperativeFeatureModes,
  cooperativesTable,
  type CooperativeFeatureMode,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";

export interface FeatureDefinition {
  key: string;
  label: string;
  category: string;
  description: string;
  dependsOn: string[];
}

export const FEATURE_CATALOG: FeatureDefinition[] = [
  { key: "dashboard", label: "Tableaux de bord", category: "Pilotage", description: "Vues de synthèse et indicateurs", dependsOn: [] },
  { key: "membres", label: "Membres", category: "Membres", description: "Fiches et suivi des membres", dependsOn: [] },
  { key: "campagnes", label: "Campagnes", category: "Collecte", description: "Campagnes de collecte", dependsOn: [] },
  { key: "livraisons", label: "Livraisons", category: "Collecte", description: "Réception et suivi des livraisons", dependsOn: ["membres"] },
  { key: "pesee", label: "Sessions de pesée", category: "Collecte", description: "Pesée groupée et conversion", dependsOn: ["livraisons"] },
  { key: "transport", label: "Transport", category: "Collecte", description: "Missions et règlements transport", dependsOn: ["livraisons"] },
  { key: "expeditions", label: "Expéditions port", category: "Collecte", description: "Expéditions vers le port", dependsOn: ["livraisons"] },
  { key: "tracabilite", label: "Traçabilité", category: "Traçabilité", description: "Suivi de la traçabilité cacao", dependsOn: ["livraisons"] },
  { key: "parcelles", label: "Parcelles & EUDR", category: "Traçabilité", description: "Parcelles et conformité EUDR", dependsOn: ["membres"] },
  { key: "certifications", label: "Certifications", category: "Traçabilité", description: "Certifications des producteurs", dependsOn: ["membres"] },
  { key: "enquetes", label: "Missions d'enquête", category: "Traçabilité", description: "Enquêtes terrain", dependsOn: ["membres"] },
  { key: "missions", label: "Missions terrain", category: "Traçabilité", description: "Missions des agents terrain", dependsOn: ["membres"] },
  { key: "stocks", label: "Stocks", category: "Stocks", description: "Stocks et mouvements", dependsOn: ["livraisons"] },
  { key: "entrepots", label: "Entrepôts délégués", category: "Stocks", description: "Gestion des entrepôts délégués", dependsOn: ["stocks"] },
  { key: "refus", label: "Stocks refoulés", category: "Stocks", description: "Produits refusés", dependsOn: ["stocks"] },
  { key: "bons_reception", label: "Bons de réception", category: "Stocks", description: "Bons de réception membres", dependsOn: ["stocks", "membres"] },
  { key: "avances", label: "Avances", category: "Finance membre", description: "Avances aux membres", dependsOn: ["membres"] },
  { key: "intrants", label: "Intrants", category: "Finance membre", description: "Intrants et distributions", dependsOn: ["membres"] },
  { key: "reglements", label: "Règlements", category: "Finance membre", description: "Règlements des livraisons", dependsOn: ["livraisons"] },
  { key: "primes", label: "Primes & Redistribution", category: "Finance membre", description: "Primes et redistribution", dependsOn: ["livraisons"] },
  { key: "fournisseurs", label: "Fournisseurs", category: "Commerce", description: "Fournisseurs externes", dependsOn: [] },
  { key: "exportateurs", label: "Exportateurs", category: "Commerce", description: "Exportateurs partenaires", dependsOn: [] },
  { key: "ventes", label: "Ventes cacao", category: "Commerce", description: "Ventes aux exportateurs", dependsOn: ["stocks", "exportateurs"] },
  { key: "creances", label: "Créances", category: "Commerce", description: "Créances et recouvrements", dependsOn: [] },
  { key: "prix", label: "Suivi des prix", category: "Commerce", description: "Prix et évolution du cacao", dependsOn: [] },
  { key: "finances", label: "Tableau de bord financier", category: "Finances", description: "Synthèse financière", dependsOn: ["comptabilite"] },
  { key: "budget", label: "Budget", category: "Finances", description: "Budgets prévisionnels", dependsOn: ["comptabilite"] },
  { key: "emprunts", label: "Emprunts", category: "Finances", description: "Emprunts et remboursements", dependsOn: ["comptabilite"] },
  { key: "subventions", label: "Subventions", category: "Finances", description: "Subventions reçues", dependsOn: ["comptabilite"] },
  { key: "dons", label: "Dons", category: "Finances", description: "Dons et affectations", dependsOn: ["comptabilite"] },
  { key: "caisse", label: "Caisse", category: "Finances", description: "Caisse et sorties d'espèces", dependsOn: ["comptabilite"] },
  { key: "banque", label: "Banque", category: "Finances", description: "Comptes bancaires", dependsOn: ["comptabilite"] },
  { key: "cheques", label: "Chèques", category: "Finances", description: "Chèques reçus et émis", dependsOn: ["banque"] },
  { key: "mobile_marchand", label: "Mobile Marchands", category: "Finances", description: "Paiements mobile marchand", dependsOn: ["finances"] },
  { key: "fiscalite", label: "Fiscalité", category: "Finances", description: "Déclarations et fiscalité", dependsOn: ["comptabilite"] },
  { key: "reconciliation", label: "Réconciliation", category: "Finances", description: "Réconciliation bancaire", dependsOn: ["banque"] },
  { key: "investissements", label: "Investissements", category: "Finances", description: "Immobilisations et investissements", dependsOn: ["comptabilite"] },
  { key: "charges_diverses", label: "Charges diverses", category: "Finances", description: "Charges et dépenses diverses", dependsOn: ["comptabilite"] },
  { key: "comptabilite", label: "Comptabilité", category: "Finances", description: "Écritures et comptes comptables", dependsOn: [] },
  { key: "salaires", label: "Salaires", category: "Finances", description: "Paie et salaires", dependsOn: ["comptabilite"] },
  { key: "rh", label: "Ressources humaines", category: "RH & Social", description: "Dossiers, contrats, congés et absences", dependsOn: [] },
  { key: "formations", label: "Formations", category: "RH & Social", description: "Formations des membres", dependsOn: ["membres"] },
  { key: "formations_rse", label: "Formations RSE", category: "RH & Social", description: "Formations RSE", dependsOn: ["formations"] },
  { key: "equipements", label: "Équipements", category: "RH & Social", description: "Équipements et affectations", dependsOn: [] },
  { key: "archives", label: "Archives", category: "Archives", description: "Archives historiques", dependsOn: [] },
  { key: "previsions", label: "Prévisions", category: "Pilotage", description: "Prévisions de collecte", dependsOn: ["livraisons"] },
  { key: "reporting", label: "Reporting", category: "Pilotage", description: "Rapports opérationnels", dependsOn: [] },
  { key: "rapport_gestion", label: "Rapport de gestion IA", category: "Pilotage", description: "Rapport de gestion assisté", dependsOn: ["reporting"] },
  { key: "anomalies", label: "Anomalies", category: "Pilotage", description: "Détection et suivi des anomalies", dependsOn: [] },
  { key: "audit", label: "Journal d'audit", category: "Pilotage", description: "Journal des actions sensibles", dependsOn: [] },
  { key: "gouvernance", label: "Gouvernance", category: "Organisation", description: "Gouvernance coopérative", dependsOn: [] },
  { key: "communication", label: "Communication", category: "Organisation", description: "Messages et annonces", dependsOn: [] },
  { key: "delegues", label: "Délégués", category: "Organisation", description: "Délégués terrain", dependsOn: ["membres"] },
  { key: "delegues_localites", label: "Délégués de localités", category: "Organisation", description: "Taux et commissions des localités", dependsOn: ["membres"] },
  { key: "administration", label: "Administration", category: "Organisation", description: "Comptes et utilisateurs", dependsOn: [] },
  { key: "parametres", label: "Paramètres", category: "Organisation", description: "Paramètres de la coopérative", dependsOn: [] },
  { key: "hors_ligne", label: "Opérations hors ligne", category: "Hors ligne", description: "File locale et synchronisation", dependsOn: [] },
];

const catalogByKey = new Map(FEATURE_CATALOG.map((feature) => [feature.key, feature]));

function modeIsUsable(mode: CooperativeFeatureMode): boolean {
  return mode === "active" || mode === "lecture_seule";
}

export async function getCooperativeFeatureConfig(cooperativeId: number) {
  const [coop] = await db.select({ id: cooperativesTable.id }).from(cooperativesTable)
    .where(eq(cooperativesTable.id, cooperativeId)).limit(1);
  if (!coop) return null;

  const rows = await db.select().from(cooperativeFeaturesTable)
    .where(eq(cooperativeFeaturesTable.cooperativeId, cooperativeId));
  const byKey = new Map(rows.map((row) => [row.featureKey, row]));

  return FEATURE_CATALOG.map((definition) => {
    const row = byKey.get(definition.key);
    const mode = (row?.mode ?? "active") as CooperativeFeatureMode;
    return { ...definition, mode, source: row ? "custom" : "default" as const };
  });
}

export async function getCooperativeFeatureHistory(cooperativeId: number, limit = 100) {
  return db.select().from(cooperativeFeatureHistoryTable)
    .where(eq(cooperativeFeatureHistoryTable.cooperativeId, cooperativeId))
    .orderBy(asc(cooperativeFeatureHistoryTable.createdAt))
    .limit(limit);
}

export async function updateCooperativeFeatures(
  cooperativeId: number,
  updates: Array<{ featureKey: string; mode: CooperativeFeatureMode; reason?: string }>,
  changedBy: number,
) {
  const unknown = updates.find((update) => !catalogByKey.has(update.featureKey));
  if (unknown) throw new Error(`Fonctionnalité inconnue : ${unknown.featureKey}`);
  if (updates.some((update) => !cooperativeFeatureModes.includes(update.mode))) {
    throw new Error("Mode de fonctionnalité invalide");
  }

  const current = await getCooperativeFeatureConfig(cooperativeId);
  if (!current) throw new Error("Coopérative introuvable");
  const modes = new Map(current.map((feature) => [feature.key, feature.mode]));
  const reasons = new Map(updates.map((update) => [update.featureKey, update.reason?.trim() || null]));
  for (const update of updates) modes.set(update.featureKey, update.mode);

  // Désactiver un parent désactive aussi ses dépendants, afin de ne jamais
  // laisser une fonctionnalité utilisable sans son socle.
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of FEATURE_CATALOG) {
      if (definition.dependsOn.some((dependency) => modes.get(dependency) === "disabled")
        && modes.get(definition.key) !== "disabled") {
        modes.set(definition.key, "disabled");
        changed = true;
      }
    }
  }

  await db.transaction(async (tx) => {
    for (const definition of FEATURE_CATALOG) {
      const nextMode = modes.get(definition.key) ?? "active";
      const previousMode = current.find((feature) => feature.key === definition.key)?.mode ?? "active";
      if (nextMode === previousMode) continue;
      await tx.insert(cooperativeFeaturesTable).values({
        cooperativeId,
        featureKey: definition.key,
        mode: nextMode,
        updatedBy: changedBy,
      }).onConflictDoUpdate({
        target: [cooperativeFeaturesTable.cooperativeId, cooperativeFeaturesTable.featureKey],
        set: { mode: nextMode, updatedBy: changedBy, updatedAt: new Date() },
      });
      await tx.insert(cooperativeFeatureHistoryTable).values({
        cooperativeId,
        featureKey: definition.key,
        previousMode,
        newMode: nextMode,
        reason: reasons.get(definition.key) ?? "Dépendance du module parent",
        details: { automatic: !updates.some((update) => update.featureKey === definition.key) },
        changedBy,
      });
    }
  });

  return getCooperativeFeatureConfig(cooperativeId);
}

export function featureKeyForPath(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? pathname;
  const prefixes: Array<[string, string]> = [
    ["/terrain/chauffeur", "transport"],
    ["/terrain/enquetes", "enquetes"], ["/terrain/bons-reception", "bons_reception"],
    ["/terrain/fournisseurs", "fournisseurs"], ["/terrain/fournisseur", "fournisseurs"],
    ["/terrain/entrepot", "entrepots"], ["/terrain/transferts", "entrepots"],
    ["/terrain/collecte", "livraisons"], ["/terrain/paiement", "reglements"],
    ["/terrain/avances", "avances"], ["/terrain/avance", "avances"],
    ["/terrain/missions", "missions"], ["/terrain/messages", "missions"],
    ["/terrain/peseur/collectes", "livraisons"], ["/terrain/bilan-jour", "livraisons"],
    ["/terrain/recu", "livraisons"], ["/terrain/prix", "prix"],
    ["/terrain/mes-commissions", "delegues"], ["/terrain/commissions", "delegues"],
    ["/terrain/delegues-centraux", "delegues"], ["/terrain/rapport-journalier", "reporting"],
    ["/terrain/sync", "hors_ligne"],
    ["/pesee", "pesee"], ["/transferts", "entrepots"],
    ["/finances", "finances"], ["/sessions-pesee", "pesee"], ["/bons-reception-membres", "bons_reception"],
    ["/delegues-localites", "delegues_localites"], ["/administration", "administration"], ["/ops-en-attente", "hors_ligne"],
    ["/formations-rse", "formations_rse"], ["/charges-diverses", "charges_diverses"], ["/mobile-marchand", "mobile_marchand"],
    ["/comptabilite", "comptabilite"], ["/reconciliation", "reconciliation"], ["/investissements", "investissements"],
    ["/dashboard", "dashboard"], ["/membres", "membres"], ["/campagnes", "campagnes"], ["/livraisons", "livraisons"],
    ["/transport", "transport"], ["/expeditions", "expeditions"], ["/tracabilite", "tracabilite"], ["/parcelles", "parcelles"],
    ["/certifications", "certifications"], ["/enquetes", "enquetes"], ["/stocks", "stocks"], ["/entrepots", "entrepots"],
    ["/missions", "missions"], ["/lots", "tracabilite"],
    ["/mon-entrepot", "entrepots"], ["/refus", "refus"], ["/avances", "avances"], ["/intrants", "intrants"], ["/reglements", "reglements"],
    ["/primes", "primes"], ["/fournisseurs", "fournisseurs"], ["/exportateurs", "exportateurs"], ["/ventes", "ventes"],
    ["/creances", "creances"], ["/prix", "prix"], ["/budget", "budget"], ["/emprunts", "emprunts"], ["/subventions", "subventions"],
    ["/dons", "dons"], ["/caisse", "caisse"], ["/banque", "banque"], ["/cheques", "cheques"], ["/fiscalite", "fiscalite"],
    ["/salaires", "salaires"], ["/rh", "rh"], ["/formations", "formations"], ["/equipements", "equipements"], ["/archives", "archives"],
    ["/previsions", "previsions"], ["/reporting", "reporting"], ["/rapport-gestion", "rapport_gestion"], ["/anomalies", "anomalies"],
    ["/audit", "audit"], ["/gouvernance", "gouvernance"], ["/communication", "communication"], ["/delegues", "delegues"],
    ["/peseurs", "delegues"], ["/mes-peseurs", "delegues"], ["/parametres", "parametres"], ["/config", "parametres"],
  ];
  return prefixes.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;
}

export function featureModeAllowsMethod(mode: CooperativeFeatureMode, method: string): boolean {
  return mode === "active" || (mode === "lecture_seule" && ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()));
}

export function isFeatureUsable(mode: CooperativeFeatureMode): boolean {
  return modeIsUsable(mode);
}