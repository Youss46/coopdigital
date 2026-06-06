import {
  pgTable, serial, integer, varchar, text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

// ─── tickets_support ──────────────────────────────────────────────────────────

export const ticketsSupportTable = pgTable("tickets_support", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  reference:        varchar("reference", { length: 20 }).notNull().unique(),
  titre:            varchar("titre", { length: 300 }).notNull(),
  description:      text("description").notNull(),
  categorie:        varchar("categorie", { length: 30 }).default("question"),
  priorite:         varchar("priorite", { length: 20 }).notNull().default("normale"),
  moduleConcerne:   varchar("module_concerne", { length: 50 }),
  captureEcranUrl:  varchar("capture_ecran_url", { length: 500 }),
  ouvertPar:        integer("ouvert_par").references(() => usersTable.id),
  statut:           varchar("statut", { length: 20 }).notNull().default("ouvert"),
  assigneM15:       varchar("assigne_m15", { length: 200 }),
  dateResolution:   timestamp("date_resolution", { withTimezone: true }),
  satisfaction:     integer("satisfaction"),
  smsHauteEnvoye:   boolean("sms_haute_envoye").notNull().default(false),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TicketSupport = typeof ticketsSupportTable.$inferSelect;

// ─── messages_ticket ──────────────────────────────────────────────────────────

export const messagesTicketTable = pgTable("messages_ticket", {
  id:              serial("id").primaryKey(),
  ticketId:        integer("ticket_id").notNull().references(() => ticketsSupportTable.id),
  auteurType:      varchar("auteur_type", { length: 10 }).notNull(),
  auteurId:        integer("auteur_id"),
  auteurNom:       varchar("auteur_nom", { length: 200 }).notNull(),
  contenu:         text("contenu").notNull(),
  pieceJointeUrl:  varchar("piece_jointe_url", { length: 500 }),
  lu:              boolean("lu").notNull().default(false),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MessageTicket = typeof messagesTicketTable.$inferSelect;
