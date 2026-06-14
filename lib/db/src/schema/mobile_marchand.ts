import { pgTable, serial, integer, varchar, numeric, boolean, timestamp, date, pgEnum } from "drizzle-orm/pg-core";

export const operateurMobileEnum = pgEnum("operateur_mobile", ["wave", "orange_money", "mtn_momo"]);

export const comptesMobilesMarchandsTable = pgTable("comptes_mobiles_marchands", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull(),
  nom:                  varchar("nom", { length: 200 }).notNull(),
  operateur:            operateurMobileEnum("operateur").notNull(),
  numeroMarchand:       varchar("numero_marchand", { length: 50 }),
  soldeActuelFcfa:      numeric("solde_actuel_fcfa").notNull().default("0"),
  soldeMiniAlerteFcfa:  numeric("solde_mini_alerte_fcfa").notNull().default("0"),
  actif:                boolean("actif").notNull().default(true),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mouvementsMobileMarchandTable = pgTable("mouvements_mobile_marchand", {
  id:             serial("id").primaryKey(),
  compteId:       integer("compte_id").notNull(),
  cooperativeId:  integer("cooperative_id").notNull(),
  type:           varchar("type", { length: 10 }).notNull(),
  motif:          varchar("motif", { length: 50 }).notNull(),
  montantFcfa:    numeric("montant_fcfa").notNull(),
  libelle:        varchar("libelle", { length: 300 }),
  reference:      varchar("reference", { length: 100 }),
  dateOperation:  date("date_operation", { mode: "string" }).notNull(),
  soldeApresFcfa: numeric("solde_apres_fcfa"),
  enregistrePar:  integer("enregistre_par"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CompteMobileMarchand = typeof comptesMobilesMarchandsTable.$inferSelect;
export type MouvementMobileMarchand = typeof mouvementsMobileMarchandTable.$inferSelect;
