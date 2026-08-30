DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sacherie_mouvement_type') THEN
    CREATE TYPE sacherie_mouvement_type AS ENUM ('entree', 'attribution', 'retour', 'perte', 'ajustement');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sacherie_ajustement_sens') THEN
    CREATE TYPE sacherie_ajustement_sens AS ENUM ('plus', 'moins');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sacherie_types_sacs (
  id serial PRIMARY KEY,
  cooperative_id integer NOT NULL REFERENCES cooperatives(id),
  nom varchar(120) NOT NULL,
  description text,
  stock_minimum integer NOT NULL DEFAULT 0 CHECK (stock_minimum >= 0),
  actif boolean NOT NULL DEFAULT true,
  cree_par integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sacherie_types_sacs_cooperative_nom_unique
  ON sacherie_types_sacs (cooperative_id, nom);

CREATE TABLE IF NOT EXISTS sacherie_mouvements (
  id serial PRIMARY KEY,
  cooperative_id integer NOT NULL REFERENCES cooperatives(id),
  type_sac_id integer NOT NULL REFERENCES sacherie_types_sacs(id),
  type sacherie_mouvement_type NOT NULL,
  sens sacherie_ajustement_sens,
  quantite integer NOT NULL CHECK (quantite > 0),
  membre_id integer REFERENCES membres(id),
  campagne_id integer REFERENCES campagnes(id),
  motif text,
  reference varchar(120) NOT NULL,
  cree_par integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sacherie_mouvements_adjustment_sens_check CHECK (
    (type = 'ajustement' AND sens IS NOT NULL) OR
    (type <> 'ajustement' AND sens IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sacherie_mouvements_cooperative_reference_unique
  ON sacherie_mouvements (cooperative_id, reference);

CREATE INDEX IF NOT EXISTS sacherie_mouvements_cooperative_type_sac_idx
  ON sacherie_mouvements (cooperative_id, type_sac_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sacherie_mouvements_cooperative_membre_idx
  ON sacherie_mouvements (cooperative_id, membre_id, created_at DESC);