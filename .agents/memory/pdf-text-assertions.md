---
name: Assertions de texte PDF
description: Rendre les tests de contenu PDF robustes aux transformations d’encodage de PDFKit.
---

Les assertions sur le texte extrait d’un PDF doivent vérifier séparément les mots métier essentiels plutôt qu’une phrase contenant une apostrophe typographique.

**Why:** PDFKit encode certains caractères WinAnsi en codes qui sont supprimés ou transformés par l’utilitaire de décompression des tests; une phrase visuellement correcte peut alors échouer sur une comparaison littérale.

**How to apply:** Pour les libellés accentués ou avec apostrophe, normaliser les accents puis vérifier les segments significatifs, tout en conservant une assertion sur les montants et statuts attendus.