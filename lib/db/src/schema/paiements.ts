import { pgTable, serial, integer, text, boolean, numeric, timestamp, pgEnum, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { livraisonsTable } from "./livraisons";
import { membresTable } from "./membres";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";
import { bonsCarburantTable } from "./transport";

export const modePaiementEnum = pgEnum("mode_paiement", [
  "orange_money",
  "mtn_momo",
  "especes",
  "wave",
  "cheque",
  "virement",
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
  livraisonId: integer("livraison_id")
    .references(() => livraisonsTable.id, { onDelete: "cascade" }),
  bonCarburantId: integer("bon_carburant_id")
    .references(() => bonsCarburantTable.id, { onDelete: "set null" }),
  membreId: integer("membre_id")
    .references(() => membresTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),

  // Enrichissements règlement achat
  numeroRecu: text("numero_recu").unique(),
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
