import { pgTable, serial, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { commissionsDeleguesTable } from "./commissions_delegues";

export const avanceDelegueStatutEnum = pgEnum("avance_delegue_statut", ["en_cours", "rembourse", "en_retard"]);
export const avanceDeleaguePlanTypeEnum = pgEnum("avance_delegue_plan_type", ["integral", "partiel", "reporte"]);

// ─── Avances accordées aux délégués de localité ──────────────────────────────
// Séparées des avances membres : remboursement par retenue sur commission
// (pas sur livraison). Un délégué peut avoir plusieurs avances en cours.
export const avancesDeleguesTable = pgTable("avances_delegues", {
  id:                   serial("id").primaryKey(),
  delegueId:            integer("delegue_id").notNull().references(() => usersTable.id),
  montantOctroyeFcfa:   integer("montant_octroye_fcfa").notNull(),
  montantRembourse:     integer("montant_rembourse_fcfa").notNull().default(0),
  soldeRestantFcfa:     integer("solde_restant_fcfa").notNull(),
  dateOctroi:           date("date_octroi").notNull(),
  dateEcheance:         date("date_echeance"),
  motif:                text("motif"),
  statut:               avanceDelegueStatutEnum("statut").notNull().default("en_cours"),
  agentId:              integer("agent_id").references(() => usersTable.id),
  // Plan de retenue sur commission
  planType:             avanceDeleaguePlanTypeEnum("plan_type").notNull().default("integral"),
  montantPartielFcfa:   integer("montant_partiel_fcfa"),  // si planType = "partiel"
  cooperativeId:        integer("cooperative_id").notNull(),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Historique remboursements ────────────────────────────────────────────────
export const remboursementsAvancesDeleguesTable = pgTable("remboursements_avances_delegues", {
  id:           serial("id").primaryKey(),
  avanceId:     integer("avance_id").notNull().references(() => avancesDeleguesTable.id, { onDelete: "cascade" }),
  commissionId: integer("commission_id").references(() => commissionsDeleguesTable.id, { onDelete: "set null" }),
  montantFcfa:  integer("montant_fcfa").notNull(),
  note:         text("note"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AvanceDelegue             = typeof avancesDeleguesTable.$inferSelect;
export type RemboursementAvanceDelegue = typeof remboursementsAvancesDeleguesTable.$inferSelect;
