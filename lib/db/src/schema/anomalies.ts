import {
  pgTable, serial, integer, numeric, varchar, text, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";

export const anomaliesTable = pgTable("anomalies", {
  id:                     serial("id").primaryKey(),
  cooperativeId:          integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  typeAnomalie:           varchar("type_anomalie",  { length: 100 }).notNull(),
  niveauGravite:          varchar("niveau_gravite", { length: 20  }).notNull().$type<"info" | "attention" | "critique">(),
  moduleSource:           varchar("module_source",  { length: 50  }).notNull(),
  entiteId:               integer("entite_id"),
  entiteType:             varchar("entite_type",    { length: 50  }),
  description:            varchar("description",    { length: 500 }).notNull(),
  valeurDetectee:         numeric("valeur_detectee"),
  seuilConfigure:         numeric("seuil_configure"),
  agentId:                integer("agent_id"),
  membreId:               integer("membre_id").references(() => membresTable.id),
  statut:                 varchar("statut", { length: 20 }).notNull().default("nouvelle")
                            .$type<"nouvelle" | "en_cours" | "resolue" | "ignoree" | "faux_positif">(),
  traitePar:              integer("traite_par"),
  traiteLe:               timestamp("traite_le",   { withTimezone: true }),
  commentaireTraitement:  text("commentaire_traitement"),
  createdAt:              timestamp("created_at",  { withTimezone: true }).defaultNow().notNull(),
});

export const configAnomaliesTable = pgTable("config_anomalies", {
  id:                         serial("id").primaryKey(),
  cooperativeId:              integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  poidsMaxLivraisonKg:        numeric("poids_max_livraison_kg").default("5000"),
  poidsMoyenMultiplicateur:   numeric("poids_moyen_multiplicateur").default("3"),
  delaiMinEntreLivraisonsH:   integer("delai_min_entre_livraisons_h").default(12),
  avanceMaxFcfa:              numeric("avance_max_fcfa").default("500000"),
  avanceSiRetardExistant:     boolean("avance_si_retard_existant").default(true),
  sortieMaxPctStock:          numeric("sortie_max_pct_stock").default("80"),
  paiementSansLivraison:      boolean("paiement_sans_livraison").default(true),
  doublonPaiementDelaiH:      integer("doublon_paiement_delai_h").default(24),
  ecritureMontantMaxFcfa:     numeric("ecriture_montant_max_fcfa").default("10000000"),
  ecartReconciliationPct:     numeric("ecart_reconciliation_pct").default("1"),
  updatedAt:                  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Anomalie = typeof anomaliesTable.$inferSelect;
export type ConfigAnomalie = typeof configAnomaliesTable.$inferSelect;
