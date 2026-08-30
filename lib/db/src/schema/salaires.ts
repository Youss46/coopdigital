import {
  pgTable,
  serial,
  integer,
  text,
  date,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const personnelStatutEnum = pgEnum("personnel_statut", [
  "actif",
  "suspendu",
  "sorti",
]);

export const typeContratEnum = pgEnum("type_contrat", [
  "cdi",
  "cdd",
  "journalier",
  "stagiaire",
]);

export const modePaiementPersonnelEnum = pgEnum("mode_paiement_personnel", [
  "orange_money",
  "mtn_momo",
  "virement",
  "especes",
  "banque",
]);

export const bulletinStatutEnum = pgEnum("bulletin_statut", [
  "brouillon",
  "valide",
  "paye",
]);

export const composanteTypeEnum = pgEnum("composante_type", [
  "avantage",
  "retenue",
]);

export const composanteCalculEnum = pgEnum("composante_calcul", [
  "fixe",
  "pourcentage",
]);

export const avancePersonnelStatutEnum = pgEnum("avance_personnel_statut", [
  "en_cours",
  "rembourse",
]);

export const avancePersonnelPlanEnum = pgEnum("avance_personnel_plan", [
  "integral",
  "mensuel",
  "reporte",
]);

export const ligneBulletinTypeEnum = pgEnum("ligne_bulletin_type", [
  "avantage",
  "retenue",
]);

// ─── Table personnel ──────────────────────────────────────────────────────────

export const personnelTable = pgTable("personnel", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  poste: text("poste").notNull(),
  roleSysteme: text("role_systeme"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  dateNaissance: date("date_naissance"),
  adresse: text("adresse"),
  contactUrgenceNom: text("contact_urgence_nom"),
  contactUrgenceTelephone: text("contact_urgence_telephone"),
  notesRh: text("notes_rh"),
  typeContrat: typeContratEnum("type_contrat").notNull().default("cdi"),
  dateEmbauche: date("date_embauche").notNull(),
  dateFinContrat: date("date_fin_contrat"),
  salaireBaseFcfa: integer("salaire_base_fcfa").notNull(),
  sursalaireFcfa: integer("sursalaire_fcfa").notNull().default(0),
  numeroCnps: text("numero_cnps"),
  numeroCni: text("numero_cni"),
  modePaiement: modePaiementPersonnelEnum("mode_paiement")
    .notNull()
    .default("especes"),
  telephonePaiement: text("telephone_paiement"),
  ribBanque: text("rib_banque"),
  statut: personnelStatutEnum("statut").notNull().default("actif"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Personnel = typeof personnelTable.$inferSelect;

// ─── Table composantes_salaire ────────────────────────────────────────────────
// Catalogue des composantes de salaire (avantages/retenues)
// Pour les pourcentages, valeur est stockée * 100 (ex : 320 = 3,20 %)

export const composantesSalaireTable = pgTable("composantes_salaire", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  libelle: text("libelle").notNull(),
  type: composanteTypeEnum("type").notNull(),
  calcul: composanteCalculEnum("calcul").notNull().default("fixe"),
  valeur: integer("valeur").notNull().default(0),
  obligatoire: boolean("obligatoire").notNull().default(false),
});

export type ComposanteSalaire = typeof composantesSalaireTable.$inferSelect;

// ─── Table bulletins_paie ────────────────────────────────────────────────────

export const bulletinsPaieTable = pgTable("bulletins_paie", {
  id: serial("id").primaryKey(),
  personnelId: integer("personnel_id")
    .notNull()
    .references(() => personnelTable.id),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  periode: text("periode").notNull(),
  salaireBaseFcfa: integer("salaire_base_fcfa").notNull(),
  totalAvantagesFcfa: integer("total_avantages_fcfa").notNull().default(0),
  totalRetenuesFcfa: integer("total_retenues_fcfa").notNull().default(0),
  salaireBrutFcfa: integer("salaire_brut_fcfa").notNull(),
  salaireNetFcfa: integer("salaire_net_fcfa").notNull(),
  // Charges patronales (info employeur, non déduites du net salarié)
  chargesCnpsPatronaleFcfa: integer("charges_cnps_patronale_fcfa")
    .notNull()
    .default(0),
  chargesTaxeApprentissageFcfa: integer("charges_taxe_apprentissage_fcfa")
    .notNull()
    .default(0),
  chargesFpcFcfa: integer("charges_fpc_fcfa").notNull().default(0),
  coutTotalEmployeurFcfa: integer("cout_total_employeur_fcfa").notNull(),
  statut: bulletinStatutEnum("statut").notNull().default("brouillon"),
  dateValidation: timestamp("date_validation", { withTimezone: true }),
  datePaiement: timestamp("date_paiement", { withTimezone: true }),
  referencePaiement: text("reference_paiement"),
  payePar: integer("paye_par").references(() => usersTable.id),
  compteSourceType: text("compte_source_type"),
  compteSourceId: integer("compte_source_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BulletinPaie = typeof bulletinsPaieTable.$inferSelect;

// ─── Table lignes_bulletin ────────────────────────────────────────────────────

export const lignesBulletinTable = pgTable("lignes_bulletin", {
  id: serial("id").primaryKey(),
  bulletinId: integer("bulletin_id")
    .notNull()
    .references(() => bulletinsPaieTable.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  type: ligneBulletinTypeEnum("type").notNull(),
  montantFcfa: integer("montant_fcfa").notNull(),
});

export type LigneBulletin = typeof lignesBulletinTable.$inferSelect;

// ─── Table avances_personnel ──────────────────────────────────────────────────

export const avancesPersonnelTable = pgTable("avances_personnel", {
  id: serial("id").primaryKey(),
  personnelId: integer("personnel_id")
    .notNull()
    .references(() => personnelTable.id),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  montantFcfa: integer("montant_fcfa").notNull(),
  dateOctroi: date("date_octroi").notNull(),
  motif: text("motif"),
  statut: avancePersonnelStatutEnum("statut").notNull().default("en_cours"),
  montantRembourse: integer("montant_rembourse").notNull().default(0),
  // Plan de remboursement flexible
  planType: avancePersonnelPlanEnum("plan_type").notNull().default("integral"),
  montantMensuelFcfa: integer("montant_mensuel_fcfa"),
  reportMois: integer("report_mois"),
  reportAnnee: integer("report_annee"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AvancePersonnel = typeof avancesPersonnelTable.$inferSelect;

// ─── Table remboursements_avance ──────────────────────────────────────────────

export const remboursementsAvanceTable = pgTable("remboursements_avance", {
  id: serial("id").primaryKey(),
  avanceId: integer("avance_id")
    .notNull()
    .references(() => avancesPersonnelTable.id, { onDelete: "cascade" }),
  bulletinId: integer("bulletin_id")
    .references(() => bulletinsPaieTable.id, { onDelete: "set null" }),
  montantFcfa: integer("montant_fcfa").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type RemboursementAvance = typeof remboursementsAvanceTable.$inferSelect;

// ─── Table config_paie ────────────────────────────────────────────────────────
// Taux légaux configurables par coopérative (CNPS, ITS, taxe apprentissage, FPC)
// Taux stockés ×100 (ex: 320 = 3,20%)

export const configPaieTable = pgTable("config_paie", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .unique()
    .references(() => cooperativesTable.id),

  // CNPS salariale (retenue sur le salarié)
  cnpsSalarialeActif: boolean("cnps_salariale_actif").notNull().default(true),
  cnpsSalarialeTaux: integer("cnps_salariale_taux").notNull().default(320),     // 3,20%
  cnpsPlafondAnnuel: integer("cnps_plafond_annuel").notNull().default(1647315),

  // CNPS patronale retraite (charge employeur)
  cnpsPatronaleActif: boolean("cnps_patronale_actif").notNull().default(true),
  cnpsPatronaleTaux: integer("cnps_patronale_taux").notNull().default(770),      // 7,70% — Retraite

  // CNPS PF – Prestations Familiales (charge employeur)
  cnpsPfTaux: integer("cnps_pf_taux").notNull().default(575),                    // 5,75%

  // CNPS AT/MP – accident de travail (charge employeur)
  cnpsAtmpActif: boolean("cnps_atmp_actif").notNull().default(true),
  cnpsAtmpTaux: integer("cnps_atmp_taux").notNull().default(200),                // 2,00%

  // ITS – Impôt sur Traitement et Salaires (barème progressif fixe)
  itsActif: boolean("its_actif").notNull().default(true),

  // Taxe d'apprentissage (charge employeur)
  taxeApprentissageActif: boolean("taxe_apprentissage_actif").notNull().default(true),
  taxeApprentissageTaux: integer("taxe_apprentissage_taux").notNull().default(50),  // 0,50%

  // FPC – Formation professionnelle continue (charge employeur)
  fpcActif: boolean("fpc_actif").notNull().default(true),
  fpcTaux: integer("fpc_taux").notNull().default(120),                           // 1,20%

  // Prime d'ancienneté
  ancienneteActif: boolean("anciennete_actif").notNull().default(true),

  // SMIG – Salaire Minimum Interprofessionnel Garanti (CI)
  smigFcfa: integer("smig_fcfa").notNull().default(75_000),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConfigPaie = typeof configPaieTable.$inferSelect;
