ALTER TABLE public.mouvements_stock
  ADD COLUMN IF NOT EXISTS livraison_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mouvements_stock_livraison_id_livraisons_id_fk'
  ) THEN
    ALTER TABLE public.mouvements_stock
      ADD CONSTRAINT mouvements_stock_livraison_id_livraisons_id_fk
      FOREIGN KEY (livraison_id) REFERENCES public.livraisons(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mouvements_stock_livraison_id_idx
  ON public.mouvements_stock (livraison_id);

ALTER TABLE public.remboursements_intrants
  ADD COLUMN IF NOT EXISTS livraison_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remboursements_intrants_livraison_id_livraisons_id_fk'
  ) THEN
    ALTER TABLE public.remboursements_intrants
      ADD CONSTRAINT remboursements_intrants_livraison_id_livraisons_id_fk
      FOREIGN KEY (livraison_id) REFERENCES public.livraisons(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS remboursements_intrants_livraison_id_idx
  ON public.remboursements_intrants (livraison_id);
