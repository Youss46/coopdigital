---
name: Sélection et cache du contrôle de licence
description: tenantGuard exige une licence valide; le contrôle doit privilégier une licence encore valable plutôt que le dernier historique
---
Toute route protégée (hors rôle pca) passe par tenantGuard → verifierLicenceActive, qui répond 402 LICENCE_INVALIDE sans licence `active` en base pour la coopérative.
**Why:** en dev, après avoir seedé une licence, les appels échouent encore car le check négatif est caché en mémoire du process.
**How to apply:** pour tester des endpoints en dev, seeder cooperatives+users+licences (statut 'active', date_expiration future) PUIS redémarrer le workflow API Server pour vider le cache.

Lorsqu'une coopérative possède plusieurs licences, privilégier une licence `active` ou `trial` dont la date de référence est encore valable, avant d'utiliser le dernier enregistrement pour afficher une erreur.
**Why:** un essai expiré conservé dans l'historique ne doit pas bloquer les opérateurs si une licence payante active existe.
**How to apply:** toute évolution de `verifierLicenceActive` doit conserver cette priorité; l'enregistrement le plus récent ne sert de repli que lorsqu'aucune licence valide n'existe.
