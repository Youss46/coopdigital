import { pgTable, serial, integer, varchar, text, date, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const configCooperativeTable = pgTable("config_cooperative", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id, { onDelete: "cascade" }),

  nomComplet:               varchar("nom_complet", { length: 255 }),
  nomAbrege:                varchar("nom_abrege", { length: 100 }),
  logoUrl:                  text("logo_url"),
  slogan:                   varchar("slogan", { length: 255 }),

  adresse:                  varchar("adresse", { length: 255 }),
  ville:                    varchar("ville", { length: 100 }),
  region:                   varchar("region", { length: 100 }),
  pays:                     varchar("pays", { length: 100 }).default("Côte d'Ivoire"),
  telephone:                varchar("telephone", { length: 30 }),
  telephone2:               varchar("telephone2", { length: 30 }),
  email:                    varchar("email", { length: 255 }),
  siteWeb:                  varchar("site_web", { length: 255 }),
  boitePostale:             varchar("boite_postale", { length: 50 }),

  numeroAgrement:           varchar("numero_agrement", { length: 100 }),
  dateAgrement:             date("date_agrement"),
  autoriteAgrement:         varchar("autorite_agrement", { length: 255 }),
  formeJuridique:           varchar("forme_juridique", { length: 100 }).default("Coopérative agricole"),
  numeroRccm:               varchar("numero_rccm", { length: 100 }),
  numeroContribuable:       varchar("numero_contribuable", { length: 100 }),
  dateCreation:             date("date_creation"),

  banquePrincipale:         varchar("banque_principale", { length: 255 }),
  numeroCompteBancaire:     varchar("numero_compte_bancaire", { length: 100 }),
  iban:                     varchar("iban", { length: 50 }),
  swift:                    varchar("swift", { length: 20 }),
  devise:                   varchar("devise", { length: 10 }).default("XOF"),
  exerciceFiscalDebutMois:  integer("exercice_fiscal_debut_mois").default(1),

  produitPrincipal:         varchar("produit_principal", { length: 50 }).default("Cacao"),
  zoneCollecte:             varchar("zone_collecte", { length: 255 }),
  superficieTotaleHa:       numeric("superficie_totale_ha", { precision: 12, scale: 2 }),

  valeurNominalePartFcfa:   numeric("valeur_nominale_part_fcfa", { precision: 12, scale: 2 }).default("5000"),
  nbrePartsMin:             integer("nbre_parts_min").default(5),
  cotisationAnnuelleFcfa:   numeric("cotisation_annuelle_fcfa", { precision: 12, scale: 2 }),
  quorumAgPct:              numeric("quorum_ag_pct", { precision: 5, scale: 2 }).default("50"),

  couleurPrimaire:          varchar("couleur_primaire", { length: 20 }).default("#1a4731"),
  couleurSecondaire:        varchar("couleur_secondaire", { length: 20 }).default("#c4962a"),
  piedDePagePdf:            text("pied_de_page_pdf"),

  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow(),
  updatedBy:                integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
});

export const insertConfigCooperativeSchema = createInsertSchema(configCooperativeTable);
export const selectConfigCooperativeSchema = createSelectSchema(configCooperativeTable);
export type ConfigCooperative = typeof configCooperativeTable.$inferSelect;
export type InsertConfigCooperative = typeof configCooperativeTable.$inferInsert;

export const DOCUMENT_TYPES = ["statuts", "reglement_interieur", "agrement", "certification", "contrat_exportateur", "autre"] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export const documentsOfficielsTable = pgTable("documents_officiels", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull().references(() => cooperativesTable.id, { onDelete: "cascade" }),
  type:           varchar("type", { length: 50 }).notNull(),
  libelle:        varchar("libelle", { length: 255 }).notNull(),
  fichierUrl:     varchar("fichier_url", { length: 500 }).notNull(),
  dateDocument:   date("date_document"),
  dateExpiration: date("date_expiration"),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertDocumentOfficielSchema = createInsertSchema(documentsOfficielsTable);
export const selectDocumentOfficielSchema = createSelectSchema(documentsOfficielsTable);
export type DocumentOfficiel = typeof documentsOfficielsTable.$inferSelect;
export type InsertDocumentOfficiel = typeof documentsOfficielsTable.$inferInsert;
