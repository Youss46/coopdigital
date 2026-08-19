---
name: Accès aux taux des délégués de localités
description: Règle d’autorisation et de portée pour la configuration des commissions des membres délégués de localités.
---

# Accès aux taux des délégués de localités

La gestion des taux de commission des membres délégués de localités suit le même modèle que celle des délégués terrain : tout utilisateur coopératif authentifié peut consulter, créer, modifier et supprimer les taux. Elle ne doit pas être masquée ou bloquée par la permission applicative `delegues`.

**Why:** le module des délégués terrain est la référence fonctionnelle choisie pour la gestion des taux. Certains rôles coopératifs légitimes n'ont pas la permission `delegues`, ce qui masquait complètement l'option de configuration alors que le calcul de commission en dépend.

**How to apply:** conservez `authMiddleware` pour les routes de taux des délégués de localités et rendez les actions de taux disponibles dans leur onglet. Les périmètres global, campagne et délégué spécifique restent disponibles pour une cohérence avec les délégués terrain.