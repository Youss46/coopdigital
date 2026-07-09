import {
  pgTable, serial, integer, varchar, numeric, date, text,
  timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const certificationsTable = pgTable("certifications", {
  id:                    serial("id").primaryKey(),
  cooperativeId:         integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  type:                  varchar("type", { length: 50 }).notNull(),
  // rainforest_alliance | fairtrade | bio | eudr | utz | autre
  nomCertificateur:      varchar("nom_certificateur", { length: 200 }),
  numeroCertificat:      varchar("numero_certificat", { length: 100 }),
  dateObtention:         date("date_obtention", { mode: "string" }),
  dateExpiration:        date("date_expiration", { mode: "string" }),
  statut:                varchar("statut", { length: 30 }).notNull().default("actif"),
  // actif | suspendu | expire | renouvellement_en_cours
  superficieCertifieeHa: numeric("superficie_certifiee_ha", { precision: 10, scale: 2 }),
  nbMembresCouVerts:     integer("nb_membres_couverts").default(0),
  lienDocument:          text("lien_document"),
  notes:                 text("notes"),
  creePar:               integer("cree_par").references(() => usersTable.id),
  createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditsCertificationsTable = pgTable("audits_certifications", {
  id:              serial("id").primaryKey(),
  certificationId: integer("certification_id").notNull().references(() => certificationsTable.id, { onDelete: "cascade" }),
  cooperativeId:   integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  action:          varchar("action", { length: 50 }).notNull(),
  // creation | modification | renouvellement | suspension | expiration | suppression
  ancienStatut:    varchar("ancien_statut", { length: 30 }),
  nouveauStatut:   varchar("nouveau_statut", { length: 30 }),
  notes:           text("notes"),
  faitPar:         integer("fait_par").references(() => usersTable.id),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Certification = typeof certificationsTable.$inferSelect;
export type AuditCertification = typeof auditsCertificationsTable.$inferSelect;
