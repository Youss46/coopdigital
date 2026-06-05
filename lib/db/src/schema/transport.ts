import {
  pgTable, serial, integer, varchar, numeric, text, boolean, date, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";

export const vehiculesTable = pgTable("vehicules", {
  id:                       serial("id").primaryKey(),
  cooperativeId:            integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  immatriculation:          varchar("immatriculation", { length: 50 }).notNull(),
  marque:                   varchar("marque", { length: 100 }),
  modele:                   varchar("modele", { length: 100 }),
  type:                     varchar("type", { length: 20 }).notNull(),
  capaciteKg:               numeric("capacite_kg", { precision: 10, scale: 2 }),
  anneeFabrication:         integer("annee_fabrication"),
  dateAcquisition:          date("date_acquisition", { mode: "string" }),
  valeurAcquisitionFcfa:    numeric("valeur_acquisition_fcfa", { precision: 14, scale: 2 }),
  proprietaire:             varchar("proprietaire", { length: 20 }).notNull().default("cooperative"),
  nomPrestataire:           varchar("nom_prestataire", { length: 255 }),
  statut:                   varchar("statut", { length: 20 }).notNull().default("disponible"),
  kilometrageActuel:        integer("kilometrage_actuel").notNull().default(0),
  prochainEntretienKm:      integer("prochain_entretien_km"),
  prochainEntretienDate:    date("prochain_entretien_date", { mode: "string" }),
  assuranceExpiration:      date("assurance_expiration", { mode: "string" }),
  visiteTechniqueExpiration: date("visite_technique_expiration", { mode: "string" }),
  photoUrl:                 varchar("photo_url", { length: 500 }),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chauffeursTable = pgTable("chauffeurs", {
  id:                     serial("id").primaryKey(),
  cooperativeId:          integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nom:                    varchar("nom", { length: 100 }).notNull(),
  prenoms:                varchar("prenoms", { length: 200 }),
  telephone:              varchar("telephone", { length: 30 }),
  numeroPermis:           varchar("numero_permis", { length: 100 }),
  categoriePermis:        varchar("categorie_permis", { length: 10 }),
  dateExpirationPermis:   date("date_expiration_permis", { mode: "string" }),
  dateEmbauche:           date("date_embauche", { mode: "string" }),
  statut:                 varchar("statut", { length: 10 }).notNull().default("actif"),
  createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const missionsTransportTable = pgTable("missions_transport", {
  id:                     serial("id").primaryKey(),
  cooperativeId:          integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  vehiculeId:             integer("vehicule_id").notNull().references(() => vehiculesTable.id),
  chauffeurId:            integer("chauffeur_id").notNull().references(() => chauffeursTable.id),
  campagneId:             integer("campagne_id"),
  typeMission:            varchar("type_mission", { length: 20 }).notNull(),
  zoneCollecte:           varchar("zone_collecte", { length: 255 }),
  section:                varchar("section", { length: 255 }),
  venteExportateurId:     integer("vente_exportateur_id"),
  exportateurDestination: varchar("exportateur_destination", { length: 255 }),
  lieuDepart:             varchar("lieu_depart", { length: 255 }).notNull(),
  lieuArrivee:            varchar("lieu_arrivee", { length: 255 }).notNull(),
  dateDepart:             timestamp("date_depart", { withTimezone: true }).notNull(),
  dateArriveePrevue:      timestamp("date_arrivee_prevue", { withTimezone: true }),
  dateArriveeReelle:      timestamp("date_arrivee_reelle", { withTimezone: true }),
  poidsChargeKg:          numeric("poids_charge_kg", { precision: 12, scale: 3 }).notNull().default("0"),
  nombreSacs:             integer("nombre_sacs").notNull().default(0),
  kilometrageDepart:      integer("kilometrage_depart"),
  kilometrageArrivee:     integer("kilometrage_arrivee"),
  distanceKm:             integer("distance_km"),
  coutCarburantFcfa:      numeric("cout_carburant_fcfa", { precision: 12, scale: 2 }).notNull().default("0"),
  coutChauffeurFcfa:      numeric("cout_chauffeur_fcfa", { precision: 12, scale: 2 }).notNull().default("0"),
  coutPeageFcfa:          numeric("cout_peage_fcfa", { precision: 12, scale: 2 }).notNull().default("0"),
  coutDiversFcfa:         numeric("cout_divers_fcfa", { precision: 12, scale: 2 }).notNull().default("0"),
  coutTotalFcfa:          numeric("cout_total_fcfa", { precision: 14, scale: 2 }).notNull().default("0"),
  coutParKgFcfa:          numeric("cout_par_kg_fcfa", { precision: 10, scale: 4 }),
  statut:                 varchar("statut", { length: 20 }).notNull().default("planifiee"),
  observations:           text("observations"),
  createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const entretienVehiculeTable = pgTable("entretiens_vehicule", {
  id:                     serial("id").primaryKey(),
  vehiculeId:             integer("vehicule_id").notNull().references(() => vehiculesTable.id),
  typeEntretien:          varchar("type_entretien", { length: 50 }).notNull(),
  dateEntretien:          date("date_entretien", { mode: "string" }).notNull(),
  kilometrageEntretien:   integer("kilometrage_entretien"),
  description:            text("description"),
  coutFcfa:               numeric("cout_fcfa", { precision: 12, scale: 2 }),
  garage:                 varchar("garage", { length: 255 }),
  prochainEntretienKm:    integer("prochain_entretien_km"),
  prochainEntretienDate:  date("prochain_entretien_date", { mode: "string" }),
  createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Vehicule = typeof vehiculesTable.$inferSelect;
export type Chauffeur = typeof chauffeursTable.$inferSelect;
export type MissionTransport = typeof missionsTransportTable.$inferSelect;
export type EntretienVehicule = typeof entretienVehiculeTable.$inferSelect;
