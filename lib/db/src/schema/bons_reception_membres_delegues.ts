import {
  pgTable, serial, integer, text, numeric, timestamp,
} from "drizzle-orm/pg-core";
import { cooperativesTable } from "./cooperatives";
import { membresTable }      from "./membres";
import { usersTable }        from "./users";
import { vehiculesTable }    from "./transport";
import { chauffeursTable }   from "./transport";

/**
 * Bon de réception créé par un magasinier ou un peseur quand un membre délégué
 * de localités arrive au magasin central avec son cacao.
 *
 * Statuts :
 *   en_attente_pesee → en_pesee → terminee
 *                    → annulee (si erreur)
 *
 * Transport :
 *   - "cooperatif" : véhicule + chauffeur choisis dans la flotte coop
 *   - "externe"    : infos saisies manuellement (membre a envoyé son propre camion)
 *
 * Frais avancés par la coopérative (carburant, autres) sont déduits du net
 * à reverser au membre sur le bordereau d'achat.
 */
export const bonsReceptionMembresDeleguesTable = pgTable("bons_reception_membres_delegues", {
  id:                   serial("id").primaryKey(),
  cooperativeId:        integer("cooperative_id").notNull().references(() => cooperativesTable.id),
  membreDelegueId:      integer("membre_delegue_id").notNull().references(() => membresTable.id),
  /** Champ historique conservé pour les bons créés avant la traçabilité générique. */
  magasinierId:         integer("magasinier_id").references(() => usersTable.id),
  /** Identité et rôle de la personne qui a effectivement enregistré le bon. */
  creeParId:            integer("cree_par_id").references(() => usersTable.id),
  creeParRole:          text("cree_par_role"),

  // ── Statut ────────────────────────────────────────────────────────────────
  statut: text("statut").notNull().default("en_attente_pesee"),
  // en_attente_pesee | en_pesee | terminee | annulee

  // ── Poids déclaré (informatif, vérifié à la pesée) ────────────────────────
  poidsDeclaraKg:       numeric("poids_declare_kg", { precision: 10, scale: 2 }),
  nombreSacsDeclares:   integer("nombre_sacs_declares"),

  // ── Transport ─────────────────────────────────────────────────────────────
  typeTransport:        text("type_transport").notNull().default("externe"),
  // "cooperatif" : sélectionner dans la flotte
  vehiculeId:           integer("vehicule_id").references(() => vehiculesTable.id),
  chauffeurId:          integer("chauffeur_id").references(() => chauffeursTable.id),
  // "externe" : saisie manuelle
  typeVehicule:         text("type_vehicule"),
  immatriculation:      text("immatriculation"),
  nomChauffeur:         text("nom_chauffeur"),
  telephoneChauffeur:   text("telephone_chauffeur"),

  // ── Frais avancés par la coopérative (déduits du net membre) ──────────────
  fraisCarburantFcfa:   integer("frais_carburant_fcfa").notNull().default(0),
  autresChargesFcfa:    integer("autres_charges_fcfa").notNull().default(0),
  autresChargesLibelle: text("autres_charges_libelle"),

  notes:                text("notes"),

  // ── Session de pesée associée (renseignée quand le peseur démarre) ─────────
  sessionPeseeId:       integer("session_pesee_id"), // plain int — pas de FK pour éviter cycle

  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BonReceptionMembreDelegue =
  typeof bonsReceptionMembresDeleguesTable.$inferSelect;
export type BonReceptionMembreDelegueInsert =
  typeof bonsReceptionMembresDeleguesTable.$inferInsert;
