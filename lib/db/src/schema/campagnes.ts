import { pgTable, serial, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";

export const campagneStatutEnum = pgEnum("campagne_statut", ["ouverte", "fermee"]);

export const campagnesTable = pgTable("campagnes", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  libelle: text("libelle").notNull(),
  anneeDebut: integer("annee_debut").notNull(),
  anneeFin: integer("annee_fin").notNull(),
  dateOuverture: date("date_ouverture", { mode: "string" }).notNull(),
  dateFermeture: date("date_fermeture", { mode: "string" }),
  statut: campagneStatutEnum("statut").notNull().default("ouverte"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCampagneSchema = createInsertSchema(campagnesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCampagne = z.infer<typeof insertCampagneSchema>;
export type Campagne = typeof campagnesTable.$inferSelect;
