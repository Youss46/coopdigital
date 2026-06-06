import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router = Router();

/**
 * POST /setup
 * Seed initial une seule fois si la base est vide.
 * Requiert le header X-Setup-Key = process.env.SETUP_KEY
 */
router.post("/setup", async (req, res) => {
  const key = process.env.SETUP_KEY;
  if (!key || req.headers["x-setup-key"] !== key) {
    res.status(403).json({ erreur: "Clé setup invalide" });
    return;
  }

  // Vérifier si déjà seedé
  const countResult = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM m15_users`
  );
  const count = countResult.rows[0]?.count ?? "0";
  if (Number(count) > 0) {
    res.json({ statut: "déjà_initialisé", m15Users: Number(count) });
    return;
  }

  // 1. Coopérative
  await db.execute(sql`
    INSERT INTO cooperatives (nom, ville, region)
    VALUES ('COOP-CA Soubré', 'Soubré', 'Sud-Ouest')
    ON CONFLICT DO NOTHING
  `);

  const coopResult = await db.execute<{ coop_id: number }>(
    sql`SELECT id AS coop_id FROM cooperatives LIMIT 1`
  );
  const coop_id = coopResult.rows[0]?.coop_id ?? 1;

  // 2. Admin CoopDigital
  const adminHash = await bcrypt.hash("Admin1234!", 10);
  await db.execute(sql`
    INSERT INTO users (cooperative_id, nom, prenoms, email, password_hash, role)
    VALUES (${coop_id}, 'Koné', 'Amadou', 'admin@coopdigital.ci', ${adminHash}, 'admin')
    ON CONFLICT (email) DO NOTHING
  `);

  // 3. Superadmin M15 Tech
  const m15Hash = await bcrypt.hash("@Youss054626", 10);
  await db.execute(sql`
    INSERT INTO m15_users (nom, email, password_hash, role, actif)
    VALUES ('Youss', 'contacteyouss@gmail.com', ${m15Hash}, 'superadmin', true)
    ON CONFLICT (email) DO NOTHING
  `);

  res.json({
    statut: "succès",
    créé: ["cooperative", "admin@coopdigital.ci", "contacteyouss@gmail.com"],
  });
});

export default router;
