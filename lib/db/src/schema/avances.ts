import { pgTable, serial, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";
import { usersTable } from "./users";

export const avanceStatutEnum = pgEnum("avance_statut", ["en_cours", "rembourse", "en_retard"]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAvanceSchema = createInsertSchema(avancesTable).omit({
  id: true,
  montantRembourse_fcfa: true,
  soldeRestantFcfa: true,
  createdAt: true,
});
export type InsertAvance = z.infer<typeof insertAvanceSchema>;
export type Avance = typeof avancesTable.$inferSelect;
