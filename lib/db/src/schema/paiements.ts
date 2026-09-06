import { pgTable, serial, integer, text, boolean, numeric, timestamp, pgEnum, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { livraisonsTable } from "./livraisons";
import { membresTable } from "./membres";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";
import { bonsCarburantTable } from "./transport";
import { depensesVehiculeTable } from "./transport";
import { cooperativesTable } from "./cooperatives";

export const modePaiementEnum = pgEnum("mode_paiement", [
  "orange_money",
  "mtn_momo",
  "especes",
  "wave",
  "cheque",
  "virement",
  "carte_producteur",
]);

export const paiementStatutEnum = pgEnum("paiement_statut", [
  "en_attente",
  "confirme",
  "echec",
  "rejete",
  "en_cours",
  "effectue",
]);

export const paiementsTable = pgTable("paiements", {
  id: serial("id").primaryKey(),
  /** Coopérative propriétaire, utilisée pour la numérotation locale des reçus. */
  cooperativeId: integer("cooperative_id").references(() => cooperativesTable.id),
  livraisonId: integer("livraison_id")
    .references(() => livraisonsTable.id, { onDelete: "cascade" }),
  bonCarburantId: integer("bon_carburant_id")
    .references(() => bonsCarburantTable.id, { onDelete: "set null" }),
  depenseVehiculeId: integer("depense_vehicule_id")
    .references(() => depensesVehiculeTable.id, { onDelete: "set null" })
    .unique(),
  membreId: integer("membre_id")
    .references(() => membresTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),

  // Enrichissements règlement achat
  numeroRecu: text("numero_recu"),
  libelle: text("libelle"),
  modeReglement: text("mode_reglement"),
  montantAPayerFcfa: numeric("montant_a_payer_fcfa", { precision: 12, scale: 2 }),
  montantVerseFcfa: numeric("montant_verse_fcfa", { precision: 12, scale: 2 }),
  resteAPayerFcfa: numeric("reste_a_payer_fcfa", { precision: 12, scale: 2 }),

  // Champs existants
  montantFcfa: integer("montant_fcfa").notNull(),
  modePaiement: modePaiementEnum("mode_paiement"),
  referenceTransaction: text("reference_transaction"),
  statut: paiementStatutEnum("statut").notNull().default("en_attente"),
  recuEnvoyeWhatsapp: boolean("recu_envoye_whatsapp").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  // Validation / rejet
  validePar: integer("valide_par").references(() => usersTable.id),
  dateValidation: timestamp("date_validation", { withTimezone: true }),
  motifRejet: text("motif_rejet"),
  initialisePar: integer("initialise_par").references(() => usersTable.id),
  /** Utilisateur réellement connecté ayant saisi l'opération (mode proxy gérant) */
  agentSaisiseurId: integer("agent_saisiseur_id").references(() => usersTable.id),
}, (table) => [
  unique("paiements_cooperative_numero_recu_unique").on(table.cooperativeId, table.numeroRecu),
  check(
    "paiements_cooperative_numero_recu_check",
    sql`${table.cooperativeId} IS NULL OR ${table.numeroRecu} IS NOT NULL`,
  ),
  check(
    "paiements_confirmes_date_validation_check",
    sql`${table.statut} NOT IN ('confirme', 'effectue') OR ${table.dateValidation} IS NOT NULL`,
  ),
]);

export const insertPaiementSchema = createInsertSchema(paiementsTable).omit({
  id: true,
  resteAPayerFcfa: true,
  createdAt: true,
});
export type InsertPaiement = z.infer<typeof insertPaiementSchema>;
export type Paiement = typeof paiementsTable.$inferSelect;
