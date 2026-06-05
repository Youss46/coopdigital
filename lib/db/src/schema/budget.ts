import {
  pgTable, pgEnum, serial, integer, numeric, varchar, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";

export const budgetStatutEnum = pgEnum("budget_statut", ["brouillon", "valide", "cloture"]);
export const budgetCategorieEnum = pgEnum("budget_categorie", [
  "recette",
  "charge_achat",
  "charge_exploitation",
  "charge_personnel",
  "charge_financiere",
  "investissement",
]);

export const budgetsCampagneTable = pgTable("budgets_campagne", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:     integer("campagne_id").notNull().references(() => campagnesTable.id),
  statut:         budgetStatutEnum("statut").notNull().default("brouillon"),
  validePar:      integer("valide_par").references(() => usersTable.id),
  dateValidation: timestamp("date_validation", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lignesBudgetTable = pgTable("lignes_budget", {
  id:                      serial("id").primaryKey(),
  budgetId:                integer("budget_id").notNull().references(() => budgetsCampagneTable.id),
  categorie:               budgetCategorieEnum("categorie").notNull(),
  libelle:                 varchar("libelle", { length: 200 }).notNull(),
  montantPrevisionnelFcfa: numeric("montant_previsionnel_fcfa", { precision: 16, scale: 2 }).notNull().default("0"),
  montantRealiseFcfa:      numeric("montant_realise_fcfa",      { precision: 16, scale: 2 }).notNull().default("0"),
  ecartFcfa:               numeric("ecart_fcfa",                { precision: 16, scale: 2 }),
  ecartPct:                numeric("ecart_pct",                 { precision: 8,  scale: 4 }),
  ordre:                   integer("ordre").notNull().default(0),
  createdAt:               timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hypothesesBudgetTable = pgTable("hypotheses_budget", {
  id:                      serial("id").primaryKey(),
  budgetId:                integer("budget_id").notNull().references(() => budgetsCampagneTable.id),
  tonnagePrevisionnelKg:   numeric("tonnage_previsionnel_kg",  { precision: 14, scale: 2 }),
  prixAchatMoyenFcfa:      numeric("prix_achat_moyen_fcfa",   { precision: 10, scale: 2 }),
  prixVenteMoyenFcfa:      numeric("prix_vente_moyen_fcfa",   { precision: 10, scale: 2 }),
  nbMembresActifs:         integer("nb_membres_actifs"),
  nbLivraisonsEstimees:    integer("nb_livraisons_estimees"),
  margebruteEstimeeFcfa:   numeric("marge_brute_estimee_fcfa", { precision: 16, scale: 2 }),
});

export const insertBudgetSchema = createInsertSchema(budgetsCampagneTable).omit({
  id: true, createdAt: true, updatedAt: true, statut: true, validePar: true, dateValidation: true,
});
export const insertLigneBudgetSchema = createInsertSchema(lignesBudgetTable).omit({
  id: true, createdAt: true, ecartFcfa: true, ecartPct: true, montantRealiseFcfa: true,
});
export const insertHypothesesSchema = createInsertSchema(hypothesesBudgetTable).omit({
  id: true, margebruteEstimeeFcfa: true,
});

export type BudgetCampagne = typeof budgetsCampagneTable.$inferSelect;
export type LigneBudget    = typeof lignesBudgetTable.$inferSelect;
export type HypotheseBudget = typeof hypothesesBudgetTable.$inferSelect;
export type InsertBudget   = z.infer<typeof insertBudgetSchema>;
