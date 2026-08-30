---
name: Journalisation d’erreur RH
description: Contrainte de journalisation des contrôleurs RH utilisés dans des serveurs Express de test minimaux.
---

Les contrôleurs RH peuvent être exercés dans un serveur Express sans le middleware qui injecte `req.log`; leur gestionnaire d’erreur doit donc journaliser via un secours global sans empêcher la réponse JSON.

**Why:** Une erreur de stockage déclenchée dans un test d’intégration révélait une seconde erreur de journalisation, qui remplaçait la réponse JSON attendue par la page HTML 500 native d’Express.

**How to apply:** Lorsqu’un nouveau chemin d’erreur RH est testé avec un `app` Express minimal, vérifier à la fois le statut, le corps JSON et l’absence d’effet métier secondaire.

Les alertes de disponibilité du stockage RH doivent compter uniquement les échecs survenus pendant la lecture de l’objet, jamais une erreur d’audit ou une autre étape après téléchargement.

**Why:** Une panne de la journalisation métier ne doit pas produire un faux diagnostic d’indisponibilité du stockage.

**How to apply:** Délimiter explicitement la phase de lecture objet dans le contrôleur avant d’incrémenter le compteur d’incidents.

Les alertes de panne RH partagées entre instances doivent utiliser une ligne PostgreSQL verrouillée par coopérative; seule une lecture réussie peut réinitialiser cet état.

**Why:** Un compteur mémoire perd le signal au redémarrage et deux instances peuvent franchir le seuil en même temps; la transaction rend le franchissement unique et durable.

**How to apply:** Conserver la fenêtre et le seuil dans le calcul, faire l’incrément et le marquage d’alerte sous verrou, puis supprimer l’état après téléchargement réussi.