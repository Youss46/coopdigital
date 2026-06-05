import { pgTable, serial, integer, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const liberationsPartsTable = pgTable("liberations_parts", {
  id: serial("id").primaryKey(),
  membreId: integer("membre_id").notNull().references(() => membresTable.id),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  dateVersement: date("date_versement", { mode: "string" }).notNull(),
  codeLiberation: text("code_liberation"),
  versement: text("versement"),
  montantFcfa: integer("montant_fcfa").notNull(),
  agentId: integer("agent_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const configPartsSocialesTable = pgTable("config_parts_sociales", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  valeurNominaleFcfa: integer("valeur_nominale_fcfa").notNull().default(5000),
  nbrePartsMin: integer("nbre_parts_min").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLiberationPartsSchema = createInsertSchema(liberationsPartsTable).omit({
  id: true,
  createdAt: true,
});
export const insertConfigPartsSchema = createInsertSchema(configPartsSocialesTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertLiberationParts = z.infer<typeof insertLiberationPartsSchema>;
export type LiberationParts = typeof liberationsPartsTable.$inferSelect;
export type ConfigPartsSociales = typeof configPartsSocialesTable.$inferSelect;
