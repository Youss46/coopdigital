import {
  pgTable, serial, varchar, integer, boolean, text,
  timestamp, date, jsonb, numeric,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";

export const m15UsersTable = pgTable("m15_users", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("support"),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const plansAbonnementTable = pgTable("plans_abonnement", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 50 }).notNull(),
  prix1anFcfa: numeric("prix_1an_fcfa", { precision: 12, scale: 2 }),
  prix2ansFcfa: numeric("prix_2ans_fcfa", { precision: 12, scale: 2 }),
  prix3ansFcfa: numeric("prix_3ans_fcfa", { precision: 12, scale: 2 }),
  prix5ansFcfa: numeric("prix_5ans_fcfa", { precision: 12, scale: 2 }),
  nbMembresMax: integer("nb_membres_max"),
  nbUsersMax: integer("nb_users_max"),
  modulesInclus: text("modules_inclus").array(),
  stockageGo: integer("stockage_go"),
  support: varchar("support", { length: 50 }),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const licencesTable = pgTable("licences", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").references(() => cooperativesTable.id),
  planId: integer("plan_id").references(() => plansAbonnementTable.id),

  cleLicence: varchar("cle_licence", { length: 40 }).notNull().unique(),

  dureeAns: integer("duree_ans").notNull(),
  dateActivation: date("date_activation"),
  dateExpiration: date("date_expiration"),

  renouvellementAuto: boolean("renouvellement_auto").notNull().default(false),
  dateDernierRenouvellement: date("date_dernier_renouvellement"),
  nbRenouvellements: integer("nb_renouvellements").notNull().default(0),

  trialActif: boolean("trial_actif").notNull().default(false),
  dureeTrialJours: integer("duree_trial_jours").notNull().default(30),
  dateFinTrial: date("date_fin_trial"),

  statut: varchar("statut", { length: 20 }).notNull().default("inactive"),

  motifSuspension: text("motif_suspension"),
  dateSuspension: timestamp("date_suspension", { withTimezone: true }),
  suspenduPar: integer("suspendu_par").references(() => m15UsersTable.id),

  motifSuppression: text("motif_suppression"),
  dateSuppression: timestamp("date_suppression", { withTimezone: true }),
  supprimePar: integer("supprime_par").references(() => m15UsersTable.id),
  donneesArchivees: boolean("donnees_archivees").notNull().default(false),

  montantPayeFcfa: numeric("montant_paye_fcfa", { precision: 12, scale: 2 }),
  modePaiement: varchar("mode_paiement", { length: 50 }),
  referencePaiement: varchar("reference_paiement", { length: 100 }),
  factureUrl: varchar("facture_url", { length: 500 }),

  creePar: integer("cree_par").references(() => m15UsersTable.id),
  notesInternes: text("notes_internes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const historiqueLicencesTable = pgTable("historique_licences", {
  id: serial("id").primaryKey(),
  licenceId: integer("licence_id").references(() => licencesTable.id),
  cooperativeId: integer("cooperative_id").references(() => cooperativesTable.id),
  action: varchar("action", { length: 50 }).notNull(),
  ancienStatut: varchar("ancien_statut", { length: 20 }),
  nouveauStatut: varchar("nouveau_statut", { length: 20 }),
  details: jsonb("details"),
  effectuePar: integer("effectue_par").references(() => m15UsersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type M15User = typeof m15UsersTable.$inferSelect;
export type PlanAbonnement = typeof plansAbonnementTable.$inferSelect;
export type Licence = typeof licencesTable.$inferSelect;
export type HistoriqueLicence = typeof historiqueLicencesTable.$inferSelect;
