---
name: Conversion de pesée — poids minimum
description: Règle métier et comportement UX pour convertir une session de pesée en livraison.
---

Une session de pesée avec un poids net total nul ou négatif ne doit jamais être
convertie en livraison. L’interface terrain doit masquer l’action de conversion
pour ce cas et expliquer clairement qu’un passage valide doit d’abord être
enregistré.

**Why:** une livraison à 0 kg est invalide. Présenter un bouton de confirmation
qui sera nécessairement refusé par l’API ressemble à une action sans effet,
particulièrement sur mobile.

**How to apply:** conserver la validation serveur comme garde-fou, puis vérifier
le poids total côté client avant d’ouvrir ou d’exécuter la conversion, y compris
pour les anciennes sessions terminées qui peuvent contenir des données vides.