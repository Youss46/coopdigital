import {
  pgTable, pgEnum, serial, integer, numeric, varchar, timestamp, boolean, text, date, time,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { membresTable } from "./membres";

export const agTypeEnum      = pgEnum("ag_type",       ["ordinaire","extraordinaire","constitutive"]);
export const agStatutEnum    = pgEnum("ag_statut",     ["planifiee","ouverte","cloturee","annulee"]);
export const modePresEnum    = pgEnum("mode_pres",     ["physique","procuration"]);
export const pointTypeEnum   = pgEnum("point_type",    ["information","deliberation","vote","election"]);
export const pointStatutEnum = pgEnum("point_statut",  ["en_attente","en_cours","traite"]);
export const voteResultatEnum= pgEnum("vote_resultat", ["adopte","rejete","nul"]);
export const canalConvoEnum  = pgEnum("canal_convo",   ["sms","whatsapp","affichage"]);

export const assembleesGeneralesTable = pgTable("assemblees_generales", {
  id:                serial("id").primaryKey(),
  cooperativeId:     integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  type:              agTypeEnum("type").notNull().default("ordinaire"),
  libelle:           varchar("libelle", { length: 300 }).notNull(),
  dateAg:            date("date_ag").notNull(),
  heureDebut:        time("heure_debut"),
  heureFin:          time("heure_fin"),
  lieu:              varchar("lieu", { length: 300 }),
  ordreDuJour:       text("ordre_du_jour").array(),
  quorumRequisPct:   numeric("quorum_requis_pct", { precision: 5, scale: 2 }).notNull().default("50"),
  nbMembresConvoques:integer("nb_membres_convoques").default(0),
  nbMembresPresents: integer("nb_membres_presents").notNull().default(0),
  quorumAtteint:     boolean("quorum_atteint").notNull().default(false),
  statut:            agStatutEnum("statut").notNull().default("planifiee"),
  pvUrl:             varchar("pv_url", { length: 500 }),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const presencesAgTable = pgTable("presences_ag", {
  id:                  serial("id").primaryKey(),
  agId:                integer("ag_id").notNull().references(() => assembleesGeneralesTable.id),
  membreId:            integer("membre_id").notNull().references(() => membresTable.id),
  modePresence:        modePresEnum("mode_presence").notNull().default("physique"),
  mandataireId:        integer("mandataire_id").references(() => membresTable.id),
  heureArrivee:        timestamp("heure_arrivee", { withTimezone: true }),
  emargementNumerique: boolean("emargement_numerique").notNull().default(false),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pointsOrdreDuJourTable = pgTable("points_ordre_du_jour", {
  id:           serial("id").primaryKey(),
  agId:         integer("ag_id").notNull().references(() => assembleesGeneralesTable.id),
  numero:       integer("numero").notNull(),
  intitule:     varchar("intitule", { length: 500 }).notNull(),
  type:         pointTypeEnum("type").notNull().default("information"),
  rapporteur:   varchar("rapporteur", { length: 200 }),
  dureeMinutes: integer("duree_minutes"),
  statut:       pointStatutEnum("statut").notNull().default("en_attente"),
  decision:     text("decision"),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const votesAgTable = pgTable("votes_ag", {
  id:                 serial("id").primaryKey(),
  agId:               integer("ag_id").notNull().references(() => assembleesGeneralesTable.id),
  pointId:            integer("point_id").notNull().references(() => pointsOrdreDuJourTable.id),
  intituleResolution: varchar("intitule_resolution", { length: 500 }).notNull(),
  nbPour:             integer("nb_pour").notNull().default(0),
  nbContre:           integer("nb_contre").notNull().default(0),
  nbAbstention:       integer("nb_abstention").notNull().default(0),
  nbVotants:          integer("nb_votants").notNull().default(0),
  resultat:           voteResultatEnum("resultat").notNull().default("nul"),
  pourcentagePour:    numeric("pourcentage_pour", { precision: 5, scale: 2 }),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const convocationsAgTable = pgTable("convocations_ag", {
  id:            serial("id").primaryKey(),
  agId:          integer("ag_id").notNull().references(() => assembleesGeneralesTable.id),
  canal:         canalConvoEnum("canal").notNull().default("sms"),
  dateEnvoi:     timestamp("date_envoi", { withTimezone: true }).defaultNow().notNull(),
  nbEnvoyes:     integer("nb_envoyes").notNull().default(0),
  nbRecus:       integer("nb_recus").notNull().default(0),
  messageEnvoye: text("message_envoye"),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
