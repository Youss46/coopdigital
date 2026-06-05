import { pgTable, serial, integer, text, boolean, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";

export const fournisseurTypeEnum = pgEnum("fournisseur_type", ["membre", "pisteur", "externe"]);

export const fournisseursTable = pgTable("fournisseurs", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  typeFournisseur: fournisseurTypeEnum("type_fournisseur").notNull(),
  membreId: integer("membre_id").references(() => membresTable.id),
  code: text("code").unique(),
  nom: text("nom").notNull(),
  prenoms: text("prenoms"),
  sexe: text("sexe"),
  dateNaissance: date("date_naissance", { mode: "string" }),
  lieuNaissance: text("lieu_naissance"),
  nationalite: text("nationalite").default("Ivoirienne"),
  numeroCni: text("numero_cni"),
  telephone: text("telephone"),
  section: text("section"),
  origine: text("origine"),
  dateAdhesion: date("date_adhesion", { mode: "string" }),
  photoUrl: text("photo_url"),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertFournisseurSchema = createInsertSchema(fournisseursTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  code: true,
});
export type InsertFournisseur = z.infer<typeof insertFournisseurSchema>;
export type Fournisseur = typeof fournisseursTable.$inferSelect;
