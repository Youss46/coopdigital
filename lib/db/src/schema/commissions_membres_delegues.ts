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
import { membresTable } from "./membres";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { sessionsPeseeTable } from "./pesee";

// ─── Taux de commission pour les membres délégués de localités ────────────
// - campagneId null     = valide pour toutes les campagnes (taux par défaut)
// - membreDelegueId null = taux par défaut de la coopérative (s'applique à tous)
// Priorité de résolution : (coop + campagne + membre) > (coop + campagne) > (coop)
export const tauxCommissionsMembresDeleguesTable = pgTable("taux_commissions_membres_delegues", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:       integer("campagne_id").references(() => campagnesTable.id),
  membreDelegueId:  integer("membre_delegue_id").references(() => membresTable.id),
  tauxFcfaParKg:    numeric("taux_fcfa_par_kg", { precision: 10, scale: 4 }).notNull(),
  dateDebut:        date("date_debut", { mode: "string" }).notNull(),
  dateFin:          date("date_fin", { mode: "string" }),
  actif:            boolean("actif").notNull().default(true),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Commission gagnée par session de pesée ───────────────────────────────
// Une commission est créée à chaque clôture de session de pesée
// pour un membre dont categorie_membre = 'délégué de localités'.
export const commissionsMembresDelaguesTable = pgTable("commissions_membres_delegues", {
  id:              serial("id").primaryKey(),
  membreDelegueId: integer("membre_delegue_id").notNull().references(() => membresTable.id),
  sessionPeseeId:  integer("session_pesee_id").references(() => sessionsPeseeTable.id),
  campagneId:      integer("campagne_id").references(() => campagnesTable.id),
  tauxFcfaParKg:   numeric("taux_fcfa_par_kg", { precision: 10, scale: 4 }).notNull(),
  poidsKg:         numeric("poids_kg", { precision: 10, scale: 2 }).notNull(),
  montantFcfa:     numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  // en_attente | payé | annulé
  statut:             text("statut").notNull().default("en_attente"),
  retenueAvancesFcfa: integer("retenue_avances_fcfa").notNull().default(0),
  datePaiement:       timestamp("date_paiement", { withTimezone: true }),
  modePaiement:       text("mode_paiement"),
  referencePaiement:  text("reference_paiement"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TauxCommissionMembreDelegue = typeof tauxCommissionsMembresDeleguesTable.$inferSelect;
export type CommissionMembreDelegue     = typeof commissionsMembresDelaguesTable.$inferSelect;
