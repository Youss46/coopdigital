import {
  pgTable, serial, text, integer, varchar, timestamp, date, jsonb,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";

export const missionsTerrainTable = pgTable("missions_terrain", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  titre: text("titre").notNull(),
  zoneType: varchar("zone_type", { length: 30 }).notNull(),
  zoneNom: text("zone_nom").notNull(),
  datePrevue: date("date_prevue", { mode: "string" }).notNull(),
  agentId: integer("agent_id"),
  creePar: integer("cree_par"),
  statut: varchar("statut", { length: 20 }).default("planifiee"),
  // 'planifiee' | 'en_cours' | 'soumise' | 'validee' | 'rejetee'
  objectifParcelles: integer("objectif_parcelles"),
  parcellesCollectees: integer("parcelles_collectees").default(0),
  motifRejet: text("motif_rejet"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const missionsMembresTable = pgTable("missions_membres", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").notNull(),
  membreId: integer("membre_id").notNull(),
  statut: varchar("statut", { length: 20 }).default("a_faire"),
  // 'a_faire' | 'collecte' | 'valide' | 'rejete'
  gpsCollecte: jsonb("gps_collecte"),
  photosCollectees: jsonb("photos_collectees"),
  notesAgent: text("notes_agent"),
  dateCollecte: timestamp("date_collecte", { withTimezone: true }),
  motifRejet: text("motif_rejet"),
});

export type MissionTerrain = typeof missionsTerrainTable.$inferSelect;
export type MissionMembre = typeof missionsMembresTable.$inferSelect;
