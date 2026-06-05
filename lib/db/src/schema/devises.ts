import {
  pgTable, serial, integer, numeric, varchar, boolean, date, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const devisesTable = pgTable("devises", {
  id:      serial("id").primaryKey(),
  code:    varchar("code", { length: 10 }).notNull().unique(),
  libelle: varchar("libelle", { length: 100 }).notNull(),
  symbole: varchar("symbole", { length: 10 }).notNull(),
  actif:   boolean("actif").notNull().default(true),
});

export const tauxChangeTable = pgTable("taux_change", {
  id:              serial("id").primaryKey(),
  cooperativeId:   integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  deviseSource:    varchar("devise_source", { length: 10 }).notNull(),
  deviseCible:     varchar("devise_cible",  { length: 10 }).notNull().default("XOF"),
  taux:            numeric("taux", { precision: 18, scale: 6 }).notNull(),
  dateApplication: date("date_application", { mode: "string" }).notNull(),
  sourceTaux:      varchar("source_taux", { length: 50 }).notNull().default("manuel"),
  saisiPar:        integer("saisi_par").references(() => usersTable.id),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTauxChangeSchema = createInsertSchema(tauxChangeTable).omit({
  id: true, createdAt: true,
});
export type InsertTauxChange = z.infer<typeof insertTauxChangeSchema>;
export type TauxChange = typeof tauxChangeTable.$inferSelect;
export type Devise = typeof devisesTable.$inferSelect;
