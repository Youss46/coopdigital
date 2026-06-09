import { pgTable, serial, integer, numeric, text, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { cooperativesTable } from "./cooperatives";
import { livraisonsTable } from "./livraisons";
import { caissesTable } from "./caisse";

export const caissesDeleguesTable = pgTable("caisses_delegues", {
  id:                    serial("id").primaryKey(),
  userId:                integer("user_id").notNull().references(() => usersTable.id),
  cooperativeId:         integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  solde:                 numeric("solde", { precision: 14, scale: 2 }).notNull().default("0"),
  plafond:               numeric("plafond", { precision: 14, scale: 2 }),
  plafondJournalierFcfa: numeric("plafond_journalier_fcfa", { precision: 14, scale: 2 }).default("0"),
  necessiteValidation:   boolean("necessite_validation").default(false),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mouvementsCaisseDelegueTable = pgTable("mouvements_caisse_delegue", {
  id:              serial("id").primaryKey(),
  caisseDelegueId: integer("caisse_delegue_id").notNull().references(() => caissesDeleguesTable.id),
  type:            text("type").notNull(),
  montantFcfa:     numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  soldeApresFcfa:  numeric("solde_apres_fcfa", { precision: 14, scale: 2 }).notNull(),
  livraisonId:     integer("livraison_id").references(() => livraisonsTable.id),
  note:            text("note"),
  createdById:     integer("created_by_id").references(() => usersTable.id),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alimentationsCaisseDelegueTable = pgTable("alimentations_caisse_delegue", {
  id:              serial("id").primaryKey(),
  cooperativeId:   integer("cooperative_id").notNull(),
  caisseDelegueId: integer("caisse_delegue_id").notNull().references(() => caissesDeleguesTable.id),
  caisseSourceId:  integer("caisse_source_id").references(() => caissesTable.id),
  montantFcfa:     numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  motif:           varchar("motif", { length: 300 }),
  statut:          varchar("statut", { length: 20 }).notNull().default("confirme"),
  envoyePar:       integer("envoye_par").references(() => usersTable.id),
  dateEnvoi:       timestamp("date_envoi", { withTimezone: true }).defaultNow(),
  notes:           text("notes"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
