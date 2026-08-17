import {
  pgTable, pgEnum, serial, integer, varchar, numeric, text,
  boolean, timestamp, jsonb, unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { livraisonsTable } from "./livraisons";

export const transfertStatutEnum = pgEnum("transfert_statut", [
  "planifie",
  "en_cours",
  "arrive",
  "en_pesee",
  "confirme",
  "litige",
]);

export const transfertMotifEcartEnum = pgEnum("transfert_motif_ecart", [
  "evaporation",
  "perte",
  "erreur_pesee",
  "autre",
]);

export const entrepotsMouvementTypeEnum = pgEnum("entrepot_mouvement_type", [
  "entree",
  "sortie",
]);

export const entrepotsMouvementMotifEnum = pgEnum("entrepot_mouvement_motif", [
  "livraison_membre",
  "transfert_central",
  "ajustement",
  "perte",
]);

export const entrepotsDeleguesTable = pgTable("entrepots_delegues", {
  id:                serial("id").primaryKey(),

  delegueId:         integer("delegue_id").notNull().references(() => usersTable.id),
  cooperativeId:     integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  nom:               varchar("nom", { length: 255 }).notNull(),
  zoneNom:           varchar("zone_nom", { length: 255 }),
  zoneType:          varchar("zone_type", { length: 50 }),

  capaciteMaxKg:     numeric("capacite_max_kg", { precision: 12, scale: 2 }),
  seuilAlerteKg:     numeric("seuil_alerte_kg", { precision: 12, scale: 2 }),
  capaciteSacs:      integer("capacite_sacs"),

  stockActuelKg:     numeric("stock_actuel_kg", { precision: 12, scale: 2 }).default("0"),
  stockMisAJourLe:   timestamp("stock_mis_a_jour_le", { withTimezone: true }),

  adresse:           varchar("adresse", { length: 500 }),
  gpsLat:            numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLng:            numeric("gps_lng", { precision: 10, scale: 7 }),

  actif:             boolean("actif").default(true),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // Compteur séquentiel de livraisons propre à chaque entrepôt délégué
  dernierNumeroLivraison: integer("dernier_numero_livraison").notNull().default(0),
});

export const entrepotsMouvementsTable = pgTable("entrepot_mouvements", {
  id:                serial("id").primaryKey(),

  entrepotId:        integer("entrepot_id").notNull().references(() => entrepotsDeleguesTable.id),
  typeMouvement:     entrepotsMouvementTypeEnum("type_mouvement").notNull(),
  motif:             entrepotsMouvementMotifEnum("motif").notNull(),

  poidsKg:           numeric("poids_kg", { precision: 12, scale: 2 }).notNull(),
  stockAvantKg:      numeric("stock_avant_kg", { precision: 12, scale: 2 }),
  stockApresKg:      numeric("stock_apres_kg", { precision: 12, scale: 2 }),

  livraisonId:       integer("livraison_id").references(() => livraisonsTable.id),
  transfertId:       integer("transfert_id"),

  enregistrePar:     integer("enregistre_par").references(() => usersTable.id),
  dateMouvement:     timestamp("date_mouvement", { withTimezone: true }).notNull().defaultNow(),
  notes:             text("notes"),
});

export const transfertsStockTable = pgTable("transferts_stock", {
  id:                serial("id").primaryKey(),

  numeroTransfert:   varchar("numero_transfert", { length: 30 }).notNull(),
  campagneId:        integer("campagne_id").references(() => campagnesTable.id),

  entrepotSourceId:  integer("entrepot_source_id").notNull().references(() => entrepotsDeleguesTable.id),
  delegueId:         integer("delegue_id").notNull().references(() => usersTable.id),
  cooperativeId:     integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  destination:       varchar("destination", { length: 100 }).default("magasin_central"),

  typeVehicule:      varchar("type_vehicule", { length: 20 }),
  immatriculation:   varchar("immatriculation", { length: 50 }),
  nomChauffeur:      varchar("nom_chauffeur", { length: 200 }),
  telephoneChauffeur: varchar("telephone_chauffeur", { length: 30 }),
  transporteur:      varchar("transporteur", { length: 200 }),
  fraisCarburantFcfa:   integer("frais_carburant_fcfa"),
  fraisCarburantPar:    varchar("frais_carburant_par", { length: 20 }),   // "cooperative" | "delegue"
  autresChargesFcfa:    integer("autres_charges_fcfa"),
  autresChargesLibelle: varchar("autres_charges_libelle", { length: 300 }),
  autresChargesPar:     varchar("autres_charges_par", { length: 20 }),    // "cooperative" | "delegue"

  nombreSacs:        integer("nombre_sacs"),
  nombreSacsArrivee: integer("nombre_sacs_arrivee"),
  poidsDepart_kg:    numeric("poids_depart_kg", { precision: 12, scale: 2 }),
  poidsArrivee_kg:   numeric("poids_arrivee_kg", { precision: 12, scale: 2 }),
  ecartKg:           numeric("ecart_kg", { precision: 12, scale: 2 }),
  motifEcart:        transfertMotifEcartEnum("motif_ecart"),

  dateDepart:        timestamp("date_depart", { withTimezone: true }),
  dateArrivee:       timestamp("date_arrivee", { withTimezone: true }),
  datePrevue:        timestamp("date_prevue", { withTimezone: true }),

  statut:            transfertStatutEnum("statut").notNull().default("planifie"),

  confirmePar:       integer("confirme_par").references(() => usersTable.id),
  confirme_le:       timestamp("confirme_le", { withTimezone: true }),

  /** Session de pesée physique liée à la réception de ce transfert (nullable — optionnel) */
  sessionPeseeId:    integer("session_pesee_id"),

  documents:         jsonb("documents").default([]),
  notes:             text("notes"),

  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("transferts_stock_coop_numero_uq").on(t.cooperativeId, t.numeroTransfert),
]);

export type EntrepotDelegue     = typeof entrepotsDeleguesTable.$inferSelect;
export type EntrepotMouvement   = typeof entrepotsMouvementsTable.$inferSelect;
export type TransfertStock      = typeof transfertsStockTable.$inferSelect;
