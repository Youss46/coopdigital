import { pgTable, serial, integer, varchar, numeric, date, text, timestamp } from "drizzle-orm/pg-core";

// ─── Relevés bancaires ────────────────────────────────────────────────────────

export const relevesBancairesTable = pgTable("releves_bancaires", {
  id:              serial("id").primaryKey(),
  cooperativeId:   integer("cooperative_id").notNull(),
  banque:          varchar("banque", { length: 100 }),
  numeroCompte:    varchar("numero_compte", { length: 50 }),
  periodeDebut:    date("periode_debut"),
  periodeFin:      date("periode_fin"),
  soldeDebutFcfa:  numeric("solde_debut_fcfa").default("0"),
  soldeFinFcfa:    numeric("solde_fin_fcfa").default("0"),
  statut:          varchar("statut", { length: 20 }).notNull().default("importe"),
  importePar:      integer("importe_par"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Lignes de relevé ─────────────────────────────────────────────────────────

export const lignesReleveTable = pgTable("lignes_releve", {
  id:                    serial("id").primaryKey(),
  releveId:              integer("releve_id").notNull(),
  dateOperation:         date("date_operation").notNull(),
  libelleBanque:         varchar("libelle_banque", { length: 500 }).notNull(),
  montantFcfa:           numeric("montant_fcfa").notNull(),
  type:                  varchar("type", { length: 10 }).notNull(),
  referenceBanque:       varchar("reference_banque", { length: 200 }),
  statutReconciliation:  varchar("statut_reconciliation", { length: 20 }).notNull().default("non_reconciliee"),
  ecritureId:            integer("ecriture_id"),
  ecartFcfa:             numeric("ecart_fcfa").notNull().default("0"),
  motifIgnore:           text("motif_ignore"),
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
