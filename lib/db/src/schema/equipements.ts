import {
  pgTable, serial, integer, varchar, numeric, text, date, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const categoriesEquipementsTable = pgTable("categories_equipements", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  libelle:                  varchar("libelle", { length: 200 }).notNull(),
  dureeAmortissementAns:    integer("duree_amortissement_ans").notNull().default(5),
  methodeAmortissement:     varchar("methode_amortissement", { length: 20 }).notNull().default("lineaire"),
  compteImmobilisation:     varchar("compte_immobilisation", { length: 10 }).notNull().default("244"),
  compteAmortissement:      varchar("compte_amortissement", { length: 10 }).notNull().default("284"),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CategorieEquipement = typeof categoriesEquipementsTable.$inferSelect;
export type InsertCategorieEquipement = typeof categoriesEquipementsTable.$inferInsert;

export const equipementsTable = pgTable("equipements", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  categorieId:              integer("categorie_id").notNull().references(() => categoriesEquipementsTable.id),
  designation:              varchar("designation", { length: 300 }).notNull(),
  marque:                   varchar("marque", { length: 100 }),
  modele:                   varchar("modele", { length: 100 }),
  numeroSerie:              varchar("numero_serie", { length: 100 }),
  dateAcquisition:          date("date_acquisition", { mode: "string" }).notNull(),
  valeurAcquisitionFcfa:    numeric("valeur_acquisition_fcfa", { precision: 14, scale: 0 }).notNull(),
  valeurResiduelleFcfa:     numeric("valeur_residuelle_fcfa", { precision: 14, scale: 0 }).notNull().default("0"),
  dureeAmortissementAns:    integer("duree_amortissement_ans").notNull(),
  methodeAmortissement:     varchar("methode_amortissement", { length: 20 }).notNull().default("lineaire"),
  valeurNetteComptableFcfa: numeric("valeur_nette_comptable_fcfa", { precision: 14, scale: 0 }).notNull(),
  cumulAmortissementFcfa:   numeric("cumul_amortissement_fcfa", { precision: 14, scale: 0 }).notNull().default("0"),
  statut:                   varchar("statut", { length: 20 }).notNull().default("actif"),
  affecteA:                 varchar("affecte_a", { length: 200 }),
  affecteUserId:            integer("affecte_user_id").references(() => usersTable.id),
  dateMiseService:          date("date_mise_service", { mode: "string" }),
  garantieExpiration:       date("garantie_expiration", { mode: "string" }),
  photoUrl:                 varchar("photo_url", { length: 500 }),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Equipement = typeof equipementsTable.$inferSelect;
export type InsertEquipement = typeof equipementsTable.$inferInsert;

export const dotationsAmortissementTable = pgTable("dotations_amortissement", {
  id:            serial("id").primaryKey(),
  equipementId:  integer("equipement_id").notNull().references(() => equipementsTable.id),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  exercice:      integer("exercice").notNull(),
  mois:          integer("mois").notNull(),
  dotationFcfa:  numeric("dotation_fcfa", { precision: 14, scale: 0 }).notNull(),
  cumulFcfa:     numeric("cumul_fcfa", { precision: 14, scale: 0 }).notNull(),
  vncFcfa:       numeric("vnc_fcfa", { precision: 14, scale: 0 }).notNull(),
  ecritureId:    integer("ecriture_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DotationAmortissement = typeof dotationsAmortissementTable.$inferSelect;

export const maintenancesEquipementTable = pgTable("maintenances_equipement", {
  id:                   serial("id").primaryKey(),
  equipementId:         integer("equipement_id").notNull().references(() => equipementsTable.id),
  type:                 varchar("type", { length: 20 }).notNull().default("preventive"),
  dateMaintenance:      date("date_maintenance", { mode: "string" }).notNull(),
  description:          text("description"),
  coutFcfa:             numeric("cout_fcfa", { precision: 14, scale: 0 }),
  prestataire:          varchar("prestataire", { length: 200 }),
  prochaineMaintenance: date("prochaine_maintenance", { mode: "string" }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MaintenanceEquipement = typeof maintenancesEquipementTable.$inferSelect;
