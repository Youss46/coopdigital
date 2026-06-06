import { pgTable, pgEnum, serial, integer, varchar, date, timestamp, boolean, text } from "drizzle-orm/pg-core";

export const typeCompteEnum = pgEnum("type_compte", ["actif", "passif", "charge", "produit"]);
export const sourceEcritureEnum = pgEnum("source_ecriture", ["livraison", "vente", "avance", "paiement", "manuel", "encaissement", "salaire", "stock", "don"]);
export const statutExerciceEnum = pgEnum("statut_exercice", ["ouvert", "cloture"]);
export const sourceEcritureAttenteEnum = pgEnum("source_ecriture_attente", ["livraison", "paiement", "avance", "vente", "encaissement", "salaire", "stock", "don"]);
export const statutEcritureAttenteEnum = pgEnum("statut_ecriture_attente", ["en_attente", "validee", "rejetee", "modifiee"]);

export const planComptableTable = pgTable("plan_comptable", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull(),
  numeroCompte:     varchar("numero_compte", { length: 20 }).notNull(),
  libelle:          varchar("libelle", { length: 200 }).notNull(),
  type:             typeCompteEnum("type").notNull(),
  classe:           integer("classe"),
  compteParent:     varchar("compte_parent", { length: 20 }),
  soldeNormal:      varchar("solde_normal", { length: 20 }).default("debiteur"),
  actif:            boolean("actif").notNull().default(true),
  ordreAffichage:   integer("ordre_affichage"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }),
});

export const parametresComptesModulesTable = pgTable("parametres_comptes_modules", {
  id:                  serial("id").primaryKey(),
  cooperativeId:       integer("cooperative_id").notNull(),
  module:              varchar("module", { length: 50 }).notNull(),
  operation:           varchar("operation", { length: 100 }).notNull(),
  compteDebit:         varchar("compte_debit", { length: 20 }).notNull(),
  compteCredit:        varchar("compte_credit", { length: 20 }).notNull(),
  libelleEcritureAuto: varchar("libelle_ecriture_auto", { length: 300 }),
  actif:               boolean("actif").notNull().default(true),
  modifiePar:          integer("modifie_par"),
  updatedAt:           timestamp("updated_at", { withTimezone: true }),
});

export const ecrituresComptablesTable = pgTable("ecritures_comptables", {
  id:               serial("id").primaryKey(),
  cooperativeId:    integer("cooperative_id").notNull(),
  dateEcriture:     date("date_ecriture").notNull(),
  numeroPiece:      varchar("numero_piece", { length: 50 }),
  libelle:          varchar("libelle", { length: 300 }).notNull(),
  compteDebit:      varchar("compte_debit", { length: 20 }).notNull(),
  compteCredit:     varchar("compte_credit", { length: 20 }).notNull(),
  montantFcfa:      integer("montant_fcfa").notNull(),
  source:           sourceEcritureEnum("source").notNull(),
  sourceId:         integer("source_id"),
  exercice:         integer("exercice").notNull(),
  typeEcriture:     varchar("type_ecriture", { length: 20 }).notNull().default("normale"),
  ecritureSourceId: integer("ecriture_source_id"),
  motifCorrection:  text("motif_correction"),
  corrigePar:       integer("corrige_par"),
  corrigeLe:        timestamp("corrige_le", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exercicesTable = pgTable("exercices", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull(),
  annee:          integer("annee").notNull(),
  statut:         statutExerciceEnum("statut").notNull().default("ouvert"),
  dateOuverture:  timestamp("date_ouverture", { withTimezone: true }).notNull().defaultNow(),
  dateCloture:    timestamp("date_cloture", { withTimezone: true }),
});

export const configComptableTable = pgTable("config_comptable", {
  id:                 serial("id").primaryKey(),
  cooperativeId:      integer("cooperative_id").notNull(),
  autoLivraisons:     boolean("auto_livraisons").notNull().default(false),
  autoPaiements:      boolean("auto_paiements").notNull().default(false),
  autoAvances:        boolean("auto_avances").notNull().default(false),
  autoVentesExport:   boolean("auto_ventes_export").notNull().default(false),
  autoEncaissements:  boolean("auto_encaissements").notNull().default(false),
  autoSalaires:       boolean("auto_salaires").notNull().default(false),
  autoStocks:         boolean("auto_stocks").notNull().default(false),
  autoDons:           boolean("auto_dons").notNull().default(false),
  modifiePar:         integer("modifie_par"),
  updatedAt:          timestamp("updated_at", { withTimezone: true }),
});

export const ecrituresEnAttenteTable = pgTable("ecritures_en_attente", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull(),
  source:               sourceEcritureAttenteEnum("source").notNull(),
  sourceId:             integer("source_id"),
  libelleProppose:      varchar("libelle_propose", { length: 300 }).notNull(),
  compteDebitPropose:   varchar("compte_debit_propose", { length: 20 }).notNull(),
  compteCreditPropose:  varchar("compte_credit_propose", { length: 20 }).notNull(),
  montantFcfa:          integer("montant_fcfa").notNull(),
  dateProposee:         date("date_proposee").notNull(),
  statut:               statutEcritureAttenteEnum("statut").notNull().default("en_attente"),
  commentaireComptable: text("commentaire_comptable"),
  creeLe:               timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  traiteLe:             timestamp("traite_le", { withTimezone: true }),
  traitePar:            integer("traite_par"),
});
