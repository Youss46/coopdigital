---
name: Frontend Vitest shared binary
description: Frontend tests reuse the API artifact's Vitest installation in this monorepo.
---

Le frontend ne porte pas actuellement sa propre installation de Vitest; ses tests utilisent le binaire partagé de l’artifact API. La configuration doit donc exporter un objet simple (sans importer `vitest/config`) et aliaser le module `vitest` vers cette installation.

**Why:** Le chargeur de configuration Vitest résout `vitest/config` avant d’appliquer les alias, ce qui fait échouer une configuration frontend basée sur `defineConfig` sans dépendance locale.

**How to apply:** Pour ajouter ou modifier des tests frontend, conserver le script de test et l’alias de résolution existants, puis vérifier avec le script de l’artifact frontend.