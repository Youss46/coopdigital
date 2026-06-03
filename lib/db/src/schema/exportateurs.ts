import { pgTable, serial, integer, text, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { lotsTable } from "./lots";

export const exportateursTable = pgTable("exportateurs", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  contact: text("contact"),
  ville: text("ville"),
  agrementNumero: text("agrement_numero"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const venteStatutEnum = pgEnum("vente_statut", ["en_attente", "partiel", "regle", "en_retard"]);

export const ventesExportateursTable = pgTable("ventes_exportateurs", {
  id: serial("id").primaryKey(),
  exportateurId: integer("exportateur_id").notNull().references(() => exportateursTable.id),
  lotId: integer("lot_id").references(() => lotsTable.id),
  poidsKg: numeric("poids_kg", { precision: 10, scale: 2 }).notNull(),
  prixUnitaireFcfa: integer("prix_unitaire_fcfa").notNull(),
  montantTotalFcfa: integer("montant_total_fcfa").notNull(),
  dateVente: date("date_vente").notNull(),
  dateEcheanceReglement: date("date_echeance_reglement"),
  montantRecuFcfa: integer("montant_recu_fcfa").notNull().default(0),
  soldeDuFcfa: integer("solde_du_fcfa").notNull(),
  statut: venteStatutEnum("statut").notNull().default("en_attente"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertExportateurSchema = createInsertSchema(exportateursTable).omit({ id: true, createdAt: true });
export const insertVenteSchema = createInsertSchema(ventesExportateursTable).omit({
  id: true,
  montantTotalFcfa: true,
  montantRecuFcfa: true,
  soldeDuFcfa: true,
  statut: true,
  createdAt: true,
});
export type InsertExportateur = z.infer<typeof insertExportateurSchema>;
export type InsertVente = z.infer<typeof insertVenteSchema>;
export type Exportateur = typeof exportateursTable.$inferSelect;
export type VenteExportateur = typeof ventesExportateursTable.$inferSelect;
