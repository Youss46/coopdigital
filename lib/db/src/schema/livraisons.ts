import { pgTable, serial, integer, numeric, text, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";
import { usersTable } from "./users";
import { campagnesTable } from "./campagnes";
import { balancesTable } from "./pesee";

export const livraisonsTable = pgTable("livraisons", {
  id: serial("id").primaryKey(),
  membreId: integer("membre_id")
    .notNull()
    .references(() => membresTable.id),
  campagneId: integer("campagne_id").references(() => campagnesTable.id),

  // Champs enrichis GESTCOOP
  codeAchat: text("code_achat").unique(),
  produit: text("produit").default("cacao"),
  produitBrutKg: numeric("produit_brut_kg", { precision: 10, scale: 2 }),
  nombreSacs: integer("nombre_sacs"),
  retenueKg: numeric("retenue_kg", { precision: 10, scale: 2 }).default("0"),
  poidsNetKg: numeric("poids_net_kg", { precision: 10, scale: 2 }),
  typeFournisseur: text("type_fournisseur"),
  sectionLivraison: text("section_livraison"),

  // Champs existants
  poidsKg: numeric("poids_kg", { precision: 8, scale: 2 }).notNull(),
  prixUnitaireFcfa: integer("prix_unitaire_fcfa").notNull(),
  montantBrutFcfa: integer("montant_brut_fcfa").notNull(),
  avanceDeduiteFcfa: integer("avance_deduite_fcfa").notNull().default(0),
  intrantsDeduitsFcfa: integer("intrants_deduits_fcfa").notNull().default(0),
  montantNetFcfa: integer("montant_net_fcfa").notNull(),
  dateLivraison: date("date_livraison", { mode: "string" }).notNull(),
  agentId: integer("agent_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  // Pesée enrichie (migration 026)
  balanceId:             integer("balance_id").references(() => balancesTable.id),
  peseurId:              integer("peseur_id").references(() => usersTable.id),
  poidsBrut1erePeseeKg:  numeric("poids_brut_1ere_pesee_kg", { precision: 10, scale: 3 }),
  poidsBrut2emePeseeKg:  numeric("poids_brut_2eme_pesee_kg", { precision: 10, scale: 3 }),
  ecartPeseeKg:          numeric("ecart_pesee_kg", { precision: 10, scale: 3 }),
  ecartPeseePct:         numeric("ecart_pesee_pct", { precision: 6, scale: 3 }),
  poidsRetenuKg:         numeric("poids_retenu_kg", { precision: 10, scale: 3 }),
  doublePeseeRequise:    boolean("double_pesee_requise").default(false),
  doublePeseeEffectuee:  boolean("double_pesee_effectuee").default(false),
  litigePesee:           boolean("litige_pesee").default(false),

  // Paiement différé
  statutPaiement:       text("statut_paiement").default("PAYÉ"),
  montantRestant:       numeric("montant_restant", { precision: 12, scale: 2 }).default("0"),
  datePaiementPrevue:   date("date_paiement_prevue", { mode: "string" }),
});

export const insertLivraisonSchema = createInsertSchema(livraisonsTable).omit({
  id: true,
  montantBrutFcfa: true,
  avanceDeduiteFcfa: true,
  montantNetFcfa: true,
  createdAt: true,
});
export type InsertLivraison = z.infer<typeof insertLivraisonSchema>;
export type Livraison = typeof livraisonsTable.$inferSelect;
