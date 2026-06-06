import {
  pgTable, serial, integer, numeric, varchar, jsonb, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { campagnesTable } from "./campagnes";
import { usersTable } from "./users";

export const previsionsCampagneTable = pgTable("previsions_campagne", {
  id:                         serial("id").primaryKey(),
  cooperativeId:              integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:                 integer("campagne_id").notNull().references(() => campagnesTable.id),

  tonnagePrevuKg:             numeric("tonnage_prevu_kg", { precision: 14, scale: 2 }),
  prixAchatPrevuFcfa:         numeric("prix_achat_prevu_fcfa", { precision: 12, scale: 0 }),
  prixVentePrevuFcfa:         numeric("prix_vente_prevu_fcfa", { precision: 12, scale: 0 }),
  nbMembresPrevus:            integer("nb_membres_prevus"),
  nbSemainesCampagne:         integer("nb_semaines_campagne"),

  caPrevuFcfa:                numeric("ca_prevu_fcfa", { precision: 16, scale: 0 }),
  coutAchatPrevuFcfa:         numeric("cout_achat_prevu_fcfa", { precision: 16, scale: 0 }),
  margeBrutePrevueFcfa:       numeric("marge_brute_prevue_fcfa", { precision: 16, scale: 0 }),
  margeKgPrevueFcfa:          numeric("marge_kg_prevue_fcfa", { precision: 10, scale: 0 }),

  tonnageRythmeActuelKg:      numeric("tonnage_rythme_actuel_kg", { precision: 14, scale: 2 }),
  caProjectionFinFcfa:        numeric("ca_projection_fin_fcfa", { precision: 16, scale: 0 }),
  margeProjectionFinFcfa:     numeric("marge_projection_fin_fcfa", { precision: 16, scale: 0 }),
  ecartTonnagePct:            numeric("ecart_tonnage_pct", { precision: 8, scale: 2 }),
  ecartCaPct:                 numeric("ecart_ca_pct", { precision: 8, scale: 2 }),

  dateDerniereProjection:     timestamp("date_derniere_projection", { withTimezone: true }),
  createdAt:                  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:                  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PrevisionCampagne = typeof previsionsCampagneTable.$inferSelect;

export const simulationsTable = pgTable("simulations", {
  id:             serial("id").primaryKey(),
  cooperativeId:  integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId:     integer("campagne_id").references(() => campagnesTable.id),
  nomSimulation:  varchar("nom_simulation", { length: 200 }).notNull(),
  type:           varchar("type", { length: 20 }).notNull().default("mix"),
  parametres:     jsonb("parametres").notNull().default({}),
  resultats:      jsonb("resultats").notNull().default({}),
  createdBy:      integer("created_by").references(() => usersTable.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Simulation = typeof simulationsTable.$inferSelect;
