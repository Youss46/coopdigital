import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { cooperativesTable } from "./cooperatives";
import { livraisonsTable } from "./livraisons";

export const caissesDeleguesTable = pgTable("caisses_delegues", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").notNull().references(() => usersTable.id),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  solde:         numeric("solde", { precision: 14, scale: 2 }).notNull().default("0"),
  plafond:       numeric("plafond", { precision: 14, scale: 2 }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mouvementsCaisseDelegueTable = pgTable("mouvements_caisse_delegue", {
  id:              serial("id").primaryKey(),
  caisseDelegueId: integer("caisse_delegue_id").notNull().references(() => caissesDeleguesTable.id),
  type:            text("type").notNull(), // 'approvisionnement' | 'paiement_collecte' | 'regularisation'
  montantFcfa:     numeric("montant_fcfa", { precision: 14, scale: 2 }).notNull(),
  soldeApresFcfa:  numeric("solde_apres_fcfa", { precision: 14, scale: 2 }).notNull(),
  livraisonId:     integer("livraison_id").references(() => livraisonsTable.id),
  note:            text("note"),
  createdById:     integer("created_by_id").references(() => usersTable.id),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
