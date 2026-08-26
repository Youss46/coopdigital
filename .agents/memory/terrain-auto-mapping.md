---
name: Cartographie automatique terrain
description: Règles du mode de capture GPS automatique pour les parcelles irrégulières.
---

Le mode automatique du relevé de parcelle ajoute un point GPS lorsque la précision est acceptable et que l’agent a suffisamment avancé depuis le dernier point; l’agent peut mettre en pause, reprendre et revenir au manuel avant le premier point.

**Why:** les parcelles irrégulières sont difficiles à relever par seuls angles manuels, mais le bruit GPS rend nécessaire un filtrage par précision et distance.

**How to apply:** conserver une validation manuelle finale, le calcul de superficie et le stockage hors ligne; ne pas ajouter chaque position GPS brute au polygone final.

Le contrat de collecte doit exiger `crs = EPSG:4326`; les anciennes opérations hors ligne peuvent être complétées à la synchronisation avant leur envoi.

**Why:** un relevé sans CRS explicite est ambigu pour les échanges SIG, tandis que les files locales historiques doivent rester synchronisables sans doublon.

**How to apply:** valider le CRS côté contrôleur et service, puis enregistrer la métadonnée avec le polygone.