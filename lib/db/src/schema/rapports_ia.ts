import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";

export const rapportsIaTable = pgTable("rapports_ia", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),
  titre: text("titre").notNull(),
  sections: jsonb("sections").$type<string[]>().notNull().default([]),
  contenu: text("contenu").notNull(),
  generePar: integer("genere_par").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RapportIA = typeof rapportsIaTable.$inferSelect;
