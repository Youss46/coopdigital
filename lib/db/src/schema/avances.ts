import { pgTable, serial, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";
import { usersTable } from "./users";
import { livraisonsTable } from "./livraisons";
import { commissionsMembresDelaguesTable } from "./commissions_membres_delegues";

export const avanceStatutEnum = pgEnum("avance_statut", ["en_cours", "rembourse", "en_retard"]);
export const avancePlanTypeEnum = pgEnum("avance_plan_type", ["integral", "partiel", "reporte"]);
export const avanceDeductionSourceEnum = pgEnum("avance_deduction_source", ["livraison", "commission"]);

export const avancesTable = pgTable("avances", {
  id: serial("id").primaryKey(),
  membreId: integer("membre_id")
    .notNull()
    .references(() => membresTable.id),
  montantOctroyeFcfa: integer("montant_octroye_fcfa").notNull(),
  montantRembourse_fcfa: integer("montant_rembourse_fcfa").notNull().default(0),
  soldeRestantFcfa: integer("solde_restant_fcfa").notNull(),
  dateOctroi: date("date_octroi").notNull(),
  dateEcheance: date("date_echeance"),
  motif: text("motif"),
  statut: avanceStatutEnum("statut").notNull().default("en_cours"),
  agentId: integer("agent_id").references(() => usersTable.id),
  /** Utilisateur réellement connecté ayant saisi l'opération (mode proxy gérant) */
  agentSaisiseurId: integer("agent_saisiseur_id").references(() => usersTable.id),
  // Plan de déduction flexible
  planType: avancePlanTypeEnum("plan_type").notNull().default("integral"),
  montantPartielFcfa: integer("montant_partiel_fcfa"),
  reportDate: date("report_date"),
  deductionSource: avanceDeductionSourceEnum("deduction_source").notNull().default("livraison"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Historique des remboursements d'avances membres ────────────────────────

export const remboursementsAvancesMembresTable = pgTable("remboursements_avances_membres", {
  id: serial("id").primaryKey(),
  avanceId: integer("avance_id")
    .notNull()
    .references(() => avancesTable.id, { onDelete: "cascade" }),
  livraisonId: integer("livraison_id")
    .references(() => livraisonsTable.id, { onDelete: "set null" }),
  commissionMembreDelegueId: integer("commission_membre_delegue_id")
    .references(() => commissionsMembresDelaguesTable.id, { onDelete: "set null" }),
  montantFcfa: integer("montant_fcfa").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RemboursementAvanceMembre = typeof remboursementsAvancesMembresTable.$inferSelect;

export const insertAvanceSchema = createInsertSchema(avancesTable).omit({
  id: true,
  montantRembourse_fcfa: true,
  soldeRestantFcfa: true,
  createdAt: true,
});
export type InsertAvance = z.infer<typeof insertAvanceSchema>;
export type Avance = typeof avancesTable.$inferSelect;
