import {
  pgTable, serial, integer, varchar, text, jsonb, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { m15UsersTable } from "./saas";

export const cooperativeRoleModes = ["active", "disabled"] as const;
export type CooperativeRoleMode = typeof cooperativeRoleModes[number];

export const cooperativeRolesTable = pgTable(
  "cooperative_roles",
  {
    id: serial("id").primaryKey(),
    cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
    roleKey: varchar("role_key", { length: 40 }).notNull(),
    mode: varchar("mode", { length: 20 }).notNull().default("active"),
    updatedBy: integer("updated_by").references(() => m15UsersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cooperative_roles_coop_key_uq").on(t.cooperativeId, t.roleKey),
    index("cooperative_roles_coop_idx").on(t.cooperativeId),
  ],
);

export const cooperativeRoleHistoryTable = pgTable(
  "cooperative_role_history",
  {
    id: serial("id").primaryKey(),
    cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
    roleKey: varchar("role_key", { length: 40 }).notNull(),
    previousMode: varchar("previous_mode", { length: 20 }),
    newMode: varchar("new_mode", { length: 20 }).notNull(),
    reason: text("reason"),
    details: jsonb("details"),
    changedBy: integer("changed_by").references(() => m15UsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cooperative_role_history_coop_idx").on(t.cooperativeId, t.createdAt),
    index("cooperative_role_history_role_idx").on(t.roleKey),
  ],
);

export type CooperativeRole = typeof cooperativeRolesTable.$inferSelect;
export type CooperativeRoleHistory = typeof cooperativeRoleHistoryTable.$inferSelect;