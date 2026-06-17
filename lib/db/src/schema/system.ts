import { pgTable, serial, boolean, text, timestamp } from "drizzle-orm/pg-core";

export const systemBannerTable = pgTable("system_banner", {
  id:        serial("id").primaryKey(),
  actif:     boolean("actif").notNull().default(false),
  message:   text("message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type SystemBanner = typeof systemBannerTable.$inferSelect;
