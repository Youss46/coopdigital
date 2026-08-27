---
name: Terrain preview port
description: Le port de prévisualisation du workflow Terrain peut être attribué dynamiquement.
---

Le port du serveur Terrain ne doit pas être supposé à 5000 lors d’une vérification locale; il faut lire le port réellement ouvert par le workflow avant de capturer l’aperçu.

**Why:** le workflow peut attribuer un port disponible différent de celui du proxy par défaut, ce qui produit une fausse erreur de connexion.

**How to apply:** après un redémarrage du workflow Terrain, utiliser son port ouvert pour les vérifications HTTP et les captures d’écran.