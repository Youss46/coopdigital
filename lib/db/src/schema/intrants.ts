import {
  pgTable, pgEnum, serial, integer, numeric, text, boolean, date, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";
import { usersTable } from "./users";
import { campagnesTable } from "./campagnes";

export const categoriesIntrantsTable = pgTable("categories_intrants", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  libelle: text("libelle").notNull(),
  unite: text("unite").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const intrantsTable = pgTable("intrants", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  categorieId: integer("categorie_id").references(() => categoriesIntrantsTable.id),
  nom: text("nom").notNull(),
  description: text("description"),
  unite: text("unite").notNull(),
  prixUnitaireFcfa: numeric("prix_unitaire_fcfa", { precision: 12, scale: 2 }).notNull().default("0"),
  stockActuel: numeric("stock_actuel", { precision: 12, scale: 3 }).notNull().default("0"),
  stockMinimum: numeric("stock_minimum", { precision: 12, scale: 3 }).notNull().default("0"),
  fournisseurIntrant: text("fournisseur_intrant"),
  datePeremption: date("date_peremption", { mode: "string" }),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const approvisionnmentsIntrantsTable = pgTable("approvisionnements_intrants", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  intrantId: integer("intrant_id").notNull().references(() => intrantsTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),
  dateAppro: date("date_appro", { mode: "string" }).notNull(),
  quantite: numeric("quantite", { precision: 12, scale: 3 }).notNull(),
  prixUnitaireFcfa: numeric("prix_unitaire_fcfa", { precision: 12, scale: 2 }).notNull(),
  montantTotalFcfa: numeric("montant_total_fcfa", { precision: 14, scale: 2 }).notNull(),
  fournisseur: text("fournisseur"),
  numeroFacture: text("numero_facture"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const distributionModeEnum = pgEnum("distribution_mode", ["credit", "gratuit", "subventionne"]);
export const remboursementStatutEnum = pgEnum("remboursement_statut", ["non_rembourse", "partiel", "rembourse"]);

export const distributionsIntrantsTable = pgTable("distributions_intrants", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  intrantId: integer("intrant_id").notNull().references(() => intrantsTable.id),
  membreId: integer("membre_id").notNull().references(() => membresTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),
  dateDistribution: date("date_distribution", { mode: "string" }).notNull(),
  quantite: numeric("quantite", { precision: 12, scale: 3 }).notNull(),
  prixUnitaireFcfa: numeric("prix_unitaire_fcfa", { precision: 12, scale: 2 }).notNull(),
  montantFcfa: numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  mode: distributionModeEnum("mode").notNull().default("credit"),
  tauxSubventionPct: numeric("taux_subvention_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  montantMembreFcfa: numeric("montant_membre_fcfa", { precision: 14, scale: 2 }).notNull().default("0"),
  statutRemboursement: remboursementStatutEnum("statut_remboursement").notNull().default("non_rembourse"),
  montantRembourse_fcfa: numeric("montant_rembourse_fcfa", { precision: 14, scale: 2 }).notNull().default("0"),
  agentId: integer("agent_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const remboursementIntrantModeEnum = pgEnum("remboursement_intrant_mode", [
  "deduction_livraison", "especes", "mobile",
]);

export const remboursementsIntrantsTable = pgTable("remboursements_intrants", {
  id: serial("id").primaryKey(),
  distributionId: integer("distribution_id").notNull().references(() => distributionsIntrantsTable.id),
  membreId: integer("membre_id").notNull().references(() => membresTable.id),
  dateRemboursement: date("date_remboursement", { mode: "string" }).notNull(),
  montantFcfa: numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  mode: remboursementIntrantModeEnum("mode").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertIntrantSchema = createInsertSchema(intrantsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertIntrant = z.infer<typeof insertIntrantSchema>;
export type Intrant = typeof intrantsTable.$inferSelect;

export const insertDistributionSchema = createInsertSchema(distributionsIntrantsTable).omit({
  id: true, createdAt: true, montantRembourse_fcfa: true, statutRemboursement: true,
});
export type InsertDistribution = z.infer<typeof insertDistributionSchema>;
export type Distribution = typeof distributionsIntrantsTable.$inferSelect;

export const insertApproSchema = createInsertSchema(approvisionnmentsIntrantsTable).omit({
  id: true, createdAt: true,
});
export type InsertAppro = z.infer<typeof insertApproSchema>;
