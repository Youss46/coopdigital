import { pgTable, serial, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const webauthnCredentialsTable = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").unique().notNull(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: text("transports"),
  nomAppareil: text("nom_appareil"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  derniereUtilisation: timestamp("derniere_utilisation", { withTimezone: true }),
});

export const insertWebauthnCredentialSchema = createInsertSchema(webauthnCredentialsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWebauthnCredential = z.infer<typeof insertWebauthnCredentialSchema>;
export type WebauthnCredential = typeof webauthnCredentialsTable.$inferSelect;
