import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const smsStatutEnum = pgEnum("sms_statut", ["envoye", "echec", "partiel"]);

export const historiqueSmsTable = pgTable("historique_sms", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  agentId: integer("agent_id").references(() => usersTable.id),
  message: text("message").notNull(),
  groupement: text("groupement"),
  nbDestinataires: integer("nb_destinataires").notNull().default(0),
  nbEnvoyes: integer("nb_envoyes").notNull().default(0),
  nbEchecs: integer("nb_echecs").notNull().default(0),
  statut: smsStatutEnum("statut").notNull().default("envoye"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HistoriqueSms = typeof historiqueSmsTable.$inferSelect;

// ─── Messagerie interne ────────────────────────────────────────────────────────

export const messagesInternesTable = pgTable("messages_internes", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  auteurId: integer("auteur_id").references(() => usersTable.id),
  sujet: text("sujet").notNull(),
  contenu: text("contenu").notNull(),
  destinataires: text("destinataires").notNull().default("tous"),
  nbDestinataires: integer("nb_destinataires").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lecturesMessagesTable = pgTable("lectures_messages", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messagesInternesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  luAt: timestamp("lu_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MessageInterne = typeof messagesInternesTable.$inferSelect;
export type LectureMessage = typeof lecturesMessagesTable.$inferSelect;
