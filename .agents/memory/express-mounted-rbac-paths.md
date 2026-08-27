---
name: Express mounted RBAC paths
description: Les middlewares RBAC doivent tenir compte du chemin complet quand ils sont exécutés sous un préfixe de montage Express.
---

Un middleware d’autorisation exécuté dans un routeur monté sous un préfixe ne doit pas se baser uniquement sur `req.path`, car Express retire le préfixe pendant le dispatch.

**Why:** Un contrôle qui fonctionne au niveau du routeur racine peut être contourné lorsqu’un même middleware est appelé depuis `router.use("/prefix", ...)`.

**How to apply:** Comparer aussi le chemin d’origine ou le chemin reconstruit avec `baseUrl`, et couvrir par test HTTP les routeurs enregistrés avant un garde global.