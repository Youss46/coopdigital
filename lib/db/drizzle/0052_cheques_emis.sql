CREATE TYPE "public"."statut_cheque" AS ENUM('emis', 'encaisse', 'rejete', 'annule');

CREATE TABLE "cheques_emis" (
  "id" serial PRIMARY KEY,
  "cooperative_id" integer NOT NULL,
  "numero_cheque" varchar(50),
  "beneficiaire" varchar(200) NOT NULL,
  "montant_fcfa" integer NOT NULL,
  "compte_bancaire_id" integer,
  "paiement_id" integer REFERENCES "paiements"("id"),
  "membre_id" integer REFERENCES "membres"("id"),
  "livraison_id" integer REFERENCES "livraisons"("id"),
  "date_emission" date NOT NULL,
  "date_echeance" date,
  "statut" "public"."statut_cheque" NOT NULL DEFAULT 'emis',
  "date_encaissement" date,
  "date_rejet" date,
  "motif_rejet" text,
  "motif_annulation" text,
  "mouvement_banque_id" integer REFERENCES "mouvements_banque"("id"),
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
