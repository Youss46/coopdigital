import { pgTable, serial, integer, varchar, numeric, boolean, timestamp, date } from "drizzle-orm/pg-core";

export const comptesBancairesTable = pgTable("comptes_bancaires", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull(),
  nom:                  varchar("nom", { length: 200 }).notNull(),
  banque:               varchar("banque", { length: 100 }).notNull(),
  numeroCompte:         varchar("numero_compte", { length: 50 }),
  iban:                 varchar("iban", { length: 50 }),
  soldeActuelFcfa:      numeric("solde_actuel_fcfa").notNull().default("0"),
  soldeMiniAlerteFcfa:  numeric("solde_mini_alerte_fcfa").notNull().default("0"),
  actif:                boolean("actif").notNull().default(true),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mouvementsBanqueTable = pgTable("mouvements_banque", {
  id:             serial("id").primaryKey(),
  compteId:       integer("compte_id").notNull(),
  cooperativeId:  integer("cooperative_id").notNull(),
  type:           varchar("type", { length: 10 }).notNull(),   // credit | debit
  motif:          varchar("motif", { length: 50 }).notNull(),
  montantFcfa:    numeric("montant_fcfa").notNull(),
  libelle:        varchar("libelle", { length: 300 }),
  reference:      varchar("reference", { length: 100 }),
  dateOperation:  date("date_operation", { mode: "string" }).notNull(),
  dateValeur:     date("date_valeur", { mode: "string" }),
  soldeApresFcfa: numeric("solde_apres_fcfa"),
  rapproche:      boolean("rapproche").notNull().default(false),
  enregistrePar:  integer("enregistre_par"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CompteBancaire = typeof comptesBancairesTable.$inferSelect;
export type MouvementBanque = typeof mouvementsBanqueTable.$inferSelect;
