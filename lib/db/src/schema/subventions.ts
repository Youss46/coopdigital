import {
  pgTable, pgEnum, serial, integer, numeric, varchar, timestamp, boolean, text, date, jsonb,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";

export const baillleurTypeEnum    = pgEnum("bailleur_type",     ["ong","institution","etat","prive"]);
export const subventionStatutEnum = pgEnum("subvention_statut", ["en_attente","actif","cloture","suspendu"]);
export const trancheStatutEnum    = pgEnum("tranche_statut",    ["attendue","recue","en_retard"]);
export const rapportStatutEnum    = pgEnum("rapport_statut",    ["brouillon","soumis","valide"]);

export const bailleursTable = pgTable("bailleurs", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nom:              varchar("nom", { length: 200 }).notNull(),
  type:             baillleurTypeEnum("type").notNull().default("ong"),
  pays:             varchar("pays", { length: 100 }),
  contactNom:       varchar("contact_nom", { length: 150 }),
  contactEmail:     varchar("contact_email", { length: 200 }),
  contactTelephone: varchar("contact_telephone", { length: 50 }),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subventionsTable = pgTable("subventions", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  bailleurId:           integer("bailleur_id").notNull(),
  reference:            varchar("reference", { length: 100 }).notNull(),
  libelle:              varchar("libelle", { length: 300 }).notNull(),
  montantTotalFcfa:     numeric("montant_total_fcfa", { precision: 18, scale: 2 }).notNull(),
  montantRecuFcfa:      numeric("montant_recu_fcfa",  { precision: 18, scale: 2 }).notNull().default("0"),
  montantSoldeFcfa:     numeric("montant_solde_fcfa", { precision: 18, scale: 2 }).notNull().default("0"),
  deviseOrigine:        varchar("devise_origine", { length: 10 }).notNull().default("XOF"),
  montantDeviseOrigine: numeric("montant_devise_origine", { precision: 18, scale: 4 }),
  dateConvention:       date("date_convention"),
  dateDebut:            date("date_debut"),
  dateFin:              date("date_fin"),
  statut:               subventionStatutEnum("statut").notNull().default("en_attente"),
  conditions:           text("conditions"),
  rapportRequis:        boolean("rapport_requis").notNull().default(true),
  periodiciteRapport:   varchar("periodicite_rapport", { length: 30 }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tranchesSubventionTable = pgTable("tranches_subvention", {
  id:                serial("id").primaryKey(),
  subventionId:      integer("subvention_id").notNull(),
  numeroTranche:     integer("numero_tranche").notNull(),
  montantFcfa:       numeric("montant_fcfa", { precision: 18, scale: 2 }).notNull(),
  datePrevue:        date("date_prevue"),
  dateRecue:         date("date_recue"),
  statut:            trancheStatutEnum("statut").notNull().default("attendue"),
  referenceVirement: varchar("reference_virement", { length: 150 }),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lignesBudgetSubventionTable = pgTable("lignes_budget_subvention", {
  id:                 serial("id").primaryKey(),
  subventionId:       integer("subvention_id").notNull(),
  posteBudgetaire:    varchar("poste_budgetaire", { length: 150 }).notNull(),
  montantAlloueFcfa:  numeric("montant_alloue_fcfa",  { precision: 18, scale: 2 }).notNull().default("0"),
  montantUtiliseFcfa: numeric("montant_utilise_fcfa", { precision: 18, scale: 2 }).notNull().default("0"),
  justificatifUrl:    varchar("justificatif_url", { length: 500 }),
});

export const rapportsBailleursTable = pgTable("rapports_bailleurs", {
  id:             serial("id").primaryKey(),
  subventionId:   integer("subvention_id").notNull(),
  cooperativeId:  integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  periode:        varchar("periode", { length: 50 }),
  typeRapport:    varchar("type_rapport", { length: 30 }),
  statut:         rapportStatutEnum("statut").notNull().default("brouillon"),
  dateSoumission: date("date_soumission"),
  contenuJson:    jsonb("contenu_json"),
  pdfUrl:         varchar("pdf_url", { length: 500 }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
