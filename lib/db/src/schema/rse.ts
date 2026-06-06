import {
  pgTable, serial, integer, varchar, numeric,
  timestamp, date, text,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";

export const indicateursRseTable = pgTable("indicateurs_rse", {
  id:            serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:    integer("campagne_id").notNull().references(() => campagnesTable.id),

  // DIMENSION SOCIALE (pct_femmes est GENERATED ALWAYS AS côté DB — ne pas insérer)
  nbMembresTotal:            integer("nb_membres_total"),
  nbMembresFemmes:           integer("nb_membres_femmes"),
  nbMembresJeunes:           integer("nb_membres_jeunes"),
  pctFemmes:                 numeric("pct_femmes", { precision: 5, scale: 2 }),
  revenuMoyenMembreFcfa:     numeric("revenu_moyen_membre_fcfa"),
  revenuMedianMembreFcfa:    numeric("revenu_median_membre_fcfa"),
  revenuMinMembreFcfa:       numeric("revenu_min_membre_fcfa"),
  revenuMaxMembreFcfa:       numeric("revenu_max_membre_fcfa"),
  seuilPauvreteFcfa:         numeric("seuil_pauvrete_fcfa").default("750000"),
  nbMembresSousSeuil:        integer("nb_membres_sous_seuil"),
  pctMembresSousSeuil:       numeric("pct_membres_sous_seuil", { precision: 5, scale: 2 }),

  // FORMATION & RENFORCEMENT
  nbFormationsDispensees:    integer("nb_formations_dispensees").default(0),
  nbBeneficiairesFormation:  integer("nb_beneficiaires_formation").default(0),
  thematiquesFormation:      text("thematiques_formation").array(),
  nbJoursFormation:          integer("nb_jours_formation").default(0),

  // DIMENSION ENVIRONNEMENTALE
  superficieTotaleHa:             numeric("superficie_totale_ha"),
  superficieCertifieeHa:          numeric("superficie_certifiee_ha"),
  pctSuperficieCertifiee:         numeric("pct_superficie_certifiee", { precision: 5, scale: 2 }),
  superficieSousOmbrageHa:        numeric("superficie_sous_ombrage_ha"),
  nbArbresPlantes:                integer("nb_arbres_plantes").default(0),
  superficieDeforestationEviteeHa:numeric("superficie_deforestation_evitee_ha").default("0"),
  nbParcellesConformesEudr:       integer("nb_parcelles_conformes_eudr"),
  pctConformiteEudr:              numeric("pct_conformite_eudr", { precision: 5, scale: 2 }),

  // CERTIFICATION
  nbMembresCertifiesUtz:       integer("nb_membres_certifies_utz").default(0),
  nbMembresCertifiesRainforest:integer("nb_membres_certifies_rainforest").default(0),
  nbMembresCertifiesFairtrade: integer("nb_membres_certifies_fairtrade").default(0),
  nbMembresCertifiesEudr:      integer("nb_membres_certifies_eudr").default(0),
  pctMembresCertifies:         numeric("pct_membres_certifies", { precision: 5, scale: 2 }),

  // ÉCONOMIQUE & GOUVERNANCE
  prixMoyenPayeKgFcfa:        numeric("prix_moyen_paye_kg_fcfa"),
  primeQualiteDistribueeFcfa: numeric("prime_qualite_distribuee_fcfa").default("0"),
  primeCertificationFcfa:     numeric("prime_certification_fcfa").default("0"),
  subventionsIntrantsFcfa:    numeric("subventions_intrants_fcfa").default("0"),
  tauxRemboursementAvancesPct:numeric("taux_remboursement_avances_pct", { precision: 5, scale: 2 }),
  nbAgTenues:                 integer("nb_ag_tenues").default(0),
  tauxParticipationAgPct:     numeric("taux_participation_ag_pct", { precision: 5, scale: 2 }).default("0"),

  engagementsCampagneSuivante: text("engagements_campagne_suivante"),
  dateCalcul:  timestamp("date_calcul"),
  calculePar:  integer("calcule_par").references(() => usersTable.id),
  createdAt:   timestamp("created_at").defaultNow(),
});

export const formationsRseTable = pgTable("formations_rse", {
  id:            serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:    integer("campagne_id").references(() => campagnesTable.id),
  titre:         varchar("titre"),
  thematique:    varchar("thematique"),
  dateFormation: date("date_formation", { mode: "string" }),
  lieu:          varchar("lieu"),
  formateur:     varchar("formateur"),
  nbParticipants:integer("nb_participants"),
  nbFemmes:      integer("nb_femmes"),
  dureeJours:    numeric("duree_jours", { precision: 4, scale: 1 }),
  financement:   varchar("financement"),
  createdAt:     timestamp("created_at").defaultNow(),
});

export type IndicateurRse = typeof indicateursRseTable.$inferSelect;
export type FormationRse  = typeof formationsRseTable.$inferSelect;
