import {
  pgTable, pgEnum, serial, integer, numeric, varchar, date, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const preteurTypeEnum = pgEnum("preteur_type", [
  "banque", "microfinance", "bailleur", "prive",
]);

export const empruntPeriodiciteEnum = pgEnum("emprunt_periodicite", [
  "mensuel", "trimestriel", "semestriel", "annuel", "in_fine",
]);

export const empruntStatutEnum = pgEnum("emprunt_statut", [
  "en_cours", "rembourse", "en_retard", "restructure",
]);

export const echeanceStatutEnum = pgEnum("echeance_statut", [
  "a_payer", "paye", "en_retard",
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const preteursTable = pgTable("preteurs", {
  id:            serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  type:          preteurTypeEnum("type").notNull().default("banque"),
  nom:           varchar("nom", { length: 200 }).notNull(),
  contact:       varchar("contact", { length: 200 }),
  ville:         varchar("ville", { length: 100 }),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const empruntsTable = pgTable("emprunts", {
  id:                     serial("id").primaryKey(),
  cooperativeId:          integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  preteurId:              integer("preteur_id").notNull().references(() => preteursTable.id),
  libelle:                varchar("libelle", { length: 300 }).notNull(),
  montantFcfa:            numeric("montant_fcfa", { precision: 16, scale: 2 }).notNull(),
  tauxInteretAnnuelPct:   numeric("taux_interet_annuel_pct", { precision: 7, scale: 4 }).notNull(),
  dureeMois:              integer("duree_mois").notNull(),
  dateDebut:              date("date_debut", { mode: "string" }).notNull(),
  dateEcheance:           date("date_echeance", { mode: "string" }).notNull(),
  periodicite:            empruntPeriodiciteEnum("periodicite").notNull().default("mensuel"),
  montantRembourse:       numeric("montant_rembourse_fcfa", { precision: 16, scale: 2 }).notNull().default("0"),
  soldeRestant:           numeric("solde_restant_fcfa", { precision: 16, scale: 2 }).notNull(),
  statut:                 empruntStatutEnum("statut").notNull().default("en_cours"),
  objet:                  varchar("objet", { length: 300 }),
  garantie:               varchar("garantie", { length: 300 }),
  createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const echeancierEmpruntsTable = pgTable("echeancier_emprunts", {
  id:                  serial("id").primaryKey(),
  empruntId:           integer("emprunt_id").notNull().references(() => empruntsTable.id),
  numeroEcheance:      integer("numero_echeance").notNull(),
  dateEcheance:        date("date_echeance", { mode: "string" }).notNull(),
  capitalFcfa:         numeric("capital_fcfa", { precision: 16, scale: 2 }).notNull(),
  interetFcfa:         numeric("interet_fcfa", { precision: 16, scale: 2 }).notNull(),
  totalEcheanceFcfa:   numeric("total_echeance_fcfa", { precision: 16, scale: 2 }).notNull(),
  statut:              echeanceStatutEnum("statut").notNull().default("a_payer"),
  datePaiement:        date("date_paiement", { mode: "string" }),
  referencePaiement:   varchar("reference_paiement", { length: 100 }),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const remboursementsEmpruntsTable = pgTable("remboursements_emprunts", {
  id:                   serial("id").primaryKey(),
  empruntId:            integer("emprunt_id").notNull().references(() => empruntsTable.id),
  echeanceId:           integer("echeance_id").references(() => echeancierEmpruntsTable.id),
  dateRemboursement:    date("date_remboursement", { mode: "string" }).notNull(),
  montantCapitalFcfa:   numeric("montant_capital_fcfa", { precision: 16, scale: 2 }).notNull().default("0"),
  montantInteretFcfa:   numeric("montant_interet_fcfa", { precision: 16, scale: 2 }).notNull().default("0"),
  montantTotalFcfa:     numeric("montant_total_fcfa", { precision: 16, scale: 2 }).notNull(),
  modePaiement:         varchar("mode_paiement", { length: 100 }),
  reference:            varchar("reference", { length: 100 }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const insertPreteurSchema = createInsertSchema(preteursTable).omit({ id: true, createdAt: true });
export type InsertPreteur = z.infer<typeof insertPreteurSchema>;
export type Preteur = typeof preteursTable.$inferSelect;

export const insertEmpruntSchema = createInsertSchema(empruntsTable).omit({
  id: true, createdAt: true, updatedAt: true,
  montantRembourse: true, soldeRestant: true, statut: true,
});
export type InsertEmprunt = z.infer<typeof insertEmpruntSchema>;
export type Emprunt = typeof empruntsTable.$inferSelect;

export const insertRemboursementEmpruntSchema = createInsertSchema(remboursementsEmpruntsTable).omit({
  id: true, createdAt: true,
});
export type InsertRemboursementEmprunt = z.infer<typeof insertRemboursementEmpruntSchema>;
