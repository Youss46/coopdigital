import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { lotsTable } from "./lots";
import { usersTable } from "./users";

export const entrepotsTable = pgTable("entrepots", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  ville: text("ville").notNull(),
  capaciteKg: numeric("capacite_kg", { precision: 10, scale: 2 }).notNull(),
  seuilAlerteKg: numeric("seuil_alerte_kg", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mouvementTypeEnum = pgEnum("mouvement_type", [
  "entree",
  "sortie",
  "retour_refus",
  "declassement",
  "perte",
]);

export const mouvementsStockTable = pgTable("mouvements_stock", {
  id: serial("id").primaryKey(),
  entrepotId: integer("entrepot_id").notNull().references(() => entrepotsTable.id),
  lotId: integer("lot_id").references(() => lotsTable.id),
  type: mouvementTypeEnum("type").notNull(),
  poidsKg: numeric("poids_kg", { precision: 10, scale: 2 }).notNull(),
  prixUnitaireFcfa: numeric("prix_unitaire_fcfa", { precision: 12, scale: 2 }),
  motif: text("motif"),
  agentId: integer("agent_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertEntrepotSchema = createInsertSchema(entrepotsTable).omit({ id: true, createdAt: true });
export const insertMouvementSchema = createInsertSchema(mouvementsStockTable).omit({ id: true, createdAt: true });
export type InsertEntrepot = z.infer<typeof insertEntrepotSchema>;
export type InsertMouvement = z.infer<typeof insertMouvementSchema>;
export type Entrepot = typeof entrepotsTable.$inferSelect;
