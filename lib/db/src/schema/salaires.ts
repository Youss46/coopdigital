import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cooperativesTable } from "./cooperatives";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const employeStatutEnum = pgEnum("employe_statut", ["actif", "inactif"]);

export const fichePaieStatutEnum = pgEnum("fiche_paie_statut", [
  "brouillon",
  "valide",
  "paye",
]);

// ─── Table employés ──────────────────────────────────────────────────────────

export const employesTable = pgTable("employes", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  poste: text("poste").notNull(),
  telephone: text("telephone"),
  email: text("email"),
  dateEmbauche: date("date_embauche").notNull(),
  salaireBaseFcfa: integer("salaire_base_fcfa").notNull(),
  statut: employeStatutEnum("statut").notNull().default("actif"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertEmployeSchema = createInsertSchema(employesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmploye = z.infer<typeof insertEmployeSchema>;
export type Employe = typeof employesTable.$inferSelect;

// ─── Table fiches de paie ────────────────────────────────────────────────────

export const fichesPaieTable = pgTable("fiches_paie", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id")
    .notNull()
    .references(() => cooperativesTable.id),
  employeId: integer("employe_id")
    .notNull()
    .references(() => employesTable.id),
  mois: integer("mois").notNull(),           // 1–12
  annee: integer("annee").notNull(),
  salaireBaseFcfa: integer("salaire_base_fcfa").notNull(),
  primesFcfa: integer("primes_fcfa").notNull().default(0),
  indemnitésFcfa: integer("indemnites_fcfa").notNull().default(0),
  heuresSupFcfa: integer("heures_sup_fcfa").notNull().default(0),
  deductionCnpsFcfa: integer("deduction_cnps_fcfa").notNull().default(0),
  deductionImpotFcfa: integer("deduction_impot_fcfa").notNull().default(0),
  avanceSurSalaireFcfa: integer("avance_sur_salaire_fcfa").notNull().default(0),
  netAPayerFcfa: integer("net_a_payer_fcfa").notNull(),
  statut: fichePaieStatutEnum("statut").notNull().default("brouillon"),
  datePaiement: timestamp("date_paiement", { withTimezone: true }),
  observations: text("observations"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertFichePaieSchema = createInsertSchema(fichesPaieTable).omit({
  id: true,
  statut: true,
  datePaiement: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFichePaie = z.infer<typeof insertFichePaieSchema>;
export type FichePaie = typeof fichesPaieTable.$inferSelect;
