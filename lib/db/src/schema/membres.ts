import {
  pgTable, serial, text, integer, numeric,
  timestamp, date, uuid, pgEnum, varchar, boolean, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";

export const membreStatutEnum = pgEnum("membre_statut", ["actif", "inactif"]);

export const membresTable = pgTable("membres", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  numeroCni: text("numero_cni"),
  telephone: text("telephone").notNull(),
  village: text("village"),
  groupement: text("groupement"),
  superficieHa: numeric("superficie_ha", { precision: 8, scale: 2 }).notNull(),
  statut: membreStatutEnum("statut").notNull().default("actif"),
  qrCodeToken: uuid("qr_code_token").notNull().defaultRandom().unique(),
  dateAdhesion: date("date_adhesion", { mode: "string" }).notNull(),
  photoUrl: text("photo_url"),
  parcelleLat: numeric("parcelle_lat", { precision: 10, scale: 7 }),
  parcelleLng: numeric("parcelle_lng", { precision: 10, scale: 7 }),

  // Données démographiques
  sexe:           text("sexe"),
  dateNaissance:  date("date_naissance", { mode: "string" }),

  // Parts sociales & enrichissement GESTCOOP
  typeFournisseur: text("type_fournisseur"),
  section: text("section"),
  lieuNaissance: text("lieu_naissance"),
  nationalite: text("nationalite").default("Ivoirienne"),
  nbrePartsSouscrites: integer("nbre_parts_souscrites").notNull().default(0),
  valeurNominalePartFcfa: integer("valeur_nominale_part_fcfa").notNull().default(0),
  totalSouscritFcfa: integer("total_souscrit_fcfa").notNull().default(0),
  totalLibereFcfa: integer("total_libere_fcfa").notNull().default(0),
  resteALibererFcfa: integer("reste_a_liberer_fcfa").notNull().default(0),

  // Rattachement délégué de localité
  delegueId: integer("delegue_id"),
  rattachementType: varchar("rattachement_type", { length: 20 }).default("delegue"),
  zoneType: varchar("zone_type", { length: 20 }),
  zoneNom: text("zone_nom"),
  creeParDelegue: boolean("cree_par_delegue").default(false),

  // ── Workflow de validation ──────────────────────────────────────────────────
  statutMembre: varchar("statut_membre", { length: 20 }).default("en_attente"),
  // 'en_attente' | 'actif' | 'rejete' | 'suspendu' | 'archive'
  creePar: varchar("cree_par", { length: 30 }),
  // 'delegue' | 'directeur' | 'pca' | 'responsable_tracabilite' | 'migration'
  demandeParDelegueId: integer("demande_par_delegue_id"),
  motifRejet: text("motif_rejet"),
  validePar: integer("valide_par"),
  dateValidation: timestamp("date_validation", { withTimezone: true }),

  // ── Carte producteur (Ministère de l'Agriculture) ───────────────────────────
  carteProducteur: varchar("carte_producteur", { length: 100 }),

  // ── Contact enrichi ─────────────────────────────────────────────────────────
  telephoneSecondaire: varchar("telephone_secondaire", { length: 20 }),

  // ── Parcelles enrichies ─────────────────────────────────────────────────────
  nombreParcelles: integer("nombre_parcelles"),
  superficieTotale: numeric("superficie_totale", { precision: 10, scale: 2 }),
  gpsParcelles: jsonb("gps_parcelles"),
  // [{ parcelle: 1, lat: x, lng: y, superficie: z, polygone: [...], photos: [...] }]
  culturePrincipale: varchar("culture_principale", { length: 50 }),
  polygoneGps: jsonb("polygone_gps"),

  // ── EUDR / Traçabilité ──────────────────────────────────────────────────────
  certification: varchar("certification", { length: 50 }),
  documentsJoints: jsonb("documents_joints"),

  // ── Carte de membre ─────────────────────────────────────────────────────────
  carteStatut:      varchar("carte_statut", { length: 20 }).default("non_emise"),
  // 'non_emise' | 'active' | 'suspendue'
  carteNumero:      varchar("carte_numero", { length: 50 }),
  carteGenereLe:    timestamp("carte_genere_le", { withTimezone: true }),
  carteSuspendueLe: timestamp("carte_suspendue_le", { withTimezone: true }),

  // ── Complétion & terrain ────────────────────────────────────────────────────
  completudeFiche: integer("completude_fiche").default(0),
  completudeIdentite: integer("completude_identite").default(0),
  completudeEudr: integer("completude_eudr").default(0),
  statutEudr: varchar("statut_eudr", { length: 20 }).default("non_conforme"),
  missionGpsRequise: boolean("mission_gps_requise").default(false),
  gpsCollectePar: integer("gps_collecte_par"),
  gpsValidePar: integer("gps_valide_par"),
  dateCollecteGps: timestamp("date_collecte_gps", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMembreSchema = createInsertSchema(membresTable).omit({
  id: true,
  qrCodeToken: true,
  totalSouscritFcfa: true,
  resteALibererFcfa: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMembre = z.infer<typeof insertMembreSchema>;
export type Membre = typeof membresTable.$inferSelect;
