import {
  pgTable, serial, integer, numeric, text, boolean,
  date, timestamp, varchar, pgEnum,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";
import { membresTable } from "./membres";
import { fournisseursTable } from "./fournisseurs";

// ─── Sessions de pesée ────────────────────────────────────────────────────────

export const sessionPeseeStatutEnum = pgEnum("session_pesee_statut", ["en_cours", "terminee", "annulee"]);

export const sessionsPeseeTable = pgTable("sessions_pesee", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  numeroSession:  varchar("numero_session", { length: 30 }).notNull(),
  membreId:       integer("membre_id").references(() => membresTable.id),
  fournisseurId:  integer("fournisseur_id").references(() => fournisseursTable.id),
  produit:        varchar("produit", { length: 100 }).notNull().default("cacao"),
  operation:      varchar("operation", { length: 50 }).notNull().default("reception"),
  peseurId:       integer("peseur_id").references(() => usersTable.id),
  balanceId:      integer("balance_id"),
  statut:         sessionPeseeStatutEnum("statut").notNull().default("en_cours"),
  poidsTotalKg:   numeric("poids_total_kg", { precision: 12, scale: 3 }).notNull().default("0"),
  nbSacsTotal:    integer("nb_sacs_total").notNull().default(0),
  notes:          text("notes"),
  livraisonId:    integer("livraison_id"),
  /** Pour les sessions de type 'reception_transfert' : ID du transfert concerné */
  transfertId:    integer("transfert_id"),
  /** Certification du cacao déclarée par le peseur : 'RA' | 'FAIRTRADE' | 'ASR_1000' | 'ORDINAIRE' */
  certificationCacao: varchar("certification_cacao", { length: 20 }),
  dateDebut:      timestamp("date_debut", { withTimezone: true }).defaultNow().notNull(),
  dateFin:        timestamp("date_fin", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SessionPesee = typeof sessionsPeseeTable.$inferSelect;

export const lignesPeseeTable = pgTable("lignes_pesee", {
  id:             serial("id").primaryKey(),
  sessionId:      integer("session_id").notNull().references(() => sessionsPeseeTable.id),
  numeroPassage:  integer("numero_passage").notNull(),
  nbSacs:         integer("nb_sacs").notNull().default(0),
  poidsBrutKg:    numeric("poids_brut_kg", { precision: 10, scale: 3 }).notNull(),
  tareKg:         numeric("tare_kg", { precision: 10, scale: 3 }).default("0"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LignePesee = typeof lignesPeseeTable.$inferSelect;

// ─── Balances ─────────────────────────────────────────────────────────────────

export const balancesTable = pgTable("balances", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  numeroSerie:              varchar("numero_serie", { length: 100 }),
  marque:                   varchar("marque", { length: 100 }),
  capaciteMaxKg:            numeric("capacite_max_kg", { precision: 10, scale: 2 }),
  precisionG:               numeric("precision_g", { precision: 8, scale: 1 }),
  site:                     varchar("site", { length: 200 }),
  dateAcquisition:          date("date_acquisition", { mode: "string" }),
  dateDerniereVerification: date("date_derniere_verification", { mode: "string" }),
  dateProchainVerification: date("date_prochaine_verification", { mode: "string" }),
  statut:                   varchar("statut", { length: 30 }).notNull().default("active"),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Balance = typeof balancesTable.$inferSelect;
export type InsertBalance = typeof balancesTable.$inferInsert;

// ─── Config pesée ─────────────────────────────────────────────────────────────

export const configPeseeTable = pgTable("config_pesee", {
  id:                         serial("id").primaryKey(),
  cooperativeId:              integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  ecartMaxAutorisePct:        numeric("ecart_max_autorise_pct", { precision: 5, scale: 2 }).default("2"),
  seuilDoublePeseeKg:         numeric("seuil_double_pesee_kg", { precision: 10, scale: 2 }).default("500"),
  toleranceBalanceG:          numeric("tolerance_balance_g", { precision: 8, scale: 1 }).default("500"),
  frequenceVerificationJours:      integer("frequence_verification_jours").default(90),
  delaiExpirationSessionHeures:    integer("delai_expiration_session_heures").default(8),
  updatedAt:                       timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConfigPesee = typeof configPeseeTable.$inferSelect;

// ─── Vérifications balance ────────────────────────────────────────────────────

export const verificationsBalanceTable = pgTable("verifications_balance", {
  id:                   serial("id").primaryKey(),
  balanceId:            integer("balance_id").notNull().references(() => balancesTable.id),
  dateVerification:     date("date_verification", { mode: "string" }).notNull(),
  verificateur:         varchar("verificateur", { length: 200 }),
  resultat:             varchar("resultat", { length: 30 }).notNull().default("conforme"),
  ecartMesureG:         numeric("ecart_mesure_g", { precision: 8, scale: 1 }),
  observations:         text("observations"),
  prochaineVerification: date("prochaine_verification", { mode: "string" }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type VerificationBalance = typeof verificationsBalanceTable.$inferSelect;

// ─── Litiges pesée ────────────────────────────────────────────────────────────

export const litigesPeseeTable = pgTable("litiges_pesee", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  livraisonId:              integer("livraison_id").notNull(),
  membreId:                 integer("membre_id").references(() => membresTable.id),
  dateLitige:               date("date_litige", { mode: "string" }).notNull(),
  poidsContesteKg:          numeric("poids_conteste_kg", { precision: 10, scale: 3 }),
  poidsRevendiqueMembre:    numeric("poids_revendique_membre_kg", { precision: 10, scale: 3 }),
  motif:                    varchar("motif", { length: 500 }),
  statut:                   varchar("statut", { length: 30 }).notNull().default("ouvert"),
  decision:                 text("decision"),
  poidsFinalRetenuKg:       numeric("poids_final_retenu_kg", { precision: 10, scale: 3 }),
  differenceFcfa:           numeric("difference_fcfa", { precision: 12, scale: 0 }),
  resoluPar:                integer("resolu_par").references(() => usersTable.id),
  resoluLe:                 timestamp("resolu_le", { withTimezone: true }),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LitigePesee = typeof litigesPeseeTable.$inferSelect;
