import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cooperativesTable = pgTable("cooperatives", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  ville: text("ville").notNull(),
  region: text("region").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCooperativeSchema = createInsertSchema(cooperativesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCooperative = z.infer<typeof insertCooperativeSchema>;
export type Cooperative = typeof cooperativesTable.$inferSelect;
