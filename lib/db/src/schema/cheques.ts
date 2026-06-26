import { pgTable, serial, integer, varchar, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const statutChequeEnum = pgEnum("statut_cheque", ["emis", "encaisse", "rejete", "annule"]);

export const chequesEmisTable = pgTable("cheques_emis", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull(),
  numeroCheque:     varchar("numero_cheque", { length: 50 }),
  beneficiaire:     varchar("beneficiaire", { length: 200 }).notNull(),
  montantFcfa:      integer("montant_fcfa").notNull(),
  compteBancaireId: integer("compte_bancaire_id"),
  paiementId:       integer("paiement_id"),
  membreId:         integer("membre_id"),
  livraisonId:      integer("livraison_id"),
  dateEmission:     date("date_emission", { mode: "string" }).notNull(),
  dateEcheance:     date("date_echeance", { mode: "string" }),
  statut:           statutChequeEnum("statut").notNull().default("emis"),
  dateEncaissement: date("date_encaissement", { mode: "string" }),
  dateRejet:        date("date_rejet", { mode: "string" }),
  motifRejet:       text("motif_rejet"),
  motifAnnulation:  text("motif_annulation"),
  mouvementBanqueId: integer("mouvement_banque_id"),
  createdBy:        integer("created_by"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChequeEmis = typeof chequesEmisTable.$inferSelect;
