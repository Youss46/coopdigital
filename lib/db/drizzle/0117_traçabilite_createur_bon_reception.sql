-- Le bon peut désormais être créé par le magasinier ou par un peseur.
ALTER TABLE "bons_reception_membres_delegues"
  ADD COLUMN IF NOT EXISTS "cree_par_id" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "cree_par_role" text;

-- Les bons existants ont tous été créés depuis le parcours magasinier.
UPDATE "bons_reception_membres_delegues"
SET "cree_par_id" = "magasinier_id",
    "cree_par_role" = 'magasinier'
WHERE "cree_par_id" IS NULL
  AND "magasinier_id" IS NOT NULL;