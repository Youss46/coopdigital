import {
  pgTable, serial, integer, numeric, text, boolean,
  date, timestamp, varchar,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";
import { membresTable } from "./membres";

// ─── Balances ─────────────────────────────────────────────────────────────────

export const balancesTable = pgTable("balances", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  numeroSerie:              varchar("numero_serie", { length: 100 }),
  marque:                   varchar("marque", { length: 100 }),
  capaciteMaxKg:            numeric("capacite_max_kg", { precision: 10, scale: 2 }),
  precisionG:               numeric("precision_g", { precision: 8, scale: 1 }),
  site:                     varchar("site", { length: 200 }),
  dateAcquisition:          date("date_acquisition", { mode: "string" }),
  dateDerniereVerification: date("date_derniere_verification", { mode: "string" }),
  dateProchainVerification: date("date_prochaine_verification", { mode: "string" }),
  statut:                   varchar("statut", { length: 30 }).notNull().default("active"),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Balance = typeof balancesTable.$inferSelect;
export type InsertBalance = typeof balancesTable.$inferInsert;

// ─── Config pesée ─────────────────────────────────────────────────────────────

export const configPeseeTable = pgTable("config_pesee", {
  id:                         serial("id").primaryKey(),
  cooperativeId:              integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  ecartMaxAutorisePct:        numeric("ecart_max_autorise_pct", { precision: 5, scale: 2 }).default("2"),
  seuilDoublePeseeKg:         numeric("seuil_double_pesee_kg", { precision: 10, scale: 2 }).default("500"),
  toleranceBalanceG:          numeric("tolerance_balance_g", { precision: 8, scale: 1 }).default("500"),
  frequenceVerificationJours: integer("frequence_verification_jours").default(90),
  updatedAt:                  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConfigPesee = typeof configPeseeTable.$inferSelect;

// ─── Vérifications balance ────────────────────────────────────────────────────

export const verificationsBalanceTable = pgTable("verifications_balance", {
  id:                   serial("id").primaryKey(),
  balanceId:            integer("balance_id").notNull().references(() => balancesTable.id),
  dateVerification:     date("date_verification", { mode: "string" }).notNull(),
  verificateur:         varchar("verificateur", { length: 200 }),
  resultat:             varchar("resultat", { length: 30 }).notNull().default("conforme"),
  ecartMesureG:         numeric("ecart_mesure_g", { precision: 8, scale: 1 }),
  observations:         text("observations"),
  prochaineVerification: date("prochaine_verification", { mode: "string" }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type VerificationBalance = typeof verificationsBalanceTable.$inferSelect;

// ─── Litiges pesée ────────────────────────────────────────────────────────────

export const litigesPeseeTable = pgTable("litiges_pesee", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  livraisonId:              integer("livraison_id").notNull(),
  membreId:                 integer("membre_id").references(() => membresTable.id),
  dateLitige:               date("date_litige", { mode: "string" }).notNull(),
  poidsContesteKg:          numeric("poids_conteste_kg", { precision: 10, scale: 3 }),
  poidsRevendiqueMembre:    numeric("poids_revendique_membre_kg", { precision: 10, scale: 3 }),
  motif:                    varchar("motif", { length: 500 }),
  statut:                   varchar("statut", { length: 30 }).notNull().default("ouvert"),
  decision:                 text("decision"),
  poidsFinalRetenuKg:       numeric("poids_final_retenu_kg", { precision: 10, scale: 3 }),
  differenceFcfa:           numeric("difference_fcfa", { precision: 12, scale: 0 }),
  resoluPar:                integer("resolu_par").references(() => usersTable.id),
  resoluLe:                 timestamp("resolu_le", { withTimezone: true }),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LitigePesee = typeof litigesPeseeTable.$inferSelect;
