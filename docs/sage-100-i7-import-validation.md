# Validation de l'export TXT Sage 100 i7

## Résultat de la validation disponible

Le dépôt ne contient ni installation Sage 100 i7 ni fichier de définition
exporté depuis un dossier Sage. L'import dans une copie du dossier ne peut
donc pas être confirmé depuis cet environnement Linux. Les sorties TXT
fournies et les tests automatisés permettent toutefois de verrouiller le
contrat à remettre à l'utilisateur Sage.

Le format observé et retenu est :

```text
Date;Journal;Pièce;Compte;Libellé;Débit;Crédit
```

Le fichier ne contient pas de ligne de titres de colonnes. Il commence par
les directives Sage suivantes, qui doivent être conservées :

```text
#FLG 001
#VER 8
#DEV XOF
#MECG
CAIS
```

Chaque ligne de données comporte exactement sept champs. La date est au format
`JJ/MM/AAAA`, la pièce peut être vide, le compte est le compte Sage détaillé
configuré pour le tiers ou le compte général, et les montants sont des entiers
positifs en FCFA. L'encodage produit est ASCII compatible Sage : les accents,
tirets typographiques, symboles monétaires et retours à la ligne des libellés
sont normalisés.

## Contrôles automatisés réalisés

Le test `artifacts/api-server/src/tests/comptabiliteSageXml.test.ts` vérifie :

- l'en-tête et les directives Sage ;
- l'ordre `Pièce` puis `Compte`, avec des valeurs différentes ;
- sept colonnes exactement et aucune colonne devise supplémentaire ;
- une écriture avec compte auxiliaire de tiers et une écriture sans tiers ;
- les pièces présentes et les pièces vides ;
- la normalisation ASCII des libellés ;
- l'égalité des totaux débit et crédit.

Les comptes auxiliaires non configurés restent bloquants côté API. Il ne faut
pas remplacer cette vérification par un code tiers CoopDigital : l'identifiant
`type-id` n'est pas automatiquement un code tiers Sage.

## Vérification à faire dans Sage 100 i7

Cette dernière étape nécessite la version exacte de Sage et son profil
d'import. Elle doit être faite sur une copie du dossier comptable :

1. Exporter un exercice de test contenant une écriture avec tiers, une écriture
   sans tiers, une pièce renseignée et une pièce vide.
2. Dans le profil d'import Sage, choisir le séparateur `;`, conserver les
   directives du fichier et mapper les sept champs dans l'ordre ci-dessus.
3. Importer sans valider définitivement les écritures.
4. Vérifier les dates, journaux, pièces, comptes généraux, comptes auxiliaires,
   libellés et l'absence de huitième colonne.
5. Comparer les totaux débit et crédit importés avec le fichier exporté et la
   balance auxiliaire CoopDigital.
6. Si le profil exige des colonnes supplémentaires, conserver sa définition et
   son message d'erreur : l'export devra alors être adapté explicitement au
   profil concerné, sans modifier le format commun par hypothèse.

Tant que cette procédure n'a pas été exécutée dans le dossier Sage cible, le
statut doit rester **validation Sage externe en attente**. Les tests locaux
confirment la structure et les données produites, pas l'acceptation par une
version Sage non disponible dans le dépôt.