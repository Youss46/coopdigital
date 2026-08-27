import { vi } from "vitest";

const makeTable = (name: string) => ({ _: { name } });

export const db = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
};

// Keep transaction-based services compatible with the same chainable mock
// methods configured by individual tests.
db.transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
export const membresTable = makeTable("membres");
export const avancesTable = makeTable("avances");
export const campagnesTable = makeTable("campagnes");
export const livraisonsTable = makeTable("livraisons");
export const lotLivraisonsTable = makeTable("lot_livraisons");
export const lotsTable = makeTable("lots");
export const exportateursTable = makeTable("exportateurs");
export const usersTable = makeTable("users");
export const paiementsTable = makeTable("paiements");
export const intrantsTable = makeTable("intrants");
export const distributionsIntrantsTable = makeTable("distributions_intrants");
export const remboursementsIntrantsTable = makeTable("remboursements_intrants");
export const categoriesIntrantsTable = makeTable("categories_intrants");
export const approvisionnmentsIntrantsTable = makeTable("approvisionnments_intrants");
export const stocksTable = makeTable("stocks");
export const mouvementsStockTable = makeTable("mouvements_stock");
export const entrepotsTable = makeTable("entrepots");
export const fournisseursTable = makeTable("fournisseurs");
export const cooperativesTable = makeTable("cooperatives");
export const sessionsUtilisateursTable = makeTable("sessions_utilisateurs");
export const devisesTable = makeTable("devises");
export const tauxChangeTable = makeTable("taux_change");
export const ecrituresComptablesTable = makeTable("ecritures_comptables");
export const ecrituresEnAttenteTable = makeTable("ecritures_en_attente");
export const exercicesTable = makeTable("exercices");
export const planComptableTable = makeTable("plan_comptable");
export const configComptableTable = makeTable("config_comptable");
export const licencesTable = makeTable("licences");
export const plansAbonnementTable = makeTable("plans_abonnement");
export const historiqueSmsTable = makeTable("historique_sms");
export const historiqueRendementsTable = makeTable("historique_rendements");
export const parcellesTable = makeTable("parcelles");
export const ventesExportateursTable = makeTable("ventes_exportateurs");
export const zonesRisqueEudrTable = makeTable("zones_risque_eudr");
export const bilansCampagneTable = makeTable("bilans_campagne");
export const IndicateurRse = makeTable("indicateurs_rse");
export const sessionsPeseeTable = makeTable("sessions_pesee");
export const lignesPeseeTable = makeTable("lignes_pesee");
export const configPeseeTable = makeTable("config_pesee");
export const transfertsStockTable = makeTable("transferts_stock");
export const entrepotsDeleguesTable = makeTable("entrepots_delegues");
// Additional tables used by pdfService and other modules
export const bulletinsPaieTable = makeTable("bulletins_paie");
export const lignesBulletinTable = makeTable("lignes_bulletin");
export const personnelTable = makeTable("personnel");
export const obligationsFiscalesTable = {
  ...makeTable("obligations_fiscales"),
  cooperativeId: {}, typeTaxe: {}, actif: {}, tauxPct: {}, id: {},
  periodicite: {}, libelle: {}, jourEcheance: {}, baseCalcul: {},
};
export const declarationsFiscalesTable = {
  ...makeTable("declarations_fiscales"),
  id: {}, cooperativeId: {}, obligationId: {}, periode: {}, statut: {},
  baseImposableFcfa: {}, montantCalculeFcfa: {}, montantPayeFcfa: {},
  dateEcheance: {}, datePaiement: {}, referencePaiement: {},
  penaliteRetardFcfa: {}, documentUrl: {}, updatedAt: {},
};
export const chargesDiversesTable = {
  ...makeTable("charges_diverses"),
  cooperativeId: {}, categorie: {}, statut: {}, dateCharge: {},
  tiers: {}, montantFcfa: {}, referencePiece: {},
};
export const liberationsPartsTable = makeTable("liberations_parts");
export const configPartsSocialesTable = makeTable("config_parts_sociales");
export const expeditionsTable = makeTable("expeditions");
export const expeditionLotsTable = makeTable("expedition_lots");
export const traitementsRefusTable = makeTable("traitements_refus");
export const commissionsDeleguesTable = makeTable("commissions_delegues");
export const tauxCommissionsMembresDeleguesTable = makeTable("taux_commissions_membres_delegues");
export const commissionsMembresDelaguesTable = makeTable("commissions_membres_delegues");
export const bonsReceptionMembresDeleguesTable = makeTable("bons_reception_membres_delegues");
export const balanceSageImportsTable = makeTable("balance_sage_imports");
export const balanceSageLignesTable = makeTable("balance_sage_lignes");
export const balanceSageRepriseAuditTable = makeTable("balance_sage_reprise_audit");
export const certificationsTable = makeTable("certifications");
export const certificationsMembresTable = makeTable("certifications_membres");
export const primesDistributionsTable = {
  _: { name: "primes_distributions" },
  id: {}, cooperativeId: {}, statut: {},
};
export const primesMembresTable = {
  _: { name: "primes_membres" },
  id: {}, cooperativeId: {}, distributionId: {}, statut: {}, membreId: {},
  montantNetFcfa: {}, deductionAvancesFcfa: {}, modePaiement: {}, datePaiement: {},
  referencePaiement: {}, notes: {}, payePar: {}, updatedAt: {},
};
