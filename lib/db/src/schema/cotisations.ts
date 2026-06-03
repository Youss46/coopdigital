import { pgTable, serial, integer, smallint, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";

export const cotisationStatutEnum = pgEnum("cotisation_statut", ["paye", "en_attente", "partiel"]);

export const cotisationsTable = pgTable("cotisations", {
  id: serial("id").primaryKey(),
  membreId: integer("membre_id")
    .notNull()
    .references(() => membresTable.id, { onDelete: "cascade" }),
  montantFcfa: integer("montant_fcfa").notNull(),
  annee: smallint("annee").notNull(),
  statutPaiement: cotisationStatutEnum("statut_paiement").notNull().default("en_attente"),
  datePaiement: date("date_paiement"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCotisationSchema = createInsertSchema(cotisationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCotisation = z.infer<typeof insertCotisationSchema>;
export type Cotisation = typeof cotisationsTable.$inferSelect;
