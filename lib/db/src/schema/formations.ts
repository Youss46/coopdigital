import { pgTable, serial, integer, varchar, text, date, time, numeric, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const programmesFormationTable = pgTable("programmes_formation", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull(),
  titre:          varchar("titre", { length: 300 }).notNull(),
  description:    text("description"),
  thematiques:    text("thematiques").array().default(sql`'{}'`),
  financeur:      varchar("financeur", { length: 100 }),
  budgetFcfa:     numeric("budget_fcfa").default("0"),
  dateDebut:      date("date_debut", { mode: "string" }),
  dateFin:        date("date_fin", { mode: "string" }),
  statut:         varchar("statut", { length: 20 }).notNull().default("planifie"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsFormationTable = pgTable("sessions_formation", {
  id:                  serial("id").primaryKey(),
  cooperativeId:       integer("cooperative_id").notNull(),
  programmeId:         integer("programme_id"),
  campagneId:          integer("campagne_id"),
  titre:               varchar("titre", { length: 300 }).notNull(),
  thematique:          varchar("thematique", { length: 100 }),
  formateur:           varchar("formateur", { length: 200 }),
  organismeFormateur:  varchar("organisme_formateur", { length: 200 }),
  lieu:                varchar("lieu", { length: 200 }),
  dateSession:         date("date_session", { mode: "string" }).notNull(),
  heureDebut:          time("heure_debut"),
  heureFin:            time("heure_fin"),
  dureeHeures:         numeric("duree_heures"),
  nbPlaces:            integer("nb_places"),
  coutFcfa:            numeric("cout_fcfa").default("0"),
  statut:              varchar("statut", { length: 20 }).notNull().default("planifie"),
  supportUrl:          varchar("support_url", { length: 500 }),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }),
});

export const inscriptionsFormationTable = pgTable("inscriptions_formation", {
  id:                     serial("id").primaryKey(),
  sessionId:              integer("session_id").notNull(),
  membreId:               integer("membre_id").notNull(),
  statut:                 varchar("statut", { length: 20 }).notNull().default("inscrit"),
  dateInscription:        timestamp("date_inscription", { withTimezone: true }).defaultNow(),
  smsConvocationEnvoye:   boolean("sms_convocation_envoye").notNull().default(false),
  smsRappelEnvoye:        boolean("sms_rappel_envoye").notNull().default(false),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.sessionId, t.membreId)]);

export const attestationsFormationTable = pgTable("attestations_formation", {
  id:                 serial("id").primaryKey(),
  sessionId:          integer("session_id").notNull(),
  membreId:           integer("membre_id").notNull(),
  numeroAttestation:  varchar("numero_attestation", { length: 100 }).unique(),
  dateEmission:       date("date_emission", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
  pdfUrl:             varchar("pdf_url", { length: 500 }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationsFormationTable = pgTable("evaluations_formation", {
  id:               serial("id").primaryKey(),
  sessionId:        integer("session_id").notNull(),
  membreId:         integer("membre_id").notNull(),
  noteSur10:        integer("note_sur_10"),
  commentaire:      text("commentaire"),
  pointsForts:      text("points_forts"),
  pointsAmeliorer:  text("points_ameliorer"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
