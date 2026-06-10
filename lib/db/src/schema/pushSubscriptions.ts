import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint:  text("endpoint").notNull(),
  p256dh:    text("p256dh").notNull(),
  auth:      text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.userId, t.endpoint)]);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
