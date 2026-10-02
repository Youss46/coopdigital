import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
  text,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { exportateursTable, ventesExportateursTable } from "./exportateurs";
import { statutChequeRecuEnum } from "./cheques_recus";

export const avancesExportateursTable = pgTable("avances_exportateurs", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  exportateurId: integer("exportateur_id").notNull().references(() => exportateursTable.id),
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
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("avances_exportateurs_montant_positive_check", sql`${table.montantFcfa} > 0`),
  uniqueIndex("avances_exportateurs_coop_numero_unique")
    .on(table.cooperativeId, table.numeroCheque),
]);

export const imputationsAvancesExportateursTable = pgTable("imputations_avances_exportateurs", {
  id: serial("id").primaryKey(),
  avanceExportateurId: integer("avance_exportateur_id")
    .notNull()
    .references(() => avancesExportateursTable.id),
  venteExportateurId: integer("vente_exportateur_id")
    .notNull()
    .references(() => ventesExportateursTable.id),
  montantFcfa: integer("montant_fcfa").notNull(),
  montantRestitueFcfa: integer("montant_restitue_fcfa").notNull().default(0),
  dateRestitution: date("date_restitution", { mode: "string" }),
  dateImputation: date("date_imputation", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("imputations_avances_exportateurs_montant_positive", sql`${table.montantFcfa} > 0`),
  check(
    "imputations_avances_exportateurs_restitution_borne_check",
    sql`${table.montantRestitueFcfa} >= 0 and ${table.montantRestitueFcfa} <= ${table.montantFcfa}`,
  ),
  index("imputations_avances_exportateurs_avance_idx").on(table.avanceExportateurId),
  index("imputations_avances_exportateurs_vente_idx").on(table.venteExportateurId),
]);