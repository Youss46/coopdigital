---
name: Taux PPSSI annuel
description: Règle métier de modification annuelle du taux PPSSI et cohérence des calculs/exportations.
---

Le taux PPSSI est configurable par coopérative, mais ne peut être modifié qu’une fois par année civile. Les déclarations, règlements et exports doivent tous utiliser le taux enregistré pour la coopérative, jamais une constante.

**Why:** l’annexe fiscale peut changer chaque année, tandis qu’une modification multiple pendant la même année créerait des déclarations incohérentes.

**How to apply:** conserver l’année de dernière modification côté obligation PPSSI, refuser une nouvelle valeur la même année côté serveur, et afficher la règle dans l’interface.

Pour les exports, une obligation PPSSI absente ou un taux nul, négatif, supérieur à 100 ou non numérique doit utiliser explicitement le taux légal de repli de 2 %, afin que le taux affiché et les retenues restent cohérents.

**Why:** une configuration invalide ne doit jamais supprimer ou gonfler silencieusement la retenue fiscale dans un CSV ou un PDF.

**How to apply:** valider le taux résolu avant tout calcul et réutiliser cette même valeur pour l’intitulé et les montants exportés.