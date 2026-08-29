import {
  pgTable, serial, integer, varchar, text, jsonb, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { m15UsersTable } from "./saas";

export const cooperativeFeatureModes = ["active", "lecture_seule", "disabled"] as const;
export type CooperativeFeatureMode = typeof cooperativeFeatureModes[number];

export const cooperativeFeaturesTable = pgTable(
  "cooperative_features",
  {
    id: serial("id").primaryKey(),
    cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
    featureKey: varchar("feature_key", { length: 100 }).notNull(),
    mode: varchar("mode", { length: 20 }).notNull().default("active"),
    updatedBy: integer("updated_by").references(() => m15UsersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cooperative_features_coop_key_uq").on(t.cooperativeId, t.featureKey),
    index("cooperative_features_coop_idx").on(t.cooperativeId),
  ],
);

export const cooperativeFeatureHistoryTable = pgTable(
  "cooperative_feature_history",
  {
    id: serial("id").primaryKey(),
    cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
    featureKey: varchar("feature_key", { length: 100 }).notNull(),
    previousMode: varchar("previous_mode", { length: 20 }),
    newMode: varchar("new_mode", { length: 20 }).notNull(),
    reason: text("reason"),
    details: jsonb("details"),
    changedBy: integer("changed_by").references(() => m15UsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cooperative_feature_history_coop_idx").on(t.cooperativeId, t.createdAt),
    index("cooperative_feature_history_feature_idx").on(t.featureKey),
  ],
);

export type CooperativeFeature = typeof cooperativeFeaturesTable.$inferSelect;
export type CooperativeFeatureHistory = typeof cooperativeFeatureHistoryTable.$inferSelect;