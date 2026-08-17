import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { livraisonsTable } from "./livraisons";
import { transfertsStockTable } from "./entrepots_delegues";
import { mouvementsCaisseDelegueTable } from "./caisses_delegues";

// ─── Taux de commission par coopérative / campagne / délégué ──────────────
// - campagneId null  = valide pour toutes les campagnes (taux par défaut)
// - delegueId  null  = taux par défaut de la coopérative (s'applique à tous)
// Priorité de résolution : (coop + campagne + délégué) > (coop + campagne) > (coop)
export const tauxCommissionsDeleguesTable = pgTable("taux_commissions_delegues", {
  id:              serial("id").primaryKey(),
  cooperativeId:   integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:      integer("campagne_id").references(() => campagnesTable.id),
  delegueId:       integer("delegue_id").references(() => usersTable.id),
  tauxFcfaParKg:   numeric("taux_fcfa_par_kg", { precision: 10, scale: 4 }).notNull(),
  dateDebut:       date("date_debut", { mode: "string" }).notNull(),
  dateFin:         date("date_fin", { mode: "string" }),
  actif:           boolean("actif").notNull().default(true),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Commission gagnée par livraison ou par transfert pesé ───────────────
// - livraisonId : commission terrain (ancien comportement — conservé pour rétrocompat)
// - transfertId  : commission sur poids net après pesée physique au central (nouveau)
// Une seule des deux colonnes est renseignée à la fois.
export const commissionsDeleguesTable = pgTable("commissions_delegues", {
  id:              serial("id").primaryKey(),
  delegueId:       integer("delegue_id").notNull().references(() => usersTable.id),
  livraisonId:     integer("livraison_id").references(() => livraisonsTable.id), // nullable
  transfertId:     integer("transfert_id").references(() => transfertsStockTable.id), // nouveau
  campagneId:      integer("campagne_id").references(() => campagnesTable.id),
  tauxFcfaParKg:   numeric("taux_fcfa_par_kg", { precision: 10, scale: 4 }).notNull(),
  poidsKg:         numeric("poids_kg", { precision: 10, scale: 2 }).notNull(),
  montantFcfa:     numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  // en_attente | payé | annulé
  statut:             text("statut").notNull().default("en_attente"),
  datePaiement:       timestamp("date_paiement", { withTimezone: true }),
  mouvementId:        integer("mouvement_id").references(() => mouvementsCaisseDelegueTable.id),
  // Moyen de paiement utilisé lors du versement (especes, virement, cheque, orange_money, mtn_momo, wave)
  modePaiement:       text("moyen_paiement"),
  referencePaiement:  text("reference_paiement"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TauxCommission      = typeof tauxCommissionsDeleguesTable.$inferSelect;
export type CommissionDelegue   = typeof commissionsDeleguesTable.$inferSelect;
