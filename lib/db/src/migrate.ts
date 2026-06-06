import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Applique toutes les migrations SQL en attente depuis `migrationsFolder`.
 * Idempotent : chaque migration n'est exécutée qu'une seule fois
 * (suivi dans la table `__drizzle_migrations`).
 *
 * @param migrationsFolder - Chemin absolu vers le dossier contenant les fichiers SQL.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL est requis pour appliquer les migrations");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
