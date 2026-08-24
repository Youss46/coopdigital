---
name: Taux PPSSI annuel
description: Règle métier de modification annuelle du taux PPSSI et cohérence des calculs/exportations.
---

Le taux PPSSI est configurable par coopérative, mais ne peut être modifié qu’une fois par année civile. Les déclarations, règlements et exports doivent tous utiliser le taux enregistré pour la coopérative, jamais une constante.

**Why:** l’annexe fiscale peut changer chaque année, tandis qu’une modification multiple pendant la même année créerait des déclarations incohérentes.

**How to apply:** conserver l’année de dernière modification côté obligation PPSSI, refuser une nouvelle valeur la même année côté serveur, et afficher la règle dans l’interface.