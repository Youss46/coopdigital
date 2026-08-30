---
name: Readiness PostgreSQL jetable
description: Contrôle fiable du démarrage d’un PostgreSQL temporaire avant les migrations ou tests d’intégration.
---

Pour valider PostgreSQL localement dans un conteneur temporaire, attendre qu’une requête SQL soit acceptée; l’ouverture du port peut précéder la fin de l’initialisation et provoquer une déconnexion de migration.

**Why:** l’image PostgreSQL ouvre son port pendant certaines phases d’initialisation avant que la base cible soit réellement disponible.

**How to apply:** utiliser un probe PostgreSQL authentifié (par exemple `pg_isready` contre le port publié) avant d’exécuter `fresh-migrate`; ne pas réutiliser une base de développement partagée.