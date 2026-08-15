-- Add virement (bank transfer) to the mode_paiement enum
ALTER TYPE "public"."mode_paiement" ADD VALUE IF NOT EXISTS 'virement';
