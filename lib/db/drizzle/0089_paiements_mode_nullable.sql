-- Make mode_paiement nullable so pesée groupée livraisons have no pre-selected payment mode
ALTER TABLE paiements ALTER COLUMN mode_paiement DROP NOT NULL;
ALTER TABLE paiements ALTER COLUMN mode_paiement DROP DEFAULT;
