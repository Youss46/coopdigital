import { pgTable, serial, integer, text, date } from "drizzle-orm/pg-core";
import { paiementsTable, modePaiementEnum } from "./paiements";

/**
 * Détail des moyens réellement utilisés pour un règlement.
 * Un paiement mono-mode possède également une ligne afin de conserver
 * une lecture uniforme de l'historique.
 */
export const paiementLignesTable = pgTable("paiement_lignes", {
  id: serial("id").primaryKey(),
  paiementId: integer("paiement_id")
    .notNull()
    .references(() => paiementsTable.id, { onDelete: "cascade" }),
  modePaiement: modePaiementEnum("mode_paiement").notNull(),
  montantFcfa: integer("montant_fcfa").notNull(),
  referenceTransaction: text("reference_transaction"),
  telephone: text("telephone"),
  numeroCheque: text("numero_cheque"),
  banque: text("banque"),
  dateEcheance: date("date_echeance", { mode: "string" }),
});

export type PaiementLigne = typeof paiementLignesTable.$inferSelect;