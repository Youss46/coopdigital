import {
  pgTable, pgEnum, serial, integer, varchar, numeric, text,
  boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { membresTable } from "./membres";
import { livraisonsTable } from "./livraisons";
import { exportateursTable } from "./exportateurs";

export const expeditionStatutEnum = pgEnum("expedition_statut", [
  "en_preparation",
  "charge",
  "en_transit",
  "arrive_port",
  "receptionne",
  "litige",
]);

export const expeditionTypeVehiculeEnum = pgEnum("expedition_type_vehicule", [
  "propre",
  "location",
]);

export const expeditionMotifEcartEnum = pgEnum("expedition_motif_ecart", [
  "evaporation",
  "vol",
  "erreur_pesee",
  "avarie",
  "autre",
]);

export const expeditionsTable = pgTable("expeditions", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),

  numeroExpedition:     varchar("numero_expedition", { length: 30 }).notNull().unique(),
  campagneId:           integer("campagne_id").references(() => campagnesTable.id),
  exerciceId:           integer("exercice_id"),

  typeVehicule:         expeditionTypeVehiculeEnum("type_vehicule").notNull(),
  immatriculation:      varchar("immatriculation", { length: 50 }),
  nomChauffeur:         varchar("nom_chauffeur", { length: 200 }),
  telephoneChauffeur:   varchar("telephone_chauffeur", { length: 30 }),
  transporteur:         varchar("transporteur", { length: 200 }),
  numeroBonTransport:   varchar("numero_bon_transport", { length: 100 }),

  dateDepart:           timestamp("date_depart", { withTimezone: true }),
  lieuDepart:           varchar("lieu_depart", { length: 255 }).default("Magasin central"),
  poidsChargeKg:        numeric("poids_charge_kg", { precision: 12, scale: 2 }),
  nombreSacs:           integer("nombre_sacs"),
  numeroLots:           text("numero_lots"),

  port:                 varchar("port", { length: 100 }).notNull(),
  entrepotDestination:  varchar("entrepot_destination", { length: 255 }),
  exportateurId:        integer("exportateur_id").references(() => exportateursTable.id),
  exportateurNom:       varchar("exportateur_nom", { length: 255 }),
  numeroContratExport:  varchar("numero_contrat_export", { length: 100 }),

  heureEstimeeArrivee:  timestamp("heure_estimee_arrivee", { withTimezone: true }),
  positionGpsActuelle:  jsonb("position_gps_actuelle"),

  dateArriveePort:      timestamp("date_arrivee_port", { withTimezone: true }),
  poidsRecuPortKg:      numeric("poids_recu_port_kg", { precision: 12, scale: 2 }),
  numeroRecepissePort:  varchar("numero_recepisse_port", { length: 100 }),
  nomReceptionnaire:    varchar("nom_receptionnaire", { length: 200 }),
  statutReception:      varchar("statut_reception", { length: 20 }),

  ecartPoidsKg:         numeric("ecart_poids_kg", { precision: 12, scale: 2 }),
  motifEcart:           expeditionMotifEcartEnum("motif_ecart"),
  provisionLitige:      boolean("provision_litige").default(false),

  documents:            jsonb("documents").default([]),

  statut:               expeditionStatutEnum("statut").notNull().default("en_preparation"),

  ecritureDepartId:     integer("ecriture_depart_id"),
  ecritureArriveeId:    integer("ecriture_arrivee_id"),
  ecritureTransportId:  integer("ecriture_transport_id"),
  ecritureEcartId:      integer("ecriture_ecart_id"),

  creePar:              integer("cree_par"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expeditionLotsTable = pgTable("expedition_lots", {
  id:              serial("id").primaryKey(),
  expeditionId:    integer("expedition_id").notNull().references(() => expeditionsTable.id, { onDelete: "cascade" }),
  membreId:        integer("membre_id").references(() => membresTable.id),
  livraisonId:     integer("livraison_id").references(() => livraisonsTable.id),
  poidsKg:         numeric("poids_kg", { precision: 12, scale: 2 }),
  nombreSacs:      integer("nombre_sacs"),
  certificatEudr:  varchar("certificat_eudr", { length: 200 }),
  parcelleOrigine: varchar("parcelle_origine", { length: 255 }),
});

export const expeditionHistoriqueTable = pgTable("expedition_historique", {
  id:               serial("id").primaryKey(),
  expeditionId:     integer("expedition_id").notNull().references(() => expeditionsTable.id, { onDelete: "cascade" }),
  statutPrecedent:  varchar("statut_precedent", { length: 30 }),
  statutNouveau:    varchar("statut_nouveau", { length: 30 }).notNull(),
  dateChangement:   timestamp("date_changement", { withTimezone: true }).defaultNow().notNull(),
  faitPar:          integer("fait_par"),
  notes:            text("notes"),
  positionGps:      jsonb("position_gps"),
});

export type Expedition = typeof expeditionsTable.$inferSelect;
export type ExpeditionLot = typeof expeditionLotsTable.$inferSelect;
export type ExpeditionHistorique = typeof expeditionHistoriqueTable.$inferSelect;
