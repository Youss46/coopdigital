import { pgTable, serial, integer, varchar, text, date, time, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const zonesCollecteTable = pgTable("zones_collecte", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull(),
  nom:                  varchar("nom", { length: 200 }).notNull(),
  section:              varchar("section", { length: 100 }),
  villages:             text("villages").array().default(sql`'{}'`),
  agentResponsableId:   integer("agent_responsable_id"),
  objectifTonnageKg:    numeric("objectif_tonnage_kg", { precision: 10, scale: 2 }).default("0"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planningsCollecteTable = pgTable("plannings_collecte", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull(),
  campagneId:           integer("campagne_id"),
  zoneCollecteId:       integer("zone_collecte_id"),
  agentId:              integer("agent_id"),
  dateCollecte:         date("date_collecte", { mode: "string" }).notNull(),
  heureDebut:           time("heure_debut").default("07:00"),
  heureFin:             time("heure_fin").default("17:00"),
  villagesPrevus:       text("villages_prevus").array().default(sql`'{}'`),
  objectifKg:           numeric("objectif_kg", { precision: 10, scale: 2 }).default("0"),
  statut:               varchar("statut", { length: 20 }).notNull().default("planifie"),
  tonnageRealiseKg:     numeric("tonnage_realise_kg", { precision: 10, scale: 2 }).default("0"),
  nbProducteursPrevus:  integer("nb_producteurs_prevus").default(0),
  nbProducteursVenus:   integer("nb_producteurs_venus").default(0),
  observations:         text("observations"),
  smsEnvoye:            boolean("sms_envoye").notNull().default(false),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }),
});

export const notificationsCollecteTable = pgTable("notifications_collecte", {
  id:             serial("id").primaryKey(),
  planningId:     integer("planning_id").notNull(),
  membreId:       integer("membre_id"),
  telephone:      varchar("telephone", { length: 30 }),
  messageEnvoye:  text("message_envoye"),
  statutEnvoi:    varchar("statut_envoi", { length: 20 }),
  dateEnvoi:      timestamp("date_envoi", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
