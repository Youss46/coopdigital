import { pgTable, serial, integer, text, boolean, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { livraisonsTable } from "./livraisons";
import { membresTable } from "./membres";
import { campagnesTable } from "./campagnes";

export const modePaiementEnum = pgEnum("mode_paiement", [
  "orange_money",
  "mtn_momo",
  "especes",
]);

export const paiementStatutEnum = pgEnum("paiement_statut", [
  "en_attente",
  "confirme",
  "echec",
]);

export const paiementsTable = pgTable("paiements", {
  id: serial("id").primaryKey(),
  livraisonId: integer("livraison_id")
    .notNull()
    .references(() => livraisonsTable.id, { onDelete: "cascade" }),
  membreId: integer("membre_id")
    .notNull()
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
  modePaiement: modePaiementEnum("mode_paiement").notNull().default("especes"),
  referenceTransaction: text("reference_transaction"),
  statut: paiementStatutEnum("statut").notNull().default("en_attente"),
  recuEnvoyeWhatsapp: boolean("recu_envoye_whatsapp").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertPaiementSchema = createInsertSchema(paiementsTable).omit({
  id: true,
  resteAPayerFcfa: true,
  createdAt: true,
});
export type InsertPaiement = z.infer<typeof insertPaiementSchema>;
export type Paiement = typeof paiementsTable.$inferSelect;
