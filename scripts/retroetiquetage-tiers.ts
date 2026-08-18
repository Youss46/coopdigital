/**
 * Rétro-étiquetage tiers sur ecritures_comptables
 * ─────────────────────────────────────────────────
 * Ce script est IDEMPOTENT : il ne touche que les lignes dont tiers_id IS NULL.
 * Sûr à relancer autant de fois que nécessaire.
 *
 * Usage :
 *   pnpm --filter @workspace/db run retroetiquetage
 *   — ou —
 *   DATABASE_URL=postgres://... npx tsx scripts/retroetiquetage-tiers.ts
 */

import { Client } from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL manquant");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

type Etape = {
  label: string;
  sql: string;
};

const etapes: Etape[] = [
  // ── 1. Ventes exportateurs (source = 'vente') ─────────────────────────────
  {
    label: "Ventes exportateurs → tiers_type='exportateur'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = ve.exportateur_id,
             tiers_type = 'exportateur'
      FROM   ventes_exportateurs ve
      WHERE  e.source    = 'vente'
        AND  e.source_id = ve.id
        AND  ve.exportateur_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 2. Encaissements exportateurs (source = 'encaissement') ──────────────
  {
    label: "Encaissements exportateurs → tiers_type='exportateur'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = ve.exportateur_id,
             tiers_type = 'exportateur'
      FROM   ventes_exportateurs ve
      WHERE  e.source    = 'encaissement'
        AND  e.source_id = ve.id
        AND  ve.exportateur_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 3. Livraisons membres (source = 'livraison', membre_id non nul) ──────
  {
    label: "Livraisons membres → tiers_type='membre'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = l.membre_id,
             tiers_type = 'membre'
      FROM   livraisons l
      WHERE  e.source    = 'livraison'
        AND  e.source_id = l.id
        AND  l.membre_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 4. Livraisons fournisseurs externes (source = 'livraison', fournisseur_id non nul) ──
  {
    label: "Livraisons fournisseurs ext. → tiers_type='fournisseur_ext'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = l.fournisseur_id,
             tiers_type = 'fournisseur_ext'
      FROM   livraisons l
      WHERE  e.source    = 'livraison'
        AND  e.source_id = l.id
        AND  l.fournisseur_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 5. Avances membres (source = 'avance') ───────────────────────────────
  {
    label: "Avances membres → tiers_type='membre'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = a.membre_id,
             tiers_type = 'membre'
      FROM   avances a
      WHERE  e.source    = 'avance'
        AND  e.source_id = a.id
        AND  a.membre_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 6. Paiements membres (source = 'paiement') ───────────────────────────
  {
    label: "Paiements membres → tiers_type='membre'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = p.membre_id,
             tiers_type = 'membre'
      FROM   paiements p
      WHERE  e.source    = 'paiement'
        AND  e.source_id = p.id
        AND  p.membre_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 7. Bulletins de salaire → personnel (source = 'salaire', compte 421) ─
  {
    label: "Bulletins salaire (compte 421) → tiers_type='personnel'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = b.personnel_id,
             tiers_type = 'personnel'
      FROM   bulletins_paie b
      WHERE  e.source    = 'salaire'
        AND  e.source_id = b.id
        AND  b.personnel_id IS NOT NULL
        AND  e.compte_credit = '421'
        AND  e.tiers_id IS NULL
    `,
  },

  // ── 8. Avances délégués (source = 'avance', tiers_id déjà renseigné par la coop, mais tiers_type manquant) ──
  // Les avances_delegues stockent delegue_id (FK users). On joint via source_id.
  {
    label: "Avances délégués → tiers_type='delegue'",
    sql: `
      UPDATE ecritures_comptables e
      SET    tiers_id   = ad.delegue_id,
             tiers_type = 'delegue'
      FROM   avances_delegues ad
      WHERE  e.source    = 'avance'
        AND  e.source_id = ad.id
        AND  ad.delegue_id IS NOT NULL
        AND  e.tiers_id IS NULL
    `,
  },
];

async function run() {
  await client.connect();
  console.log("✅  Connecté à la base de données\n");

  let totalMis = 0;

  for (const { label, sql } of etapes) {
    try {
      const res = await client.query(sql);
      const n = res.rowCount ?? 0;
      totalMis += n;
      const icon = n > 0 ? "🔄" : "✔️ ";
      console.log(`${icon}  ${label} — ${n} ligne(s) mise(s) à jour`);
    } catch (err) {
      console.error(`❌  ${label} — erreur :`, (err as Error).message);
      // On continue les autres étapes
    }
  }

  console.log(`\n🏁  Total : ${totalMis} écriture(s) rétro-étiquetée(s)`);
  await client.end();
}

run().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
