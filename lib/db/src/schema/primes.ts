import { pgTable, pgEnum, serial, integer, numeric, date, timestamp, text, varchar } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { membresTable } from "./membres";
import { exportateursTable } from "./exportateurs";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const typePrimeEnum = pgEnum("type_prime", [
  "certification_ra",
  "certification_fairtrade",
  "certification_bio",
  "qualite",
  "fidelite",
  "ristourne",
]);

export const statutDistributionEnum = pgEnum("statut_distribution", [
  "brouillon",
  "validee",
  "payee",
]);

export const statutPrimeMembreEnum = pgEnum("statut_prime_membre", [
  "en_attente",
  "paye",
  "annule",
]);

// ── Primes reçues des exportateurs ────────────────────────────────────────────

export const primesReceptionsTable = pgTable("primes_receptions", {
  id:                 serial("id").primaryKey(),
  cooperativeId:      integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:         integer("campagne_id").references(() => campagnesTable.id),
  typePrime:          typePrimeEnum("type_prime").notNull(),
  exportateurId:      integer("exportateur_id").references(() => exportateursTable.id),
  montantTotalFcfa:   integer("montant_total_fcfa").notNull(),
  dateReception:      date("date_reception", { mode: "string" }).notNull(),
  tonnageReferenceKg: numeric("tonnage_reference_kg", { precision: 12, scale: 2 }),
  statut:             text("statut").notNull().default("en_attente"), // en_attente | distribuee | annulee
  notes:              text("notes"),
  createdBy:          integer("created_by"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }),
});

// ── Sessions de redistribution ────────────────────────────────────────────────

export const primesDistributionsTable = pgTable("primes_distributions", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:           integer("campagne_id").references(() => campagnesTable.id),
  primeReceptionId:     integer("prime_reception_id").notNull().references(() => primesReceptionsTable.id, { onDelete: "cascade" }),
  dateDistribution:     date("date_distribution", { mode: "string" }).notNull(),
  tonnageTotalKg:       numeric("tonnage_total_kg", { precision: 12, scale: 2 }).notNull(),
  montantBrutFcfa:      integer("montant_brut_fcfa").notNull(),
  montantFraisFcfa:     integer("montant_frais_fcfa").notNull().default(0),
  montantDistribueFcfa: integer("montant_distribue_fcfa").notNull(),
  statut:               statutDistributionEnum("statut").notNull().default("brouillon"),
  validePar:            integer("valide_par"),
  valideLe:             timestamp("valide_le", { withTimezone: true }),
  notes:                text("notes"),
  createdBy:            integer("created_by"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }),
});

// ── Allocations par membre ─────────────────────────────────────────────────────

export const primesMembresTable = pgTable("primes_membres", {
  id:                    serial("id").primaryKey(),
  cooperativeId:         integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  distributionId:        integer("distribution_id").notNull().references(() => primesDistributionsTable.id, { onDelete: "cascade" }),
  membreId:              integer("membre_id").notNull().references(() => membresTable.id),
  tonnageKg:             numeric("tonnage_kg", { precision: 10, scale: 2 }).notNull(),
  montantBrutFcfa:       integer("montant_brut_fcfa").notNull(),
  deductionAvancesFcfa:  integer("deduction_avances_fcfa").notNull().default(0),
  deductionFraisFcfa:    integer("deduction_frais_fcfa").notNull().default(0),
  montantNetFcfa:        integer("montant_net_fcfa").notNull(),
  statut:                statutPrimeMembreEnum("statut").notNull().default("en_attente"),
  modePaiement:          varchar("mode_paiement", { length: 30 }),
  datePaiement:          date("date_paiement", { mode: "string" }),
  referencePaiement:     varchar("reference_paiement", { length: 100 }),
  payePar:               integer("paye_par"),
  notes:                 text("notes"),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrimeReception   = typeof primesReceptionsTable.$inferSelect;
export type PrimeDistribution = typeof primesDistributionsTable.$inferSelect;
export type PrimeMembre      = typeof primesMembresTable.$inferSelect;
