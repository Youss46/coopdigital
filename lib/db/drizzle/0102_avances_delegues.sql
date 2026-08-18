-- Migration 0102 : avances accordées aux délégués de localité.
-- Remboursement par retenue sur commission (pas sur livraison membre).

CREATE TYPE avance_delegue_statut AS ENUM ('en_cours', 'rembourse', 'en_retard');
CREATE TYPE avance_delegue_plan_type AS ENUM ('integral', 'partiel', 'reporte');

CREATE TABLE IF NOT EXISTS avances_delegues (
  id                    serial PRIMARY KEY,
  delegue_id            integer NOT NULL REFERENCES users(id),
  cooperative_id        integer NOT NULL,
  montant_octroye_fcfa  integer NOT NULL,
  montant_rembourse_fcfa integer NOT NULL DEFAULT 0,
  solde_restant_fcfa    integer NOT NULL,
  date_octroi           date NOT NULL,
  date_echeance         date,
  motif                 text,
  statut                avance_delegue_statut NOT NULL DEFAULT 'en_cours',
  agent_id              integer REFERENCES users(id),
  plan_type             avance_delegue_plan_type NOT NULL DEFAULT 'integral',
  montant_partiel_fcfa  integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remboursements_avances_delegues (
  id            serial PRIMARY KEY,
  avance_id     integer NOT NULL REFERENCES avances_delegues(id) ON DELETE CASCADE,
  commission_id integer REFERENCES commissions_delegues(id) ON DELETE SET NULL,
  montant_fcfa  integer NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
