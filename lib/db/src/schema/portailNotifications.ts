import {
  pgTable, serial, integer, varchar, text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";

export const portailNotificationsTable = pgTable("portail_notifications", {
  id:            serial("id").primaryKey(),
  membreId:      integer("membre_id").notNull().references(() => membresTable.id, { onDelete: "cascade" }),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id, { onDelete: "cascade" }),
  type:          varchar("type", { length: 50 }).notNull().default("info"),
  titre:         varchar("titre", { length: 255 }).notNull(),
  message:       text("message").notNull(),
  lien:          varchar("lien", { length: 500 }),
  lu:            boolean("lu").notNull().default(false),
  dateLu:        timestamp("date_lu", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PortailNotification = typeof portailNotificationsTable.$inferSelect;
