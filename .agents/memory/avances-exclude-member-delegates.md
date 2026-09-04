---
name: Avances excluent les membres délégués
description: Périmètre métier de la page Avances et protection côté serveur.
---

La page Avances générale est réservée aux avances des producteurs/membres ordinaires. Les membres dont la catégorie est « délégué de localités » ne doivent pas y apparaître ni y être créés. Leurs avances restent toutefois stockées dans la même table et doivent apparaître dans la page dédiée Délégués de localités.

**Why:** Les membres délégués sont suivis et rémunérés par le module dédié aux commissions et avances des délégués; les mélanger aux avances producteurs fausse les soldes et les responsabilités de remboursement.

**How to apply:** Distinguer la portée de route : la page générale utilise `categorie IS NULL OR categorie <> 'délégué de localités'`; les routes `/delegues-localites/*` exigent au contraire cette catégorie. Le PDF des membres délégués et leur page dédiée lisent les mêmes avances membres.