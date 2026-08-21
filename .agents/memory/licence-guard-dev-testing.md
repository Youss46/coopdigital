---
name: Sélection et cache du contrôle de licence
description: Rôles soumis au tenantGuard et règle de sélection d’une licence valable.
---
# Contrôle de licence

Seuls les rôles `pca`, `directeur` et `comptable` passent par `tenantGuard`. Les rôles opérationnels (magasinier, auditeur, délégué et terrain) restent utilisables même lorsque la licence est expirée.

**Why:** la licence doit restreindre le pilotage et la gestion financière sans interrompre les opérations quotidiennes de la coopérative.

**How to apply:** toute route coopérative montée avant le guard global doit appeler `authMiddleware`, puis `tenantGuard`. Les routes d’authentification terrain restent en dehors de cette chaîne.

Lorsqu'une coopérative possède plusieurs licences, privilégier une licence `active` ou `trial` dont la date de référence est encore valable, avant d'utiliser le dernier enregistrement pour afficher une erreur.
**Why:** un essai expiré conservé dans l'historique ne doit pas bloquer les opérateurs si une licence payante active existe.
**How to apply:** toute évolution de `verifierLicenceActive` doit conserver cette priorité; l'enregistrement le plus récent ne sert de repli que lorsqu'aucune licence valide n'existe.

Pour les vues d’administration, le statut exposé doit être calculé aussi à partir de la date d’expiration : une licence `active` ou `trial` dépassée est présentée comme `expiree` immédiatement, sans attendre le cron quotidien.
**Why:** le cron peut s’exécuter plus tard dans la journée; sinon les compteurs et listes M15 affichent temporairement une licence encore active alors que l’accès est déjà expiré.
**How to apply:** conserver cette normalisation dans les réponses liste/détail et traduire les statuts techniques dans l’interface.
