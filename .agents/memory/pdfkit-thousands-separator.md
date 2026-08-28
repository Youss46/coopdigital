---
name: PDFKit thousands separator
description: Compatibility rule for French numeric formatting in PDFs rendered by mobile readers.
---

Les espaces insécables étroits produits par `Intl.NumberFormat("fr-FR")` peuvent être rendus comme des barres obliques par PDFKit avec les polices PDF standard.

**Why:** Les lecteurs PDF mobiles peuvent afficher les montants comme `43 / 127 / 113` au lieu de `43 127 113`, ce qui rend les documents comptables ambigus.

**How to apply:** Avant d’écrire un montant dans un PDFKit utilisant Helvetica ou une autre police standard, remplacer `U+202F` et `U+00A0` par un espace ASCII.