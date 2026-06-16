-- Migration 0039 : table config_paie – taux de cotisations configurables par coopérative
CREATE TABLE IF NOT EXISTS config_paie (
  id                        serial PRIMARY KEY,
  cooperative_id            integer NOT NULL UNIQUE REFERENCES cooperatives(id),

  cnps_salariale_actif      boolean NOT NULL DEFAULT true,
  cnps_salariale_taux       integer NOT NULL DEFAULT 320,
  cnps_plafond_annuel       integer NOT NULL DEFAULT 1647315,

  cnps_patronale_actif      boolean NOT NULL DEFAULT true,
  cnps_patronale_taux       integer NOT NULL DEFAULT 770,

  cnps_atmp_actif           boolean NOT NULL DEFAULT true,
  cnps_atmp_taux            integer NOT NULL DEFAULT 200,

  its_actif                 boolean NOT NULL DEFAULT true,

  taxe_apprentissage_actif  boolean NOT NULL DEFAULT true,
  taxe_apprentissage_taux   integer NOT NULL DEFAULT 50,

  fpc_actif                 boolean NOT NULL DEFAULT true,
  fpc_taux                  integer NOT NULL DEFAULT 120,

  anciennete_actif          boolean NOT NULL DEFAULT true,

  updated_at                timestamptz NOT NULL DEFAULT now()
);
