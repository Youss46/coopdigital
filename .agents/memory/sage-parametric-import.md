---
name: Formats Sage paramétrables
description: Règles durables pour les exports d’écritures vers Sage 100 au format texte paramétrable.
---

Le format texte d’import des écritures Sage 100 est défini par le profil d’import du dossier. L’ordre des champs, le séparateur et la présence d’en-têtes ne sont pas universels.

**Pourquoi :** un fichier peut être syntaxiquement correct tout en étant rejeté dès sa première ligne si le profil Sage attend, par exemple, le compte avant la pièce ou des colonnes distinctes pour facture, référence et compte tiers.

**Comment appliquer :** avant de modifier l’export, comparer la trame produite avec le profil Sage réellement utilisé. Documenter dans l’interface l’ordre exact et le séparateur attendus; ne pas présenter un ordre supposé comme un standard Sage général.