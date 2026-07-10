---
name: Primes fee deduction pattern
description: How certification fee deduction works in the prime distribution calculation — global vs per-member
---

## Rule
Frais de certification are deducted **globally** from the total prime before computing individual member shares.

**Formula:**
- `montantDistrib = reception.montantTotalFcfa - montantFraisFcfa`  (global deduction)
- `memberShare = round(montantDistrib × tonnageMembre / tonnageTotal)`  (each member's gross share from the reduced pool)
- `deductionAvancesFcfa = min(avancesImpayees, memberShare)`  (per-member, optional)
- `deductionFraisFcfa = 0`  (always 0 on the primes_membres row — frais already deducted globally)
- `montantNetFcfa = memberShare - deductionAvancesFcfa`

**Why:** Double-deducting (once globally, once per-member) underpays members and makes totals inconsistent. The `deductionFraisFcfa` column is stored on `primes_membres` for audit trace of intent, but its value is always 0 under the current model.

**How to apply:** Any future code that calculates per-member amounts must NOT divide `montantFraisFcfa` by nbMembres and subtract again.
