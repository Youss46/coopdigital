import {
  pgTable, serial, text, integer, varchar, timestamp, date, jsonb, real,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { certificationsTable } from "./certifications";

export const missionsEnqueteTable = pgTable("missions_enquete", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  certificationId: integer("certification_id")
    .notNull()
    .references(() => certificationsTable.id),
  titre: text("titre").notNull(),
  datePrevue: date("date_prevue", { mode: "string" }).notNull(),
  agentId: integer("agent_id"),
  creePar: integer("cree_par"),
  statut: varchar("statut", { length: 20 }).default("planifiee"),
  // 'planifiee' | 'en_cours' | 'soumise' | 'validee'
  instructions: text("instructions"),
  objectifMembres: integer("objectif_membres"),
  membresCollectes: integer("membres_collectes").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const enqueteMembresTable = pgTable("enquete_membres", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").notNull(),
  membreId: integer("membre_id").notNull(),
  statut: varchar("statut", { length: 20 }).default("a_faire"),
  // 'a_faire' | 'collecte' | 'valide'
  reponses: jsonb("reponses"),
  // { [critere: string]: { valeur: 'oui' | 'non' | 'na'; commentaire?: string } }
  scoreCalcule: real("score_calcule"),
  statutConformite: varchar("statut_conformite", { length: 30 }),
  // 'certifie' | 'en_cours' | 'non_conforme'
  notesAgent: text("notes_agent"),
  dateCollecte: timestamp("date_collecte", { withTimezone: true }),
});

export type MissionEnquete = typeof missionsEnqueteTable.$inferSelect;
export type EnqueteMembre = typeof enqueteMembresTable.$inferSelect;
