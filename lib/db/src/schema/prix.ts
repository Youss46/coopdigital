import { pgTable, pgEnum, serial, integer, numeric, varchar, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const alertePrixTypeEnum = pgEnum("alerte_prix_type", [
  "marge_faible", "prix_bas", "prix_eleve", "variation_forte",
]);

// ─── historique_prix ─────────────────────────────────────────────────────────
export const historiquePrixTable = pgTable("historique_prix", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:           integer("campagne_id").references(() => campagnesTable.id),
  datePrix:             date("date_prix", { mode: "string" }).notNull(),
  prixBordChampFcfa:    numeric("prix_bord_champ_fcfa", { precision: 12, scale: 2 }).notNull(),
  prixVenteExportFcfa:  numeric("prix_vente_export_fcfa", { precision: 12, scale: 2 }).notNull(),
  // DB GENERATED ALWAYS AS (prix_vente_export_fcfa - prix_bord_champ_fcfa) STORED — read-only
  margeBruteKgFcfa:     numeric("marge_brute_kg_fcfa", { precision: 12, scale: 2 }),
  source:               varchar("source", { length: 100 }).default("manuel"),
  saisiPar:             integer("saisi_par").references(() => usersTable.id),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertHistoriquePrixSchema = createInsertSchema(historiquePrixTable).omit({
  id: true, margeBruteKgFcfa: true, createdAt: true,
});
export type InsertHistoriquePrix = z.infer<typeof insertHistoriquePrixSchema>;
export type HistoriquePrix = typeof historiquePrixTable.$inferSelect;

// ─── alertes_prix ────────────────────────────────────────────────────────────
export const alertesPrixTable = pgTable("alertes_prix", {
  id:                  serial("id").primaryKey(),
  cooperativeId:       integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  type:                alertePrixTypeEnum("type").notNull(),
  seuilConfigure:      numeric("seuil_configure", { precision: 12, scale: 2 }),
  valeurDeclenchante:  numeric("valeur_declenchante", { precision: 12, scale: 2 }),
  message:             varchar("message", { length: 500 }),
  lu:                  boolean("lu").notNull().default(false),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAlertePrixSchema = createInsertSchema(alertesPrixTable).omit({
  id: true, createdAt: true,
});
export type InsertAlertePrix = z.infer<typeof insertAlertePrixSchema>;
export type AlertePrix = typeof alertesPrixTable.$inferSelect;

// ─── config_prix ─────────────────────────────────────────────────────────────
export const configPrixTable = pgTable("config_prix", {
  id:                         serial("id").primaryKey(),
  cooperativeId:              integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  seuilMargeMinimumFcfa:      numeric("seuil_marge_minimum_fcfa", { precision: 12, scale: 2 }).default("100"),
  seuilVariationAlertePct:    numeric("seuil_variation_alerte_pct", { precision: 5, scale: 2 }).default("10"),
  diffusionAutoSms:           boolean("diffusion_auto_sms").notNull().default(false),
  updatedAt:                  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConfigPrixSchema = createInsertSchema(configPrixTable).omit({
  id: true, updatedAt: true,
});
export type InsertConfigPrix = z.infer<typeof insertConfigPrixSchema>;
export type ConfigPrix = typeof configPrixTable.$inferSelect;
