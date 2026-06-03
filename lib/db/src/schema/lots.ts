import { pgTable, serial, integer, numeric, text, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";
import { cooperativesTable } from "./cooperatives";
import { livraisonsTable } from "./livraisons";

export const parcellesTable = pgTable("parcelles", {
  id: serial("id").primaryKey(),
  membreId: integer("membre_id").notNull().references(() => membresTable.id),
  superficieHa: numeric("superficie_ha", { precision: 8, scale: 2 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  village: text("village"),
  culturePrincipale: text("culture_principale").notNull().default("cacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lotStatutEnum = pgEnum("lot_statut", ["en_stock", "vendu", "transit"]);

export const lotsTable = pgTable("lots", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
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
