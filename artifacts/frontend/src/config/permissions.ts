// Copie côté client de la matrice des permissions RBAC.
// Source de vérité : artifacts/api-server/src/middlewares/permissions.ts
// Le backend reste l'autorité finale — ce fichier ne sert qu'à l'UI.

export const PERMISSIONS: Record<string, Record<string, string[]>> = {

  users: {
    lire:      ["pca", "directeur"],
    creer:     ["pca", "directeur"],
    modifier:  ["pca", "directeur"],
    supprimer: ["pca", "directeur"],
    activer:   ["pca", "directeur"],
  },

  membres: {
    lire:     ["pca", "directeur", "comptable", "responsable_tracabilite", "agent_terrain", "auditeur"],
    creer:    ["pca", "directeur", "agent_terrain"],
    modifier: ["pca", "directeur", "agent_terrain"],
    supprimer:["pca", "directeur"],
    exporter: ["pca", "directeur", "comptable", "auditeur"],
  },

  tracabilite: {
    lire:             ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
    creer_lot:        ["pca", "directeur", "responsable_tracabilite"],
    modifier_lot:     ["pca", "directeur", "responsable_tracabilite"],
    supprimer_lot:    ["pca", "directeur"],
    scanner_qr:       ["pca", "directeur", "responsable_tracabilite", "agent_terrain"],
    exporter_eudr:    ["pca", "directeur", "responsable_tracabilite", "auditeur"],
  },

  stocks: {
    lire:               ["pca", "directeur", "comptable", "magasinier", "auditeur"],
    entree:             ["pca", "directeur", "magasinier"],
    sortie:             ["pca", "directeur", "magasinier"],
    creer_entrepot:     ["pca", "directeur"],
    modifier_entrepot:  ["pca", "directeur"],
    supprimer_entrepot: ["pca"],
    voir_alertes:       ["pca", "directeur", "magasinier"],
  },

  avances: {
    lire:      ["pca", "directeur", "comptable", "agent_terrain", "auditeur"],
    octroyer:  ["pca", "directeur", "agent_terrain"],
    rembourser:["pca", "directeur", "agent_terrain"],
    supprimer: ["pca", "directeur"],
  },

  livraisons: {
    lire:      ["pca", "directeur", "comptable", "responsable_tracabilite", "agent_terrain", "auditeur"],
    creer:     ["pca", "directeur", "agent_terrain"],
    modifier:  ["pca", "directeur"],
    supprimer: ["pca", "directeur"],
  },

  paiements: {
    lire:     ["pca", "directeur", "comptable", "agent_terrain", "auditeur"],
    confirmer:["pca", "directeur", "agent_terrain"],
    annuler:  ["pca", "directeur"],
  },

  exportateurs: {
    lire:     ["pca", "directeur", "comptable", "auditeur"],
    creer:    ["pca", "directeur"],
    modifier: ["pca", "directeur"],
    supprimer:["pca"],
  },

  creances: {
    lire:                     ["pca", "directeur", "comptable", "auditeur"],
    enregistrer_encaissement: ["pca", "directeur", "comptable"],
    modifier:                 ["pca", "directeur"],
  },

  comptabilite: {
    lire:                     ["pca", "directeur", "comptable", "auditeur"],
    saisir_ecriture_manuelle: ["pca", "directeur", "comptable"],
    modifier_ecriture:        ["pca", "directeur"],
    supprimer_ecriture:       ["pca"],
    cloture_exercice:         ["pca", "directeur"],
    voir_grand_livre:         ["pca", "directeur", "comptable", "auditeur"],
    voir_balance:             ["pca", "directeur", "comptable", "auditeur"],
    voir_bilan:               ["pca", "directeur", "comptable", "auditeur"],
    voir_compte_resultat:     ["pca", "directeur", "comptable", "auditeur"],
  },

  reporting: {
    voir_dashboard:             ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "auditeur"],
    generer_rapport_mensuel:    ["pca", "directeur", "comptable"],
    generer_bilan_campagne:     ["pca", "directeur", "comptable"],
    generer_fiche_membre:       ["pca", "directeur", "agent_terrain"],
    exporter_donnees_bailleurs: ["pca", "directeur", "auditeur"],
  },

  communication: {
    lire_historique:    ["pca", "directeur", "comptable"],
    envoyer_sms:        ["pca", "directeur"],
    envoyer_whatsapp:   ["pca", "directeur"],
    configurer_alertes: ["pca", "directeur"],
  },

  salaires: {
    lire:                ["pca", "directeur", "comptable", "auditeur"],
    creer_personnel:     ["pca", "directeur"],
    modifier_personnel:  ["pca", "directeur", "comptable"],
    supprimer_personnel: ["pca", "directeur"],
    generer_bulletins:   ["pca", "directeur", "comptable"],
    valider_bulletins:   ["pca", "directeur"],
    payer_bulletins:     ["pca", "directeur"],
    supprimer_bulletin:  ["pca", "directeur"],
    gerer_avances:       ["pca", "directeur", "comptable"],
  },
};
