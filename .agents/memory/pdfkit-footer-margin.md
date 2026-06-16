---
name: PDFKit footer margin.bottom neutralisation
description: Pages vides dans tous les PDFs — cause racine et fix dans drawFooter (pdfHeaderService.ts)
---

## La règle

Dans `drawFooter`, toujours neutraliser `doc.page.margins.bottom = 0` avant les `.text()` du footer, puis le restaurer.

## Pourquoi

PDFKit (v0.18.0) vérifie dans LineWrapper (ligne 3042 du bundle) :

```
if (this.document.y > this.maxY || nextY > this.maxY)  → continueOnNewPage()
```

où `maxY = page.height - page.margins.bottom`.

Pour A4 avec `margin: 50` :
- `maxY = 841.89 - 50 = 791.89 pt`
- `footerY = pageHeight - 32 = 809.89 pt`

Chaque `.text(str, x, footerY)` voit `doc.y = 810 > 791.89` → PDFKit appelle `continueOnNewPage()` → une page vide est insérée **avant** le rendu du texte.

Pour un bulletin 1 page avec 2 `.text()` dans le footer → 3 pages au total (1 contenu + 2 pages vides avec le footer splitté).

## Comment appliquer

```typescript
const savedBottomMargin = doc.page.margins.bottom;
doc.page.margins.bottom = 0;          // maxY = page.height → 841.89 > 810 ✓
// ... .text() appels du footer ...
doc.page.margins.bottom = savedBottomMargin;
```

**Fix centralisé dans `pdfHeaderService.ts::drawFooter`** — tous les services (pdfService, caisseService, fiscaliteService, formationService, reconciliationService, auditService) importent `drawFooter` depuis ce fichier unique, donc un seul point de correction pour toute l'app.

## Ce qui ne fonctionne PAS

- Réinitialiser `doc.y = MARGIN` avant `flushPages()` : ne sert à rien, PDFKit ne teste pas `doc.y` dans `end()` ni dans `flushPages()`.
- Changer `footerY` pour le mettre < 791.89 : décale visuellement le footer vers le haut.
