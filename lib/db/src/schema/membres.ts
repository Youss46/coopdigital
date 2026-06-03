import {
  pgTable, serial, text, integer, numeric, boolean,
  timestamp, date, uuid, pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";

export const membreStatutEnum = pgEnum("membre_statut", ["actif", "inactif"]);

export const membresTable = pgTable("membres", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  numeroCni: text("numero_cni"),
  telephone: text("telephone").notNull(),
  village: text("village"),
  groupement: text("groupement"),
  superficieHa: numeric("superficie_ha", { precision: 8, scale: 2 }).notNull(),
  statut: membreStatutEnum("statut").notNull().default("actif"),
  qrCodeToken: uuid("qr_code_token").notNull().defaultRandom().unique(),
  dateAdhesion: date("date_adhesion").notNull(),
  photoUrl: text("photo_url"),
  parcelleLat: numeric("parcelle_lat", { precision: 10, scale: 7 }),
  parcelleLng: numeric("parcelle_lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMembreSchema = createInsertSchema(membresTable).omit({
  id: true,
  qrCodeToken: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMembre = z.infer<typeof insertMembreSchema>;
export type Membre = typeof membresTable.$inferSelect;
