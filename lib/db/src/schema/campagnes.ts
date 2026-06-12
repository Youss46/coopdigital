import { pgTable, serial, integer, text, date, timestamp, pgEnum, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

export const campagneStatutEnum = pgEnum("campagne_statut", ["ouverte", "fermee"]);

export const campagnesTable = pgTable("campagnes", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  libelle: text("libelle").notNull(),
  anneeDebut: integer("annee_debut").notNull(),
  anneeFin: integer("annee_fin").notNull(),
  dateOuverture: date("date_ouverture", { mode: "string" }).notNull(),
  dateFermeture: date("date_fermeture", { mode: "string" }),
  statut: campagneStatutEnum("statut").notNull().default("ouverte"),
  tonnageCibleKg: numeric("tonnage_cible_kg", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCampagneSchema = createInsertSchema(campagnesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCampagne = z.infer<typeof insertCampagneSchema>;
export type Campagne = typeof campagnesTable.$inferSelect;

export const bilansCampagneTable = pgTable("bilans_campagne", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  campagneId: integer("campagne_id").notNull().references(() => campagnesTable.id),

  tonnageTotalKg: numeric("tonnage_total_kg", { precision: 14, scale: 2 }).default("0"),
  tonnageMembresKg: numeric("tonnage_membres_kg", { precision: 14, scale: 2 }).default("0"),
  tonnagePisteursKg: numeric("tonnage_pisteurs_kg", { precision: 14, scale: 2 }).default("0"),
  tonnageExternesKg: numeric("tonnage_externes_kg", { precision: 14, scale: 2 }).default("0"),
  nbLivraisons: integer("nb_livraisons").default(0),
  nbMembresActifs: integer("nb_membres_actifs").default(0),
  nbFournisseursTotal: integer("nb_fournisseurs_total").default(0),
  prixAchatMoyenKgFcfa: numeric("prix_achat_moyen_kg_fcfa", { precision: 12, scale: 2 }).default("0"),

  tonnageVenduKg: numeric("tonnage_vendu_kg", { precision: 14, scale: 2 }).default("0"),
  caVentesFcfa: numeric("ca_ventes_fcfa", { precision: 16, scale: 2 }).default("0"),
  prixVenteMoyenKgFcfa: numeric("prix_vente_moyen_kg_fcfa", { precision: 12, scale: 2 }).default("0"),
  nbExportateurs: integer("nb_exportateurs").default(0),
  creancesRestantesFcfa: numeric("creances_restantes_fcfa", { precision: 16, scale: 2 }).default("0"),

  coutAchatTotalFcfa: numeric("cout_achat_total_fcfa", { precision: 16, scale: 2 }).default("0"),
  chargesExploitationFcfa: numeric("charges_exploitation_fcfa", { precision: 16, scale: 2 }).default("0"),
  chargesPersonnelFcfa: numeric("charges_personnel_fcfa", { precision: 16, scale: 2 }).default("0"),
  chargesFinancieresFcfa: numeric("charges_financieres_fcfa", { precision: 16, scale: 2 }).default("0"),
  margeBruteFcfa: numeric("marge_brute_fcfa", { precision: 16, scale: 2 }).default("0"),
  margeNetteFcfa: numeric("marge_nette_fcfa", { precision: 16, scale: 2 }).default("0"),
  margeKgFcfa: numeric("marge_kg_fcfa", { precision: 12, scale: 2 }).default("0"),

  avancesOctroYeesFcfa: numeric("avances_octroyees_fcfa", { precision: 16, scale: 2 }).default("0"),
  avancesRembouRseesFcfa: numeric("avances_remboursees_fcfa", { precision: 16, scale: 2 }).default("0"),
  avancesSoldeFcfa: numeric("avances_solde_fcfa", { precision: 16, scale: 2 }).default("0"),
  intrantsDistribuEsFcfa: numeric("intrants_distribues_fcfa", { precision: 16, scale: 2 }).default("0"),
  intrantsRecouVresFcfa: numeric("intrants_recouvres_fcfa", { precision: 16, scale: 2 }).default("0"),

  partsSocialesCollecteesFcfa: numeric("parts_sociales_collectees_fcfa", { precision: 16, scale: 2 }).default("0"),
  cotisationsCollecteesFcfa: numeric("cotisations_collectees_fcfa", { precision: 16, scale: 2 }).default("0"),

  variationTonnagePct: numeric("variation_tonnage_pct", { precision: 8, scale: 2 }),
  variationCaPct: numeric("variation_ca_pct", { precision: 8, scale: 2 }),
  variationMargePct: numeric("variation_marge_pct", { precision: 8, scale: 2 }),

  dateGeneration: timestamp("date_generation", { withTimezone: true }).defaultNow(),
  generePar: integer("genere_par").references(() => usersTable.id),
});

export type BilanCampagne = typeof bilansCampagneTable.$inferSelect;

export const verificationsClotureCampagneTable = pgTable("verifications_cloture", {
  id: serial("id").primaryKey(),
  campagneId: integer("campagne_id").notNull().references(() => campagnesTable.id),
  code: varchar("code", { length: 10 }).notNull(),
  verification: varchar("verification", { length: 255 }).notNull(),
  statut: varchar("statut", { length: 20 }).notNull().$type<"ok" | "bloquant" | "avertissement">(),
  message: varchar("message", { length: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type VerificationCloture = typeof verificationsClotureCampagneTable.$inferSelect;
