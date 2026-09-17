---
name: Migration workflow working directory
description: Le workflow API peut démarrer depuis la racine du monorepo, pas uniquement depuis artifacts/api-server.
---

Le chemin des migrations doit rechercher un dossier existant depuis les deux contextes de démarrage possibles : racine du monorepo et répertoire de l’artifact API.

**Why:** un chemin relatif unique peut laisser le serveur démarrer sans appliquer les nouvelles migrations, tout en affichant un démarrage apparemment réussi.

**How to apply:** lors d’une modification du lanceur API ou des migrations, vérifier le `process.cwd()` réel du workflow et choisir un chemin candidat existant avant d’appeler le migrateur.