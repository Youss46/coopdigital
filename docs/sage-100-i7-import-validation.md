# Validation de l’export XML avec Sage 100 i7

## Statut

**Validation Sage en attente — installation et modèle d’import non fournis.**

CoopDigital produit actuellement un XML déterministe et bien formé selon son propre
contrat d’export. Ce contrat ne constitue pas, à lui seul, un format XML natif
Sage 100 i7. Une importation réussie ne peut donc pas être affirmée depuis
l’environnement de développement.

La conclusion actuelle est : **le fichier est exploitable comme fichier
d’échange à rapprocher d’un profil d’import Sage, mais il doit être validé ou
adapté avec le paramétrage d’import de la société dans Sage 100 i7 avant toute
utilisation en production**.

## Contrat XML actuellement exporté

Déclaration et encodage :

- déclaration XML `<?xml version="1.0" encoding="UTF-8"?>` ;
- caractères encodés en UTF-8 ;
- fin de ligne CRLF ;
- valeurs XML échappées (`&`, `<`, `>`, `"`, `'`) ;
- valeurs absentes représentées par un élément vide (`<NumeroPiece/>`).

Arbre et ordre des éléments :

```xml
<ExportSage exercice="AAAA" source="CoopDigital">
  <Ecritures>
    <Ecriture>
      <Date>AAAA-MM-JJ</Date>
      <Journal>...</Journal>
      <NumeroPiece>...</NumeroPiece>
      <Libelle>...</Libelle>
      <CompteGeneral>...</CompteGeneral>
      <CompteSage>...</CompteSage>
      <CodeTiers>...</CodeTiers>
      <TypeTiers>...</TypeTiers>
      <Debit>...</Debit>
      <Credit>...</Credit>
    </Ecriture>
  </Ecritures>
</ExportSage>
```

Une écriture comptable CoopDigital est exportée en deux lignes au maximum :
une ligne débit et une ligne crédit. Les montants sont des entiers FCFA. Les
écritures exportées sont celles de l’exercice demandé et le contrôle existant
bloque le téléchargement lorsqu’un compte auxiliaire requis n’est pas
paramétré.

## Comparaison avec un import Sage 100 i7

| Point à vérifier dans le profil Sage | Valeur CoopDigital | État |
| --- | --- | --- |
| Fichier accepté par la fonction d’import | XML avec racine `ExportSage` | **À confirmer** |
| Nom de la racine et des balises | Noms CoopDigital ci-dessus | **À confirmer / probablement à mapper** |
| Namespace ou schéma XML | Aucun | **À confirmer** |
| Ordre des champs | Ordre du tableau ci-dessus | **À confirmer** |
| Date | ISO `AAAA-MM-JJ` | **À confirmer** ; adapter au masque Sage si nécessaire |
| Journal | Valeur `source` en majuscules (`PAIEMENT`, `LIVRAISON`, etc.) | **À confirmer** ; vérifier le code journal Sage |
| Pièce | `numeroPiece`, vide si absent | **À confirmer** |
| Compte | `CompteSage` contient le compte détaillé configuré pour le tiers | **À mapper au champ compte Sage** |
| Tiers | `CodeTiers` vaut actuellement `<type>-<id>` | **Adaptation probable** : utiliser le code tiers connu de Sage |
| Sens | deux éléments `Debit` / `Credit` par mouvement | **À confirmer** |
| Montant | entier positif, unité FCFA | **À confirmer** ; vérifier séparateur et devise du dossier Sage |
| Libellé | texte XML échappé | **À confirmer** ; vérifier la longueur maximale |
| Encodage | UTF-8 déclaré et produit | **À confirmer** avec l’option d’import Sage |

Les valeurs `CodeTiers` et `TypeTiers` sont des identifiants CoopDigital. Elles
ne doivent pas être présentées comme des codes tiers Sage tant qu’une
correspondance n’a pas été fournie par le dossier Sage. C’est le principal
point d’adaptation identifié à ce stade, avec les noms de balises et le format
de date.

## Procédure de validation à réaliser dans Sage

Cette procédure doit être exécutée sur une copie du dossier comptable, avec un
utilisateur habilité à importer des écritures :

1. Obtenir le modèle ou la définition du format d’import de la version exacte
   de Sage 100 i7 utilisée par la coopérative.
2. Relever la racine XML, le namespace éventuel, les noms et l’ordre des
   champs, le masque de date, le séparateur décimal, le mode débit/crédit et
   les champs obligatoires.
3. Exporter depuis CoopDigital un exercice de test contenant au moins :
   une écriture avec tiers, une écriture sans tiers, un libellé accentué et un
   numéro de pièce vide.
4. Importer le fichier dans une copie du dossier Sage, sans valider
   définitivement les écritures.
5. Contrôler le journal, les dates, les pièces, les libellés, les comptes
   généraux, les comptes auxiliaires et l’égalité débit/crédit.
6. Comparer les totaux importés avec la balance auxiliaire CoopDigital.
7. Si Sage refuse le fichier, conserver le message d’erreur et le profil
   d’import exporté par Sage ; ils sont nécessaires pour implémenter
   l’adaptateur sans deviner un format propriétaire.

## Critères de clôture

La validation pourra être marquée **réussie** lorsque le même fichier de test
est importé sans erreur dans la version Sage ciblée et que les contrôles de
totaux passent. Sinon, l’adaptation à réaliser doit être consignée au minimum
pour :

- la racine, le namespace et les balises ;
- l’ordre et le type des champs ;
- la conversion de `CodeTiers` vers le code Sage ;
- les dates, montants et éventuels arrondis ;
- l’encodage et les champs obligatoires.
