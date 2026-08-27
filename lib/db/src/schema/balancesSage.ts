import { pgTable, serial, integer, varchar, date, timestamp, text, boolean, unique, index } from "drizzle-orm/pg-core";

export const balanceSageImportsTable = pgTable("balance_sage_imports", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  exercice: integer("exercice").notNull(),
  mode: varchar("mode", { length: 20 }).notNull(),
  nomFichier: varchar("nom_fichier", { length: 255 }).notNull(),
  empreinte: varchar("empreinte", { length: 64 }).notNull(),
  feuille: varchar("feuille", { length: 100 }).notNull(),
  statut: varchar("statut", { length: 30 }).notNull().default("importe"),
  nombreLignes: integer("nombre_lignes").notNull().default(0),
  nombreErreurs: integer("nombre_erreurs").notNull().default(0),
  comptesInconnus: integer("comptes_inconnus").notNull().default(0),
  compteContrepartie: varchar("compte_contrepartie", { length: 20 }),
  dateReprise: date("date_reprise"),
  prepareePar: integer("preparee_par"),
  prepareeLe: timestamp("preparee_le", { withTimezone: true }),
  valideePar: integer("validee_par"),
  valideeLe: timestamp("validee_le", { withTimezone: true }),
  nombreEcritures: integer("nombre_ecritures"),
  creePar: integer("cree_par"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("balance_sage_imports_coop_exercice_hash_mode_unique").on(t.cooperativeId, t.exercice, t.empreinte, t.mode),
]);

export const balanceSageLignesTable = pgTable("balance_sage_lignes", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").notNull(),
  numeroLigne: integer("numero_ligne").notNull(),
  numeroCompte: varchar("numero_compte", { length: 20 }).notNull(),
  libelle: varchar("libelle", { length: 300 }).notNull(),
  totalDebit: integer("total_debit").notNull().default(0),
  totalCredit: integer("total_credit").notNull().default(0),
  soldeDebiteur: integer("solde_debiteur").notNull().default(0),
  soldeCrediteur: integer("solde_crediteur").notNull().default(0),
  compteConnu: boolean("compte_connu").notNull().default(false),
  erreur: text("erreur"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("balance_sage_lignes_import_ligne_unique").on(t.importId, t.numeroLigne),
]);

/**
 * Journal immuable des tentatives de préparation et de validation des reprises.
 * L'état de l'import reste la source de vérité métier ; cette table conserve
 * également les tentatives qui ont échoué pour les contrôles d'audit.
 */
export const balanceSageRepriseAuditTable = pgTable("balance_sage_reprise_audit", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  importId: integer("import_id").notNull(),
  exercice: integer("exercice").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  statut: varchar("statut", { length: 20 }).notNull(),
  userId: integer("user_id"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("balance_sage_reprise_audit_coop_exercice_idx").on(t.cooperativeId, t.exercice),
  index("balance_sage_reprise_audit_import_idx").on(t.importId),
  index("balance_sage_reprise_audit_created_at_idx").on(t.createdAt),
]);