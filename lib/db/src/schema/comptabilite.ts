import { pgTable, pgEnum, serial, integer, varchar, date, timestamp } from "drizzle-orm/pg-core";

export const typeCompteEnum = pgEnum("type_compte", ["actif", "passif", "charge", "produit"]);
export const sourceEcritureEnum = pgEnum("source_ecriture", ["livraison", "vente", "avance", "paiement", "manuel"]);
export const statutExerciceEnum = pgEnum("statut_exercice", ["ouvert", "cloture"]);

export const planComptableTable = pgTable("plan_comptable", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  numeroCompte: varchar("numero_compte", { length: 20 }).notNull(),
  libelle: varchar("libelle", { length: 200 }).notNull(),
  type: typeCompteEnum("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ecrituresComptablesTable = pgTable("ecritures_comptables", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  dateEcriture: date("date_ecriture").notNull(),
  numeroPiece: varchar("numero_piece", { length: 50 }),
  libelle: varchar("libelle", { length: 300 }).notNull(),
  compteDebit: varchar("compte_debit", { length: 20 }).notNull(),
  compteCredit: varchar("compte_credit", { length: 20 }).notNull(),
  montantFcfa: integer("montant_fcfa").notNull(),
  source: sourceEcritureEnum("source").notNull(),
  sourceId: integer("source_id"),
  exercice: integer("exercice").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exercicesTable = pgTable("exercices", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  annee: integer("annee").notNull(),
  statut: statutExerciceEnum("statut").notNull().default("ouvert"),
  dateOuverture: timestamp("date_ouverture", { withTimezone: true }).notNull().defaultNow(),
  dateCloture: timestamp("date_cloture", { withTimezone: true }),
});
