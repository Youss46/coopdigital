import {
  pgTable, serial, integer, varchar, text, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { m15UsersTable } from "./saas";

export const sacherieResponsibleModes = ["magasinier", "sacherie", "les_deux"] as const;
export type SacherieResponsibleMode = typeof sacherieResponsibleModes[number];

export const cooperativeSacherieConfigTable = pgTable(
  "cooperative_sacherie_config",
  {
    id: serial("id").primaryKey(),
    cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
    responsibleMode: varchar("responsible_mode", { length: 20 }).notNull().default("les_deux"),
    updatedBy: integer("updated_by").references(() => m15UsersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cooperative_sacherie_config_coop_uq").on(t.cooperativeId),
  ],
);

export const cooperativeSacherieConfigHistoryTable = pgTable(
  "cooperative_sacherie_config_history",
  {
    id: serial("id").primaryKey(),
    cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
    previousMode: varchar("previous_mode", { length: 20 }),
    newMode: varchar("new_mode", { length: 20 }).notNull(),
    reason: text("reason"),
    changedBy: integer("changed_by").references(() => m15UsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cooperative_sacherie_config_history_coop_idx").on(t.cooperativeId, t.createdAt),
  ],
);

export type CooperativeSacherieConfig = typeof cooperativeSacherieConfigTable.$inferSelect;
export type CooperativeSacherieConfigHistory = typeof cooperativeSacherieConfigHistoryTable.$inferSelect;