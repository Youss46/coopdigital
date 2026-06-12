import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { membresTable } from "./membres";

export const pushSubscriptionsPortailTable = pgTable("push_subscriptions_portail", {
  id:        serial("id").primaryKey(),
  membreId:  integer("membre_id").notNull().references(() => membresTable.id, { onDelete: "cascade" }),
  endpoint:  text("endpoint").notNull(),
  p256dh:    text("p256dh").notNull(),
  auth:      text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.membreId, t.endpoint)]);

export type PushSubscriptionPortail = typeof pushSubscriptionsPortailTable.$inferSelect;
