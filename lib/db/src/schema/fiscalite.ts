import { pgTable, serial, integer, varchar, text, numeric, boolean, timestamp, date } from "drizzle-orm/pg-core";

export const obligationsFiscalesTable = pgTable("obligations_fiscales", {
  id:            serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  typeTaxe:      varchar("type_taxe", { length: 30 }).notNull(),
  libelle:       varchar("libelle", { length: 200 }).notNull(),
  baseCalcul:    text("base_calcul"),
  tauxPct:       numeric("taux_pct"),
  periodicite:   varchar("periodicite", { length: 20 }).notNull().default("mensuel"),
  jourEcheance:  integer("jour_echeance"),
  actif:         boolean("actif").notNull().default(true),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const declarationsFiscalesTable = pgTable("declarations_fiscales", {
  id:                  serial("id").primaryKey(),
  cooperativeId:       integer("cooperative_id").notNull(),
  obligationId:        integer("obligation_id").notNull(),
  periode:             varchar("periode", { length: 50 }).notNull(),
  baseImposableFcfa:   numeric("base_imposable_fcfa"),
  montantCalculeFcfa:  numeric("montant_calcule_fcfa").notNull().default("0"),
  montantPayeFcfa:     numeric("montant_paye_fcfa").notNull().default("0"),
  dateEcheance:        date("date_echeance", { mode: "string" }),
  datePaiement:        date("date_paiement", { mode: "string" }),
  referencePaiement:   varchar("reference_paiement", { length: 100 }),
  statut:              varchar("statut", { length: 20 }).notNull().default("a_payer"),
  penaliteRetardFcfa:  numeric("penalite_retard_fcfa").notNull().default("0"),
  documentUrl:         varchar("document_url", { length: 500 }),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
