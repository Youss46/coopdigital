import { pgTable, serial, integer, varchar, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";

/**
 * Correspondance entre la position collective interne et le compte détaillé
 * utilisé lors d'un transfert vers Sage. Les écritures historiques continuent
 * de porter 401/4091/etc.; cette table ne modifie pas le plan comptable interne.
 */
export const comptesTiersTable = pgTable("comptes_tiers", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id, { onDelete: "cascade" }),
  tiersType: varchar("tiers_type", { length: 30 }).notNull(),
  tiersId: integer("tiers_id").notNull(),
  compteCollectif: varchar("compte_collectif", { length: 20 }).notNull(),
  numeroCompte: varchar("numero_compte", { length: 20 }).notNull(),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("comptes_tiers_coop_tiers_collectif_unique")
    .on(t.cooperativeId, t.tiersType, t.tiersId, t.compteCollectif),
  unique("comptes_tiers_coop_numero_unique")
    .on(t.cooperativeId, t.numeroCompte),
  index("comptes_tiers_coop_tiers_idx")
    .on(t.cooperativeId, t.tiersType, t.tiersId),
]);

export type CompteTiers = typeof comptesTiersTable.$inferSelect;
export type InsertCompteTiers = typeof comptesTiersTable.$inferInsert;