---
name: Commission frequency settlement
description: Settlement rules for collection commissions attached to member payments.
---

The commission frequency is a settlement rule captured on each generated commission:

- `chaque_paiement` means the pending commission must be paid with the related cacao payment; a net-only validation is rejected server-side.
- `fin_campagne` means the cacao payment may leave the commission pending, while an explicit combined payment remains available.

**Why:** The frequency is copied from the rate configuration when the commission is generated, so later rate edits must not change how an existing commission is settled.

**How to apply:** Expose the stored frequency with payment data and enforce it in the validation endpoint; the UI should mirror the server rule but never be its only protection.