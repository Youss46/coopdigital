import { pgTable, serial, integer, text, numeric, boolean, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { ventesExportateursTable } from "./exportateurs";
import { usersTable } from "./users";
import { entrepotsTable } from "./stocks";

export const refusDecisionEnum = pgEnum("refus_decision", [
  "retour_stock",
  "declassement",
  "autre_acheteur",
  "perte",
]);

export const refusStatutEnum = pgEnum("refus_statut", ["en_attente", "traite"]);

export const traitementsRefusTable = pgTable("traitements_refus", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  venteExportateurId: integer("vente_exportateur_id").notNull().references(() => ventesExportateursTable.id),
  dateRefus: date("date_refus", { mode: "string" }).notNull(),
  poidsRefuleKg: numeric("poids_refoule_kg", { precision: 10, scale: 2 }).notNull(),
  nombreSacsRefoules: integer("nombre_sacs_refoules").notNull(),
  motifRefus: text("motif_refus"),
  tauxHumidite: numeric("taux_humidite", { precision: 5, scale: 2 }),
  decision: refusDecisionEnum("decision"),
  entrepotRetourId: integer("entrepot_retour_id").references(() => entrepotsTable.id),
  ancienGrade: text("ancien_grade"),
  nouveauGrade: text("nouveau_grade"),
  nouvelExportateurId: integer("nouvel_exportateur_id"),
  prixUnitaireNouveauFcfa: numeric("prix_unitaire_nouveau_fcfa", { precision: 12, scale: 2 }),
  motifPerte: text("motif_perte"),
  pvConstat: boolean("pv_constat").notNull().default(false),
  statut: refusStatutEnum("statut").notNull().default("en_attente"),
  traitePar: integer("traite_par").references(() => usersTable.id),
  traiteLe: timestamp("traite_le", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTraitementRefusSchema = createInsertSchema(traitementsRefusTable).omit({
  id: true,
  createdAt: true,
  traitePar: true,
  traiteLe: true,
});

export type InsertTraitementRefus = z.infer<typeof insertTraitementRefusSchema>;
export type TraitementRefus = typeof traitementsRefusTable.$inferSelect;
