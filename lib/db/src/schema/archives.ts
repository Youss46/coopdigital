import {
  pgTable, serial, integer, text, date, timestamp,
  numeric, varchar, boolean,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";

export const archivesCampagnesTable = pgTable("archives_campagnes", {
  id:                          serial("id").primaryKey(),
  cooperativeId:               integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:                  integer("campagne_id").notNull().references(() => campagnesTable.id),

  // Production
  tonnageTotalKg:              numeric("tonnage_total_kg",              { precision: 14, scale: 2 }).default("0"),
  tonnageMembresKg:            numeric("tonnage_membres_kg",            { precision: 14, scale: 2 }).default("0"),
  tonnagePisteursKg:           numeric("tonnage_pisteurs_kg",           { precision: 14, scale: 2 }).default("0"),
  tonnageExternesKg:           numeric("tonnage_externes_kg",           { precision: 14, scale: 2 }).default("0"),
  nbLivraisons:                integer("nb_livraisons").default(0),
  nbMembresActifs:             integer("nb_membres_actifs").default(0),
  nbFournisseursTotal:         integer("nb_fournisseurs_total").default(0),
  prixAchatMoyenKgFcfa:        numeric("prix_achat_moyen_kg_fcfa",      { precision: 12, scale: 2 }).default("0"),
  prixVenteMoyenKgFcfa:        numeric("prix_vente_moyen_kg_fcfa",      { precision: 12, scale: 2 }).default("0"),

  // Financier
  caVentesFcfa:                numeric("ca_ventes_fcfa",                { precision: 16, scale: 2 }).default("0"),
  coutAchatsFcfa:              numeric("cout_achats_fcfa",              { precision: 16, scale: 2 }).default("0"),
  chargesExploitationFcfa:     numeric("charges_exploitation_fcfa",     { precision: 16, scale: 2 }).default("0"),
  chargesPersonnelFcfa:        numeric("charges_personnel_fcfa",        { precision: 16, scale: 2 }).default("0"),
  margeBruteFcfa:              numeric("marge_brute_fcfa",              { precision: 16, scale: 2 }).default("0"),
  margeNetteFcfa:              numeric("marge_nette_fcfa",              { precision: 16, scale: 2 }).default("0"),
  margeKgFcfa:                 numeric("marge_kg_fcfa",                 { precision: 12, scale: 2 }).default("0"),

  // Membres
  nbMembresTotal:              integer("nb_membres_total").default(0),
  nbMembresFemmes:             integer("nb_membres_femmes").default(0),
  nbMembresCertifies:          integer("nb_membres_certifies").default(0),
  partsSocialesCollecteesFcfa: numeric("parts_sociales_collectees_fcfa",{ precision: 16, scale: 2 }).default("0"),

  // Avances & Intrants
  avancesOctroYeesFcfa:        numeric("avances_octroyees_fcfa",        { precision: 16, scale: 2 }).default("0"),
  avancesRembouRseesFcfa:      numeric("avances_remboursees_fcfa",      { precision: 16, scale: 2 }).default("0"),
  intrantsDistribuEsFcfa:      numeric("intrants_distribues_fcfa",      { precision: 16, scale: 2 }).default("0"),

  // Stocks
  nbLotsTotal:                 integer("nb_lots_total").default(0),
  nbLotsVendus:                integer("nb_lots_vendus").default(0),
  nbLotsRefoules:              integer("nb_lots_refoules").default(0),
  tonnageRefouleKg:            numeric("tonnage_refoule_kg",            { precision: 14, scale: 2 }).default("0"),

  // Traçabilité
  nbParcellesGps:              integer("nb_parcelles_gps").default(0),
  pctConformiteEudr:           numeric("pct_conformite_eudr",           { precision: 6, scale: 2 }).default("0"),

  // Dates
  dateOuverture:               date("date_ouverture",  { mode: "string" }),
  dateCloture:                 date("date_cloture",    { mode: "string" }),
  dureeJours:                  integer("duree_jours").default(0),

  // Métadonnées
  archivePar:                  integer("archive_par").references(() => usersTable.id),
  dateArchivage:               timestamp("date_archivage", { withTimezone: true }).defaultNow(),
  versionCoopdigital:          varchar("version_coopdigital", { length: 20 }),
  checksum:                    varchar("checksum", { length: 64 }),
});

export type ArchiveCampagne = typeof archivesCampagnesTable.$inferSelect;

export const archiveLivraisonsTable = pgTable("archive_livraisons", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:       integer("campagne_id").notNull().references(() => campagnesTable.id),
  livraisonId:      integer("livraison_id"),
  fournisseurId:    integer("fournisseur_id"),
  fournisseurNom:   text("fournisseur_nom"),
  fournisseurType:  varchar("fournisseur_type", { length: 50 }),
  poidsNetKg:       numeric("poids_net_kg", { precision: 10, scale: 2 }),
  prixUnitaireFcfa: integer("prix_unitaire_fcfa"),
  montantBrutFcfa:  integer("montant_brut_fcfa"),
  avanceDeduiteFcfa:integer("avance_deduite_fcfa"),
  montantNetFcfa:   integer("montant_net_fcfa"),
  dateLivraison:    date("date_livraison", { mode: "string" }),
  delegueNom:       text("delegue_nom"),
  zone:             text("zone"),
  createdAt:        timestamp("created_at", { withTimezone: true }),
});

export type ArchiveLivraison = typeof archiveLivraisonsTable.$inferSelect;

export const archiveMembreSnapshotTable = pgTable("archive_membres_snapshot", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:           integer("campagne_id").notNull().references(() => campagnesTable.id),
  membreId:             integer("membre_id"),
  nom:                  text("nom"),
  prenoms:              text("prenoms"),
  village:              text("village"),
  section:              text("section"),
  delegueNom:           text("delegue_nom"),
  tonnageLivreKg:       numeric("tonnage_livre_kg", { precision: 12, scale: 2 }).default("0"),
  montantPercuFcfa:     integer("montant_percu_fcfa").default(0),
  avancesRecuesFcfa:    integer("avances_recues_fcfa").default(0),
  scoreCampagne:        numeric("score_campagne", { precision: 6, scale: 2 }),
  niveauCampagne:       varchar("niveau_campagne", { length: 20 }),
  nbLivraisons:         integer("nb_livraisons").default(0),
  certifie:             boolean("certifie").default(false),
  actifCetteCampagne:   boolean("actif_cette_campagne").default(false),
});

export type ArchiveMembreSnapshot = typeof archiveMembreSnapshotTable.$inferSelect;
