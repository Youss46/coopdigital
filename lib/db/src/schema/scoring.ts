import {
  pgTable, serial, integer, numeric, varchar, text, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";
import { campagnesTable } from "./campagnes";

// ─── scores_membres ───────────────────────────────────────────────────────────
export const scoresMembreTable = pgTable("scores_membres", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  membreId:             integer("membre_id").notNull().references(() => membresTable.id),
  campagneId:           integer("campagne_id").notNull().references(() => campagnesTable.id),
  scoreVolume:          numeric("score_volume",          { precision: 6, scale: 2 }),
  scoreQualite:         numeric("score_qualite",         { precision: 6, scale: 2 }),
  scoreRegularite:      numeric("score_regularite",      { precision: 6, scale: 2 }),
  scoreRemboursement:   numeric("score_remboursement",   { precision: 6, scale: 2 }),
  scoreFidelite:        numeric("score_fidelite",        { precision: 6, scale: 2 }),
  scoreCotisation:      numeric("score_cotisation",      { precision: 6, scale: 2 }),
  scoreGlobal:          numeric("score_global",          { precision: 6, scale: 2 }),
  niveau:               varchar("niveau", { length: 20 }),
  rang:                 integer("rang"),
  dateCalcul:           timestamp("date_calcul",  { withTimezone: true }).defaultNow().notNull(),
  createdAt:            timestamp("created_at",   { withTimezone: true }).defaultNow().notNull(),
});

export type ScoreMembre = typeof scoresMembreTable.$inferSelect;

// ─── config_scoring ───────────────────────────────────────────────────────────
export const configScoringTable = pgTable("config_scoring", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  poidsVolumePct:           numeric("poids_volume_pct",           { precision: 5, scale: 2 }).notNull().default("30"),
  poidsQualitePct:          numeric("poids_qualite_pct",          { precision: 5, scale: 2 }).notNull().default("25"),
  poidsRegularitePct:       numeric("poids_regularite_pct",       { precision: 5, scale: 2 }).notNull().default("20"),
  poidsRemboursementPct:    numeric("poids_remboursement_pct",    { precision: 5, scale: 2 }).notNull().default("15"),
  poidsFidelitePct:         numeric("poids_fidelite_pct",         { precision: 5, scale: 2 }).notNull().default("5"),
  poidsCotisationPct:       numeric("poids_cotisation_pct",       { precision: 5, scale: 2 }).notNull().default("5"),
  seuilBronze:              numeric("seuil_bronze",   { precision: 5, scale: 2 }).notNull().default("40"),
  seuilArgent:              numeric("seuil_argent",   { precision: 5, scale: 2 }).notNull().default("60"),
  seuilOr:                  numeric("seuil_or",       { precision: 5, scale: 2 }).notNull().default("75"),
  seuilPlatine:             numeric("seuil_platine",  { precision: 5, scale: 2 }).notNull().default("90"),
  avantagesBronze:          text("avantages_bronze"),
  avantagesArgent:          text("avantages_argent"),
  avantagesOr:              text("avantages_or"),
  avantagesPlatine:         text("avantages_platine"),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConfigScoringSchema = createInsertSchema(configScoringTable).omit({
  id: true, updatedAt: true,
});
export type InsertConfigScoring = z.infer<typeof insertConfigScoringSchema>;
export type ConfigScoring = typeof configScoringTable.$inferSelect;
