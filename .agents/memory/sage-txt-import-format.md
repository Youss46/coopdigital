---
name: Format natif Sage 100
description: Trame native des écritures TXT utilisée par l’export CoopDigital.
---

Pour la trame native retenue, chaque ligne d’écriture suit l’ordre :

`Journal;Date JJMMAA;Pièce;Compte;Libellé;Montant;Sens;Type`

Le montant est positif, le sens vaut `D` ou `C`, et le type d’opération diverse vaut `OD`. Les directives `#FLG`, `#VER`, `#DEV`, `#MECG` et le journal restent dans l’en-tête. Les libellés restent en caractères ASCII simples.

**Why:** Sage signale une incohérence dès la première ligne de données lorsqu’il reçoit la date avant le journal, une date longue, ou le débit et le crédit comme deux colonnes 0/montant.

**How to apply:** Conserver cette trame pour le profil natif correspondant. Pour un format paramétrable différent, comparer d’abord le fichier de définition Sage du dossier.