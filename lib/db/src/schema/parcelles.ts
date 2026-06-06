import {
  pgTable, serial, integer, varchar, numeric,
  timestamp, date, boolean, text, jsonb,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";
import { usersTable } from "./users";
import { campagnesTable } from "./campagnes";

export const parcellesTable = pgTable("parcelles", {
  id:                      serial("id").primaryKey(),
  cooperativeId:           integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  membreId:                integer("membre_id").notNull().references(() => membresTable.id),

  codeParcelle:            varchar("code_parcelle").unique(),
  nomParcelle:             varchar("nom_parcelle"),

  village:                 varchar("village"),
  section:                 varchar("section"),
  region:                  varchar("region"),
  coordonneesPoint:        jsonb("coordonnees_point").$type<{ lat: number; lng: number } | null>(),
  polygone:                jsonb("polygone").$type<[number, number][] | null>(),
  superficieDeclareeHa:    numeric("superficie_declaree_ha", { precision: 10, scale: 4 }),
  superficieCalculeeHa:    numeric("superficie_calculee_ha", { precision: 10, scale: 4 }),

  culturePrincipale:       varchar("culture_principale"),
  cultureSecondaire:       varchar("culture_secondaire"),
  anneePlantation:         integer("annee_plantation"),
  variete:                 varchar("variete"),

  eudrStatut:              varchar("eudr_statut").default("non_verifie"),
  eudrDateVerification:    date("eudr_date_verification", { mode: "string" }),
  eudrRisqueDeforestation: varchar("eudr_risque_deforestation").default("inconnu"),
  eudrDansZoneProtegee:    boolean("eudr_dans_zone_protegee").default(false),
  eudrCommentaire:         text("eudr_commentaire"),

  certificationStatut:     varchar("certification_statut"),
  organismeCertificateur:  varchar("organisme_certificateur"),
  dateCertification:       date("date_certification", { mode: "string" }),
  dateExpirationCert:      date("date_expiration_cert", { mode: "string" }),
  numeroCertificat:        varchar("numero_certificat"),

  rendementMoyenKgHa:      numeric("rendement_moyen_kg_ha", { precision: 10, scale: 2 }),
  derniereCampagneKg:      numeric("derniere_campagne_kg", { precision: 10, scale: 2 }),

  actif:                   boolean("actif").default(true),
  dateEnregistrement:      date("date_enregistrement", { mode: "string" }),
  enregistrePar:           integer("enregistre_par").references(() => usersTable.id),
  photoUrl:                varchar("photo_url"),
  createdAt:               timestamp("created_at").defaultNow(),
  updatedAt:               timestamp("updated_at").defaultNow(),
});

export const historiqueRendementsTable = pgTable("historique_rendements", {
  id:             serial("id").primaryKey(),
  parcelleId:     integer("parcelle_id").notNull().references(() => parcellesTable.id, { onDelete: "cascade" }),
  campagneId:     integer("campagne_id").references(() => campagnesTable.id),
  poidsKg:        numeric("poids_kg", { precision: 10, scale: 2 }),
  superficieHa:   numeric("superficie_ha", { precision: 10, scale: 4 }),
  rendementKgHa:  numeric("rendement_kg_ha", { precision: 10, scale: 2 }),
  qualiteMoyenne: varchar("qualite_moyenne"),
  createdAt:      timestamp("created_at").defaultNow(),
});

export const zonesRisqueEudrTable = pgTable("zones_risque_eudr", {
  id:            serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nomZone:       varchar("nom_zone").notNull(),
  typeZone:      varchar("type_zone").notNull(),
  polygoneZone:  jsonb("polygone_zone").notNull().$type<[number, number][]>(),
  source:        varchar("source"),
  dateImport:    date("date_import", { mode: "string" }),
  createdAt:     timestamp("created_at").defaultNow(),
});

export type Parcelle = typeof parcellesTable.$inferSelect;
export type HistoriqueRendement = typeof historiqueRendementsTable.$inferSelect;
export type ZoneRisqueEudr = typeof zonesRisqueEudrTable.$inferSelect;
