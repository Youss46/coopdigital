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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AvancePersonnel = typeof avancesPersonnelTable.$inferSelect;
