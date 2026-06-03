import { pgTable, serial, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membresTable } from "./membres";
import { usersTable } from "./users";

export const livraisonsTable = pgTable("livraisons", {
  id: serial("id").primaryKey(),
  membreId: integer("membre_id")
    .notNull()
    .references(() => membresTable.id),
  poidsKg: numeric("poids_kg", { precision: 8, scale: 2 }).notNull(),
  prixUnitaireFcfa: integer("prix_unitaire_fcfa").notNull(),
  montantBrutFcfa: integer("montant_brut_fcfa").notNull(),
  avanceDeduiteFcfa: integer("avance_deduite_fcfa").notNull().default(0),
  montantNetFcfa: integer("montant_net_fcfa").notNull(),
  dateLivraison: date("date_livraison").notNull(),
  agentId: integer("agent_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
