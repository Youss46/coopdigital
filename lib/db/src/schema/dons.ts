import {
  pgTable, serial, integer, varchar, text, date, timestamp, boolean, numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const categoriesDonsTable = pgTable("categories_dons", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  libelle: varchar("libelle", { length: 200 }).notNull(),
  sens: varchar("sens", { length: 20 }).notNull(), // 'effectue' | 'recu'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const donsTable = pgTable("dons", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  campagneId: integer("campagne_id"),

  // Sens et forme
  sens: varchar("sens", { length: 20 }).notNull(), // 'effectue' | 'recu'
  forme: varchar("forme", { length: 20 }).notNull(), // 'especes' | 'nature'
  categorieId: integer("categorie_id"),

  // Référence
  reference: varchar("reference", { length: 50 }).unique(),
  libelle: varchar("libelle", { length: 300 }).notNull(),
  description: text("description"),
  dateDon: date("date_don").notNull(),

  // Bénéficiaire (si don effectué)
  beneficiaireType: varchar("beneficiaire_type", { length: 50 }),
  beneficiaireMembreId: integer("beneficiaire_membre_id"),
  beneficiaireNom: varchar("beneficiaire_nom", { length: 200 }),
  beneficiaireVillage: varchar("beneficiaire_village", { length: 200 }),
  beneficiaireContact: varchar("beneficiaire_contact", { length: 100 }),

  // Donateur (si don reçu)
  donateurType: varchar("donateur_type", { length: 50 }),
  donateurNom: varchar("donateur_nom", { length: 200 }),
  donateurContact: varchar("donateur_contact", { length: 100 }),

  // Montant espèces
  montantFcfa: numeric("montant_fcfa").default("0"),

  // Don en nature
  valeurEstimeeFcfa: numeric("valeur_estimee_fcfa").default("0"),

  // Validation
  statut: varchar("statut", { length: 20 }).notNull().default("brouillon"), // brouillon | valide | annule
  validePar: integer("valide_par"),
  dateValidation: timestamp("date_validation", { withTimezone: true }),
  motifAnnulation: text("motif_annulation"),

  // Justificatif
  pvRemise: boolean("pv_remise").default(false),
  pvUrl: varchar("pv_url", { length: 500 }),
  photoUrl: varchar("photo_url", { length: 500 }),

  // Comptabilité
  ecritureGeneree: boolean("ecriture_generee").default(false),

  // Méta
  enregistrePar: integer("enregistre_par"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const lignesDonNatureTable = pgTable("lignes_don_nature", {
  id: serial("id").primaryKey(),
  donId: integer("don_id").notNull(),
  designation: varchar("designation", { length: 300 }).notNull(),
  quantite: numeric("quantite").notNull(),
  unite: varchar("unite", { length: 50 }).notNull(),
  valeurUnitaireFcfa: numeric("valeur_unitaire_fcfa").notNull(),
  valeurTotaleFcfa: numeric("valeur_totale_fcfa").generatedAlwaysAs(
    sql`quantite * valeur_unitaire_fcfa`,
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programmeDonsTable = pgTable("programme_dons", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  libelle: varchar("libelle", { length: 300 }).notNull(),
  description: text("description"),
  budgetAlloueFcfa: numeric("budget_alloue_fcfa").notNull(),
  budgetUtiliseFcfa: numeric("budget_utilise_fcfa").default("0"),
  dateDebut: date("date_debut"),
  dateFin: date("date_fin"),
  statut: varchar("statut", { length: 20 }).notNull().default("actif"), // actif | cloture
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
