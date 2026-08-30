import { pgEnum, pgTable, serial, integer, text, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";
import { membresTable } from "./membres";
import { campagnesTable } from "./campagnes";

export const sacherieMouvementTypeEnum = pgEnum("sacherie_mouvement_type", [
  "entree",
  "attribution",
  "retour",
  "perte",
  "ajustement",
]);

export const sacherieAjustementSensEnum = pgEnum("sacherie_ajustement_sens", [
  "plus",
  "moins",
]);

export const sacherieTypesSacsTable = pgTable("sacherie_types_sacs", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nom: varchar("nom", { length: 120 }).notNull(),
  description: text("description"),
  stockMinimum: integer("stock_minimum").notNull().default(0),
  actif: boolean("actif").notNull().default(true),
  creePar: integer("cree_par").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  cooperativeNomUnique: uniqueIndex("sacherie_types_sacs_cooperative_nom_unique")
    .on(table.cooperativeId, table.nom),
}));

export const sacherieMouvementsTable = pgTable("sacherie_mouvements", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  typeSacId: integer("type_sac_id").notNull().references(() => sacherieTypesSacsTable.id),
  type: sacherieMouvementTypeEnum("type").notNull(),
  sens: sacherieAjustementSensEnum("sens"),
  quantite: integer("quantite").notNull(),
  membreId: integer("membre_id").references(() => membresTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),
  motif: text("motif"),
  reference: varchar("reference", { length: 120 }).notNull(),
  creePar: integer("cree_par").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  cooperativeReferenceUnique: uniqueIndex("sacherie_mouvements_cooperative_reference_unique")
    .on(table.cooperativeId, table.reference),
}));

export type SacherieTypeSac = typeof sacherieTypesSacsTable.$inferSelect;
export type SacherieMouvement = typeof sacherieMouvementsTable.$inferSelect;