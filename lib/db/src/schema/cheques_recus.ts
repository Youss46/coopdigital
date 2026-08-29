import { pgTable, serial, integer, varchar, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { exportateursTable, ventesExportateursTable } from "./exportateurs";
import { paiementsTable } from "./paiements";
import { paiementLignesTable } from "./paiement_lignes";

export const statutChequeRecuEnum = pgEnum("statut_cheque_recu", [
  "a_deposer",
  "depose",
  "encaisse",
  "rejete",
  "annule",
]);

/**
 * Chèques remis par un exportateur à la coopérative.
 * Ce cycle est volontairement indépendant de cheques_emis : les transitions
 * et les comptes comptables ne sont pas les mêmes.
 */
export const chequesRecusTable = pgTable("cheques_recus", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  numeroCheque: varchar("numero_cheque", { length: 80 }).notNull(),
  banque: varchar("banque", { length: 200 }).notNull(),
  montantFcfa: integer("montant_fcfa").notNull(),
  dateReception: date("date_reception", { mode: "string" }).notNull(),
  dateEcheance: date("date_echeance", { mode: "string" }),
  statut: statutChequeRecuEnum("statut").notNull().default("a_deposer"),
  dateDepot: date("date_depot", { mode: "string" }),
  dateEncaissement: date("date_encaissement", { mode: "string" }),
  dateRejet: date("date_rejet", { mode: "string" }),
  motifRejet: text("motif_rejet"),
  dateAnnulation: date("date_annulation", { mode: "string" }),
  motifAnnulation: text("motif_annulation"),
  compteBancaireId: integer("compte_bancaire_id"),
  mouvementBanqueId: integer("mouvement_banque_id"),
  venteExportateurId: integer("vente_exportateur_id")
    .notNull()
    .references(() => ventesExportateursTable.id),
  exportateurId: integer("exportateur_id")
    .notNull()
    .references(() => exportateursTable.id),
  paiementId: integer("paiement_id").references(() => paiementsTable.id),
  paiementLigneId: integer("paiement_ligne_id").references(() => paiementLignesTable.id),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChequeRecu = typeof chequesRecusTable.$inferSelect;