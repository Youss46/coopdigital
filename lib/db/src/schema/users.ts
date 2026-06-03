import { pgTable, serial, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "agent_terrain",
  "auditeur",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("agent_terrain"),
  actif: boolean("actif").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
