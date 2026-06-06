import {
  pgTable, serial, integer, numeric, varchar, text, date, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";
import { empruntsTable } from "./emprunts";
import { subventionsTable } from "./subventions";
import { equipementsTable } from "./equipements";

// ─── projets_investissement ───────────────────────────────────────────────────

export const projetsInvestissementTable = pgTable("projets_investissement", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  titre:                varchar("titre", { length: 300 }).notNull(),
  description:          text("description"),
  categorie:            varchar("categorie", { length: 50 }).notNull().default("autre"),
  montantEstimeFcfa:    numeric("montant_estime_fcfa", { precision: 18, scale: 0 }).notNull(),
  montantEngageFcfa:    numeric("montant_engage_fcfa", { precision: 18, scale: 0 }).notNull().default("0"),
  montantRealiseFcfa:   numeric("montant_realise_fcfa", { precision: 18, scale: 0 }).notNull().default("0"),
  sourceFinancement:    varchar("source_financement", { length: 30 }).notNull().default("fonds_propres"),
  empruntId:            integer("emprunt_id").references(() => empruntsTable.id),
  subventionId:         integer("subvention_id").references(() => subventionsTable.id),
  dateDebutPrevue:      date("date_debut_prevue", { mode: "string" }),
  dateFinPrevue:        date("date_fin_prevue", { mode: "string" }),
  dateFinReelle:        date("date_fin_reelle", { mode: "string" }),
  statut:               varchar("statut", { length: 20 }).notNull().default("planifie"),
  priorite:             varchar("priorite", { length: 20 }).notNull().default("normale"),
  responsableId:        integer("responsable_id").references(() => usersTable.id),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProjetInvestissement = typeof projetsInvestissementTable.$inferSelect;
export type InsertProjetInvestissement = typeof projetsInvestissementTable.$inferInsert;

export const insertProjetInvestissementSchema = createInsertSchema(projetsInvestissementTable, {
  titre:             (s) => s.min(2),
  montantEstimeFcfa: (s) => s.refine((v) => Number(v) > 0, "Doit être positif"),
  categorie:         () => z.enum(["infrastructure","equipement","vehicule","informatique","autre"]),
  sourceFinancement: () => z.enum(["fonds_propres","emprunt","subvention","mixte"]),
  statut:            () => z.enum(["planifie","en_cours","termine","suspendu","annule"]),
  priorite:          () => z.enum(["haute","normale","basse"]),
}).omit({ id: true, cooperativeId: true, montantEngageFcfa: true, montantRealiseFcfa: true, createdAt: true, updatedAt: true });

// ─── depenses_investissement ──────────────────────────────────────────────────

export const depensesInvestissementTable = pgTable("depenses_investissement", {
  id:                serial("id").primaryKey(),
  projetId:          integer("projet_id").notNull().references(() => projetsInvestissementTable.id),
  cooperativeId:     integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  dateDepense:       date("date_depense", { mode: "string" }).notNull(),
  libelle:           varchar("libelle", { length: 300 }).notNull(),
  montantFcfa:       numeric("montant_fcfa", { precision: 18, scale: 0 }).notNull(),
  fournisseur:       varchar("fournisseur", { length: 200 }),
  referenceFacture:  varchar("reference_facture", { length: 100 }),
  factureUrl:        varchar("facture_url", { length: 500 }),
  equipementId:      integer("equipement_id").references(() => equipementsTable.id),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DepenseInvestissement = typeof depensesInvestissementTable.$inferSelect;
export type InsertDepenseInvestissement = typeof depensesInvestissementTable.$inferInsert;

export const insertDepenseInvestissementSchema = createInsertSchema(depensesInvestissementTable, {
  libelle:     (s) => s.min(2),
  montantFcfa: (s) => s.refine((v) => Number(v) > 0, "Doit être positif"),
}).omit({ id: true, cooperativeId: true, createdAt: true });
