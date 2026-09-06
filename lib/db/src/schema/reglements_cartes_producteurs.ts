import { pgTable, serial, integer, varchar, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const statutReglementCarteProducteurEnum = pgEnum("statut_reglement_carte_producteur", [
  "en_attente",
  "paye",
  "rejete",
  "annule",
]);

/**
 * Règlement interne différé effectué avec la carte officielle du producteur.
 * La carte est conservée en snapshot afin que l'historique reste fidèle même
 * si le numéro associé au membre est modifié ultérieurement.
 */
export const reglementsCartesProducteursTable = pgTable("reglements_cartes_producteurs", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  paiementId: integer("paiement_id").notNull(),
  paiementLigneId: integer("paiement_ligne_id").notNull(),
  membreId: integer("membre_id").notNull(),
  livraisonId: integer("livraison_id"),
  numeroCarteSnapshot: varchar("numero_carte_snapshot", { length: 100 }).notNull(),
  beneficiaire: varchar("beneficiaire", { length: 200 }).notNull(),
  montantFcfa: integer("montant_fcfa").notNull(),
  statut: statutReglementCarteProducteurEnum("statut").notNull().default("en_attente"),
  compteBancaireId: integer("compte_bancaire_id"),
  dateCreation: date("date_creation", { mode: "string" }).notNull(),
  datePaiement: date("date_paiement", { mode: "string" }),
  dateRejet: date("date_rejet", { mode: "string" }),
  motifRejet: text("motif_rejet"),
  motifAnnulation: text("motif_annulation"),
  mouvementBanqueId: integer("mouvement_banque_id"),
  createdBy: integer("created_by"),
  paidBy: integer("paid_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReglementCarteProducteur = typeof reglementsCartesProducteursTable.$inferSelect;