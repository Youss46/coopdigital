import {
  pgTable, serial, text, integer, numeric,
  timestamp, date, uuid, pgEnum,
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

  // Données démographiques (RSE)
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
