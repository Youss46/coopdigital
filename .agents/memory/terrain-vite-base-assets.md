---
name: Assets Vite du terrain
description: Chemins des ressources publiques quand l’application Terrain est servie sous un préfixe.
---

Les références aux fichiers publics de Terrain doivent utiliser `import.meta.env.BASE_URL` côté React et `%BASE_URL%` dans `index.html`, plutôt qu’un chemin absolu commençant par `/`.

**Why:** le serveur de prévisualisation sert Terrain sous `/terrain/`; un chemin absolu comme `/logo-512.png` provoque un 404 et casse les visuels de connexion.

**How to apply:** appliquer cette règle aux logos, icônes, manifestes et autres fichiers publics référencés par le frontend Terrain.