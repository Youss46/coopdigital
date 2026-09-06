---
name: Traçabilité des mouvements de trésorerie
description: Règle d’identification des auteurs dans les journaux de caisse et de banque.
---

Les journaux de trésorerie doivent afficher l’utilisateur porté par `enregistre_par` pour chaque mouvement. Les services qui créent un mouvement depuis une action authentifiée doivent recevoir et transmettre l’identifiant de l’utilisateur jusqu’à l’insertion.

**Why:** Une opération financière sans auteur identifiable réduit la capacité de contrôle et de rapprochement, même lorsque le mouvement lui-même est correctement comptabilisé.

**How to apply:** Joindre `users` dans les lectures de journal, afficher le nom dans les interfaces et PDF, et réserver « Système » aux historiques ou traitements réellement sans utilisateur humain.