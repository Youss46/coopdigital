---
name: Avances excluent les membres délégués
description: Périmètre métier de la page Avances et protection côté serveur.
---

La page Avances est réservée aux avances des producteurs/membres ordinaires. Les membres dont la catégorie est « délégué de localités » ne doivent pas apparaître dans les listes d’avances, les filtres d’avances en cours/reportées ni le sélecteur de bénéficiaire; une création directe pour cette catégorie doit également être refusée.

**Why:** Les membres délégués sont suivis et rémunérés par le module dédié aux commissions et avances des délégués; les mélanger aux avances producteurs fausse les soldes et les responsabilités de remboursement.

**How to apply:** Filtrer par `categorieMembre` côté serveur avant toute réponse ou création, puis conserver le même filtre côté frontend pour éviter qu’un bénéficiaire interdit soit proposé dans le formulaire.