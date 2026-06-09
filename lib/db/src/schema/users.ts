import { pgTable, serial, text, boolean, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";

export const USER_ROLES = [
  "pca",
  "directeur",
  "comptable",
  "magasinier",
  "responsable_tracabilite",
  "delegue",
  "auditeur",
  "agent_terrain",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  email: text("email").unique().notNull(),
  telephone: varchar("telephone", { length: 20 }),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 30 }).$type<UserRole>().notNull().default("delegue"),
  section: text("section"),
  zoneType: varchar("zone_type", { length: 20 }),
  zoneNom: text("zone_nom"),
  zoneVillages: text("zone_villages"),
  actif: boolean("actif").notNull().default(true),
  motDePasseTemporaire: boolean("mot_de_passe_temporaire").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
