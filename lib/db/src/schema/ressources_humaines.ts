import {
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { personnelTable } from "./salaires";
import { usersTable } from "./users";

export const rhContratsTable = pgTable("rh_contrats", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  type: varchar("type", { length: 30 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  dateSignature: date("date_signature"),
  statut: varchar("statut", { length: 20 }).notNull().default("actif"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("rh_contrats_coop_personnel_idx").on(table.cooperativeId, table.personnelId),
  index("rh_contrats_date_fin_idx").on(table.cooperativeId, table.dateFin),
]);

export const rhDocumentsTable = pgTable("rh_documents", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  type: varchar("type", { length: 40 }).notNull(),
  titre: varchar("titre", { length: 180 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  dateDocument: date("date_document"),
  dateExpiration: date("date_expiration"),
  url: text("url"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("rh_documents_coop_personnel_idx").on(table.cooperativeId, table.personnelId),
  index("rh_documents_expiration_idx").on(table.cooperativeId, table.dateExpiration),
]);

export const rhCongesTable = pgTable("rh_conges", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  type: varchar("type", { length: 30 }).notNull().default("annuel"),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  jours: integer("jours").notNull(),
  motif: text("motif"),
  statut: varchar("statut", { length: 20 }).notNull().default("demande"),
  demandeurId: integer("demandeur_id").references(() => usersTable.id),
  validePar: integer("valide_par").references(() => usersTable.id),
  valideAt: timestamp("valide_at", { withTimezone: true }),
  commentaireValidation: text("commentaire_validation"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("rh_conges_coop_personnel_idx").on(table.cooperativeId, table.personnelId),
  index("rh_conges_statut_idx").on(table.cooperativeId, table.statut),
]);

export const rhAbsencesTable = pgTable("rh_absences", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  personnelId: integer("personnel_id").notNull().references(() => personnelTable.id),
  type: varchar("type", { length: 30 }).notNull().default("justifiee"),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  jours: integer("jours").notNull(),
  motif: text("motif"),
  justificatifUrl: text("justificatif_url"),
  statut: varchar("statut", { length: 20 }).notNull().default("signalee"),
  validePar: integer("valide_par").references(() => usersTable.id),
  valideAt: timestamp("valide_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("rh_absences_coop_personnel_idx").on(table.cooperativeId, table.personnelId),
  index("rh_absences_statut_idx").on(table.cooperativeId, table.statut),
]);

export const rhHistoriqueTable = pgTable("rh_historique", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  personnelId: integer("personnel_id").references(() => personnelTable.id),
  entite: varchar("entite", { length: 40 }).notNull(),
  entiteId: integer("entite_id"),
  action: varchar("action", { length: 40 }).notNull(),
  details: jsonb("details"),
  faitPar: integer("fait_par").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("rh_historique_coop_idx").on(table.cooperativeId, table.createdAt),
  index("rh_historique_personnel_idx").on(table.cooperativeId, table.personnelId),
]);

export type RhContrat = typeof rhContratsTable.$inferSelect;
export type RhDocument = typeof rhDocumentsTable.$inferSelect;
export type RhConge = typeof rhCongesTable.$inferSelect;
export type RhAbsence = typeof rhAbsencesTable.$inferSelect;
export type RhHistorique = typeof rhHistoriqueTable.$inferSelect;