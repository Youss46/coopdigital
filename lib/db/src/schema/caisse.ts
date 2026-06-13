import { pgTable, serial, integer, varchar, text, numeric, boolean, timestamp, date, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const caissesTable = pgTable("caisses", {
  id:                      serial("id").primaryKey(),
  cooperativeId:           integer("cooperative_id").notNull(),
  nom:                     varchar("nom", { length: 200 }).notNull(),
  typeCaisse:              varchar("type_caisse", { length: 10 }).notNull().default("centrale"),
  responsableId:           integer("responsable_id"),
  soldeActuelFcfa:         numeric("solde_actuel_fcfa").notNull().default("0"),
  fondCaisseMinimumFcfa:   numeric("fond_caisse_minimum_fcfa").notNull().default("0"),
  actif:                   boolean("actif").notNull().default(true),
  createdAt:               timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsCaisseTable = pgTable("sessions_caisse", {
  id:                              serial("id").primaryKey(),
  caisseId:                        integer("caisse_id").notNull(),
  cooperativeId:                   integer("cooperative_id").notNull(),
  dateSession:                     date("date_session", { mode: "string" }).notNull(),
  ouvertPar:                       integer("ouvert_par"),
  soldeOuvertureFcfa:              numeric("solde_ouverture_fcfa").notNull().default("0"),
  soldeFermetureTheoriqueFcfa:     numeric("solde_fermeture_theorique_fcfa"),
  soldeFermetureReelFcfa:          numeric("solde_fermeture_reel_fcfa"),
  ecartFcfa:                       numeric("ecart_fcfa").generatedAlwaysAs(sql`solde_fermeture_reel_fcfa - solde_fermeture_theorique_fcfa`),
  statut:                          varchar("statut", { length: 20 }).notNull().default("ouverte"),
  fermePar:                        integer("ferme_par"),
  heureOuverture:                  timestamp("heure_ouverture", { withTimezone: true }).defaultNow(),
  heureFermeture:                  timestamp("heure_fermeture", { withTimezone: true }),
  observations:                    text("observations"),
  createdAt:                       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mouvementsCaisseTable = pgTable("mouvements_caisse", {
  id:                  serial("id").primaryKey(),
  caisseId:            integer("caisse_id").notNull(),
  sessionId:           integer("session_id").notNull(),
  cooperativeId:       integer("cooperative_id").notNull(),
  type:                varchar("type", { length: 10 }).notNull(),
  motif:               varchar("motif", { length: 50 }).notNull(),
  montantFcfa:         numeric("montant_fcfa").notNull(),
  libelle:             varchar("libelle", { length: 300 }),
  referenceOperation:  varchar("reference_operation", { length: 100 }),
  soldeApresFcfa:      numeric("solde_apres_fcfa"),
  enregistrePar:       integer("enregistre_par"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
