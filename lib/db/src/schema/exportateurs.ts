import { pgTable, serial, integer, text, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { lotsTable } from "./lots";
import { campagnesTable } from "./campagnes";

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
  campagneId: integer("campagne_id").references(() => campagnesTable.id),

  // Enrichissements livraison exportateur GESTCOOP
  numeroBonSortie: text("numero_bon_sortie"),
  numeroBonLivraison: text("numero_bon_livraison"),
  numeroRemorqueCamion: text("numero_remorque_camion"),
  typeLivraison: text("type_livraison"),
  produit: text("produit").default("cacao"),
  poidsBrutKg: numeric("poids_brut_kg", { precision: 10, scale: 2 }),
  nombreSacsTotal: integer("nombre_sacs_total"),
  nombreSacsArrives: integer("nombre_sacs_arrives"),
  nombreSacsRefoules: integer("nombre_sacs_refoules").notNull().default(0),
  nombreSacsAcceptes: integer("nombre_sacs_acceptes"),
  poidsRefuleKg: numeric("poids_refoule_kg", { precision: 10, scale: 2 }).default("0"),
  refactionKg: numeric("refaction_kg", { precision: 10, scale: 2 }).default("0"),
  poidsNetAccepteKg: numeric("poids_net_accepte_kg", { precision: 10, scale: 2 }),
  puMiseEnCompteFcfa: numeric("pu_mise_en_compte_fcfa", { precision: 12, scale: 2 }),
  montantMiseEnCompteFcfa: numeric("montant_mise_en_compte_fcfa", { precision: 14, scale: 2 }),
  tauxBic: numeric("taux_bic", { precision: 5, scale: 2 }).default("0"),
  montantBicFcfa: numeric("montant_bic_fcfa", { precision: 14, scale: 2 }),
  montantNetAPayerFcfa: numeric("montant_net_a_payer_fcfa", { precision: 14, scale: 2 }),

  // Champs existants
  poidsKg: numeric("poids_kg", { precision: 10, scale: 2 }).notNull(),
  prixUnitaireFcfa: integer("prix_unitaire_fcfa").notNull(),
  montantTotalFcfa: integer("montant_total_fcfa").notNull(),
  dateVente: date("date_vente", { mode: "string" }).notNull(),
  dateEcheanceReglement: date("date_echeance_reglement", { mode: "string" }),
  montantRecuFcfa: integer("montant_recu_fcfa").notNull().default(0),
  soldeDuFcfa: integer("solde_du_fcfa").notNull(),
  statut: venteStatutEnum("statut").notNull().default("en_attente"),
  deviseFacturation:        text("devise_facturation").notNull().default("XOF"),
  montantDeviseEtrangere:   numeric("montant_devise_etrangere", { precision: 18, scale: 4 }),
  tauxChangeApplique:       numeric("taux_change_applique",     { precision: 18, scale: 6 }),
  montantFcfaConverti:      numeric("montant_fcfa_converti",    { precision: 16, scale: 2 }),
  gainPerteChangeFcfa:      numeric("gain_perte_change_fcfa",   { precision: 16, scale: 2 }),
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
