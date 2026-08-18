import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Patch de rattrapage : applique des colonnes manquantes de façon idempotente,
 * avant que le runner Drizzle tente ses migrations.
 */
async function applyHotfixes(client: pg.Client): Promise<void> {
  const hotfixes = [
    `ALTER TABLE entrepots_delegues ADD COLUMN IF NOT EXISTS capacite_sacs integer`,
    `ALTER TABLE entrepots ADD COLUMN IF NOT EXISTS capacite_sacs integer`,
    `ALTER TABLE mouvements_stock ADD COLUMN IF NOT EXISTS nombre_sacs integer`,
    `ALTER TABLE config_paie ADD COLUMN IF NOT EXISTS smig_fcfa integer NOT NULL DEFAULT 75000`,
    // Paiement salaires : débit automatique des comptes de trésorerie
    `ALTER TYPE mode_paiement_personnel ADD VALUE IF NOT EXISTS 'banque'`,
    `ALTER TABLE mouvements_caisse ALTER COLUMN session_id DROP NOT NULL`,
    `ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS compte_source_type text`,
    `ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS compte_source_id integer`,
    // Migration 0045 : nombre_sacs sur expeditions (idempotent)
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS nombre_sacs integer`,
    // Migration 0046 : colonnes de liaison comptable sur expeditions (idempotent)
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_depart_id    integer`,
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_arrivee_id   integer`,
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_transport_id integer`,
    `ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS ecriture_ecart_id     integer`,

    // ── Hotfixes Railway : colonnes absentes des migrations 0024-0088 ─────────
    // livraisons : membre_id rendu nullable (migration 0055) + fournisseur_id
    `ALTER TABLE livraisons ALTER COLUMN membre_id DROP NOT NULL`,
    `ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS fournisseur_id integer`,
    // livraisons : peseur_id (migration dans 0068 / sessions_pesee)
    `ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS peseur_id integer`,
    // paiements : bon_carburant_id (migration 0087)
    `ALTER TABLE paiements ADD COLUMN IF NOT EXISTS bon_carburant_id integer`,
    // paiements : livraison_id rendu nullable (migration 0087)
    `ALTER TABLE paiements ALTER COLUMN livraison_id DROP NOT NULL`,
    // paiements : membre_id rendu nullable (migration 0057)
    `ALTER TABLE paiements ALTER COLUMN membre_id DROP NOT NULL`,
    // sessions_pesee : fournisseur_id pour les pesées de fournisseurs externes
    `ALTER TABLE sessions_pesee ADD COLUMN IF NOT EXISTS fournisseur_id integer REFERENCES fournisseurs(id)`,

    // ── Migration 0110 : commissions membres délégués de localités ────────────
    `CREATE TABLE IF NOT EXISTS taux_commissions_membres_delegues (
      id                serial PRIMARY KEY,
      cooperative_id    integer NOT NULL REFERENCES cooperatives(id),
      campagne_id       integer REFERENCES campagnes(id),
      membre_delegue_id integer REFERENCES membres(id),
      taux_fcfa_par_kg  numeric(10,4) NOT NULL,
      date_debut        date NOT NULL,
      date_fin          date,
      actif             boolean NOT NULL DEFAULT true,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS commissions_membres_delegues (
      id                  serial PRIMARY KEY,
      membre_delegue_id   integer NOT NULL REFERENCES membres(id),
      session_pesee_id    integer REFERENCES sessions_pesee(id),
      campagne_id         integer REFERENCES campagnes(id),
      taux_fcfa_par_kg    numeric(10,4) NOT NULL,
      poids_kg            numeric(10,2) NOT NULL,
      montant_fcfa        numeric(14,2) NOT NULL,
      statut              text NOT NULL DEFAULT 'en_attente',
      date_paiement       timestamptz,
      mode_paiement       text,
      reference_paiement  text,
      created_at          timestamptz NOT NULL DEFAULT now()
    )`,
    // Colonne ajoutée après la création initiale de la table
    `ALTER TABLE commissions_membres_delegues ADD COLUMN IF NOT EXISTS retenue_avances_fcfa integer NOT NULL DEFAULT 0`,
  ];

  for (const sql of hotfixes) {
    try {
      await client.query(sql);
    } catch (_) {
      // table n'existe pas encore — ignoré, les migrations créeront la table avec la colonne
    }
  }
}

/**
 * Baseline timestamp : when de la migration 0023 — dernière migration appliquée
 * via `drizzle-kit push` sur Railway lors de la mise en place initiale.
 * Toutes les migrations dont le timestamp ≤ cette valeur sont déjà présentes
 * en DB et ne doivent pas être ré-exécutées.
 *
 * Sans cette baseline, le migrator essaie de ré-appliquer 0000-0023
 * (tables déjà existantes), échoue, et les migrations 0024+ ne sont jamais
 * appliquées → colonnes manquantes en production.
 */
const BASELINE_CREATED_AT = 1781348700000n;

/**
 * S'assure que la table de tracking Drizzle existe et que le curseur baseline
 * est positionné correctement pour éviter de re-exécuter les migrations déjà
 * présentes via push.
 */
async function ensureBaseline(client: pg.Client): Promise<void> {
  // Créer le schéma et la table de tracking si absents
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // Détecter si la DB est vierge (table cooperatives absente).
  // Sur une DB fraîche (Replit dev), il ne faut PAS insérer la baseline :
  // toutes les migrations 0000-0103 doivent s'appliquer depuis le début.
  // Sur Railway/production, les tables 0000-0023 existent déjà via push →
  // on insère la baseline pour éviter de les ré-exécuter.
  const { rows: tableCheck } = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'cooperatives'
    ) AS exists
  `);
  const dbIsFresh = !tableCheck[0]?.exists;

  if (dbIsFresh) {
    // Supprimer toute entrée parasite dans le journal Drizzle (baseline insérée
    // lors d'une tentative précédente ayant échoué) pour que le migrator puisse
    // appliquer toutes les migrations depuis 0000.
    await client.query("DELETE FROM drizzle.__drizzle_migrations");
    console.log("[migrate] DB vierge détectée — journal réinitialisé, toutes les migrations seront appliquées depuis 0000");
    return;
  }

  // Lire le curseur actuel
  const { rows } = await client.query<{ last_ts: string | null }>(
    `SELECT MAX(created_at)::text AS last_ts FROM drizzle.__drizzle_migrations`
  );
  const lastTs = rows[0]?.last_ts ? BigInt(rows[0].last_ts) : 0n;

  if (lastTs < BASELINE_CREATED_AT) {
    // Positionner le curseur sur 0023 pour sauter toutes les migrations push
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["baseline-up-to-0023-push-setup", BASELINE_CREATED_AT]
    );
    console.log(
      `[migrate] Baseline insérée : migrations 0000-0023 marquées comme appliquées (lastTs=${lastTs} → ${BASELINE_CREATED_AT})`
    );
  } else {
    console.log(`[migrate] Curseur déjà à jour (last_ts=${lastTs})`);
  }
}

/**
 * Applique toutes les migrations SQL en attente depuis `migrationsFolder`.
 * Idempotent : chaque migration n'est exécutée qu'une seule fois
 * (suivi dans la table `drizzle.__drizzle_migrations`).
 *
 * Intègre la logique de baseline pour les DB initialisées via push
 * (Railway, Replit) où les tables 0000-0023 existent déjà sans entrée
 * dans la table de tracking.
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
    await applyHotfixes(client);
    await ensureBaseline(client);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] ✅ Toutes les migrations appliquées avec succès");
  } finally {
    await client.end();
  }
}
