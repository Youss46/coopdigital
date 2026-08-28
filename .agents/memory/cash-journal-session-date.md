---
name: Cash journal session date
description: Rule for associating automatic cash movements with the session shown by the daily cash journal.
---

Les débits automatiques de caisse doivent sélectionner une session ouverte dont la date est celle du jour, pas seulement une session ayant le statut `ouverte`.

**Why:** Une ancienne session restée ouverte peut sinon recevoir le mouvement; le Journal de caisse, filtré par date de session, le masque alors même que le solde a été débité.

**How to apply:** Toute création automatique de mouvement liée à une validation du jour doit reprendre le même périmètre de date que `getSessionActive` et le Journal de caisse.