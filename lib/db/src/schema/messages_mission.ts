import {
  pgTable, serial, text, integer, varchar, timestamp, boolean,
} from "drizzle-orm/pg-core";
import { missionsTerrainTable } from "./missions";
import { usersTable } from "./users";

export const messagesMissionTable = pgTable("messages_mission", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").references(() => missionsTerrainTable.id),
  auteurId: integer("auteur_id").references(() => usersTable.id),
  message: text("message").notNull(),
  type: varchar("type", { length: 20 }).default("commentaire"),
  lu: boolean("lu").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MessageMission = typeof messagesMissionTable.$inferSelect;
