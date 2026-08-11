---
name: Licence guard blocks dev API testing
description: tenantGuard exige une licence active par coopérative; le résultat négatif est mis en cache mémoire
---
Toute route protégée (hors rôle pca) passe par tenantGuard → verifierLicenceActive, qui répond 402 LICENCE_INVALIDE sans licence `active` en base pour la coopérative.
**Why:** en dev, après avoir seedé une licence, les appels échouent encore car le check négatif est caché en mémoire du process.
**How to apply:** pour tester des endpoints en dev, seeder cooperatives+users+licences (statut 'active', date_expiration future) PUIS redémarrer le workflow API Server pour vider le cache.
