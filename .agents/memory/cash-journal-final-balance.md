---
name: Solde final du journal de caisse
description: Référence fiable pour afficher le solde final d’un journal filtré.
---

Le solde final d’un journal doit reprendre le dernier `solde_apres_fcfa` du mouvement visible, plutôt que recalculer un solde d’ouverture de caisse avec des totaux filtrés.

**Why:** Le solde d’ouverture fourni avec la caisse peut appartenir à une autre session ou à un périmètre différent des dates du journal; le recalcul affiche alors une valeur différente du solde de clôture des lignes.

**How to apply:** Chercher le dernier mouvement visible ayant un solde après; utiliser le solde actuel seulement comme repli lorsqu’aucun mouvement ne fournit cette valeur.