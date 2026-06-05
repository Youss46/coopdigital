import {
  pgTable, serial, integer, varchar, text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id:            serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").references(() => cooperativesTable.id),
  userId:        integer("user_id").notNull().references(() => usersTable.id),
  type:          varchar("type", { length: 50 }).notNull(),
  titre:         varchar("titre", { length: 255 }).notNull(),
  message:       text("message").notNull(),
  lien:          varchar("lien", { length: 500 }),
  lienLibelle:   varchar("lien_libelle", { length: 100 }),
  gravite:       varchar("gravite", { length: 20 }).notNull().default("info")
                   .$type<"info" | "attention" | "critique">(),
  lu:            boolean("lu").notNull().default(false),
  dateLu:        timestamp("date_lu", { withTimezone: true }),
  sourceModule:  varchar("source_module", { length: 50 }),
  sourceId:      integer("source_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const preferencesNotificationsTable = pgTable("preferences_notifications", {
  id:                             serial("id").primaryKey(),
  userId:                         integer("user_id").notNull().references(() => usersTable.id),
  cooperativeId:                  integer("cooperative_id").references(() => cooperativesTable.id),

  notifStockFaible:               boolean("notif_stock_faible").notNull().default(true),
  notifAvanceRetard:              boolean("notif_avance_retard").notNull().default(true),
  notifCreanceRetard:             boolean("notif_creance_retard").notNull().default(true),
  notifRefusNonTraite:            boolean("notif_refus_non_traite").notNull().default(true),
  notifAnomalieCritique:          boolean("notif_anomalie_critique").notNull().default(true),
  notifCertificationExpiration:   boolean("notif_certification_expiration").notNull().default(true),
  notifEcheanceEmprunt:           boolean("notif_echeance_emprunt").notNull().default(true),
  notifBulletinAttente:           boolean("notif_bulletin_attente").notNull().default(true),
  notifEcritureAttente:           boolean("notif_ecriture_attente").notNull().default(true),
  notifAgPlanifiee:               boolean("notif_ag_planifiee").notNull().default(true),
  notifMessageRecu:               boolean("notif_message_recu").notNull().default(true),
  notifBudgetDepasse:             boolean("notif_budget_depasse").notNull().default(true),
  notifPrixChange:                boolean("notif_prix_change").notNull().default(true),

  recevoirSms:                    boolean("recevoir_sms").notNull().default(false),
  recevoirEmail:                  boolean("recevoir_email").notNull().default(false),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
export type PreferencesNotifications = typeof preferencesNotificationsTable.$inferSelect;
