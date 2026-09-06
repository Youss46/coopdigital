---
name: Producer card settlement
description: Internal producer-card payments are immediate bank settlements from the Règlements page.
---

La carte producteur identifie le membre au moment de la validation dans la page Règlements. Le paiement est immédiat : il passe à `effectue` et le compte bancaire local sélectionné est débité dans la même transaction.

**Why:** La carte n’est ni un TPE ni une banque externe; elle ne fait que sélectionner le producteur. Le débit doit rester traçable, coopératif et atomique avec la validation.

**How to apply:** Dans Règlements, conserver la carte comme moyen unique, demander un compte bancaire local, verrouiller le paiement avant le débit, refuser les comptes inactifs/hors coopérative/insuffisants et conserver l’idempotence des retries. Les anciens endpoints/tableaux dédiés ne doivent pas redevenir le parcours utilisateur.