import { pgTable, serial, integer, varchar, numeric, text, date, timestamp } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const chargesDiversesTable = pgTable("charges_diverses", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  dateCharge:     date("date_charge", { mode: "string" }).notNull(),
  libelle:        varchar("libelle", { length: 255 }).notNull(),
  description:    text("description"),
  montantFcfa:    numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  ppsiTauxPct:    numeric("ppsi_taux_pct", { precision: 5, scale: 2 }),
  retenuePpsiFcfa: integer("retenue_ppsi_fcfa").notNull().default(0),
  montantNetFcfa: integer("montant_net_fcfa"),
  categorie:      varchar("categorie", { length: 50 }).notNull().default("autre"),
  compteDebit:    varchar("compte_debit", { length: 20 }).notNull().default("6580"),
  compteCredit:        varchar("compte_credit", { length: 20 }).notNull().default("571"),
  compteTresorerieId:  integer("compte_tresorerie_id"),
  compteTresorerieType:varchar("compte_tresorerie_type", { length: 20 }),
  modePaiement:        varchar("mode_paiement", { length: 30 }).notNull().default("especes"),
  tiers:          varchar("tiers", { length: 255 }),
  referencePiece: varchar("reference_piece", { length: 100 }),
  statut:         varchar("statut", { length: 20 }).notNull().default("brouillon"),
  createdBy:      integer("created_by").references(() => usersTable.id),
  approvedBy:     integer("approved_by").references(() => usersTable.id),
  approvedAt:     timestamp("approved_at", { withTimezone: true }),
  montantRegleFcfa: integer("montant_regle_fcfa").notNull().default(0),
  dateReglement:  date("date_reglement", { mode: "string" }),
  reglePar:       integer("regle_par").references(() => usersTable.id),
  compteReglementId:   integer("compte_reglement_id"),
  compteReglementType: varchar("compte_reglement_type", { length: 20 }),
  referenceReglement:  varchar("reference_reglement", { length: 100 }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ChargeDiverses = typeof chargesDiversesTable.$inferSelect;
