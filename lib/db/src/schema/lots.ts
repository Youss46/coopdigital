import { pgTable, serial, integer, numeric, text, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { livraisonsTable } from "./livraisons";
import { campagnesTable } from "./campagnes";

export const lotStatutEnum = pgEnum("lot_statut", ["en_stock", "vendu", "transit"]);

export const lotsTable = pgTable("lots", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),
  qrCodeLot: uuid("qr_code_lot").notNull().defaultRandom().unique(),
  statut: lotStatutEnum("statut").notNull().default("en_stock"),
  poidsTotalKg: numeric("poids_total_kg", { precision: 10, scale: 2 }).notNull().default("0"),
  dateCreation: timestamp("date_creation", { withTimezone: true }).defaultNow().notNull(),
  entrepot: text("entrepot"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lotLivraisonsTable = pgTable("lot_livraisons", {
  lotId: integer("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  livraisonId: integer("livraison_id").notNull().references(() => livraisonsTable.id),
});

export const insertLotSchema = createInsertSchema(lotsTable).omit({
  id: true,
  qrCodeLot: true,
  poidsTotalKg: true,
  dateCreation: true,
  createdAt: true,
});
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Lot = typeof lotsTable.$inferSelect;
