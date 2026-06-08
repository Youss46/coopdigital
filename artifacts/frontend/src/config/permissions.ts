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
    valider:  ["pca", "directeur", "comptable"],
    rejeter:  ["pca", "directeur", "comptable"],
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
    voir_config:              ["pca", "directeur", "comptable"],
    modifier_config:          ["pca", "directeur", "comptable"],
    voir_ecritures_attente:   ["pca", "directeur", "comptable"],
    valider_ecriture:         ["pca", "directeur", "comptable"],
    rejeter_ecriture:         ["pca", "directeur", "comptable"],
    valider_tout:             ["pca", "directeur", "comptable"],
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

  budget: {
    voir:     ["pca", "directeur", "comptable", "auditeur"],
    creer:    ["pca", "directeur", "comptable"],
    valider:  ["pca", "directeur"],
    modifier: ["pca", "directeur", "comptable"],
  },

  subventions: {
    voir:              ["pca", "directeur", "comptable", "auditeur"],
    creer_subvention:  ["pca", "directeur"],
    enregistrer_fonds: ["pca", "directeur", "comptable"],
    utiliser_fonds:    ["pca", "directeur", "comptable"],
    generer_rapport:   ["pca", "directeur", "comptable"],
  },

  gouvernance: {
    voir:             ["pca", "directeur", "comptable", "auditeur"],
    planifier_ag:     ["pca", "directeur"],
    convoquer:        ["pca", "directeur"],
    gerer_seance:     ["pca", "directeur"],
    enregistrer_vote: ["pca", "directeur"],
    generer_pv:       ["pca", "directeur"],
    voir_archives:    ["pca", "directeur", "comptable", "auditeur"],
  },

  prix: {
    voir:         ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
    saisir_prix:  ["pca", "directeur"],
    diffuser_sms: ["pca", "directeur"],
    voir_analyse: ["pca", "directeur", "comptable", "auditeur"],
    configurer:   ["pca", "directeur"],
  },

  devises: {
    voir_taux:      ["pca", "directeur", "comptable", "auditeur"],
    modifier_taux:  ["pca", "directeur", "comptable"],
    rapport_change: ["pca", "directeur", "comptable", "auditeur"],
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

  refus: {
    lire:    ["pca", "directeur", "magasinier", "responsable_tracabilite", "comptable", "auditeur"],
    traiter: ["pca", "directeur", "magasinier", "responsable_tracabilite"],
  },

  anomalies: {
    lire:       ["pca", "directeur", "comptable", "auditeur"],
    traiter:    ["pca", "directeur", "comptable"],
    configurer: ["pca", "directeur"],
  },

  fournisseurs: {
    lire:     ["pca", "directeur", "comptable", "agent_terrain", "responsable_tracabilite", "auditeur"],
    creer:    ["pca", "directeur", "agent_terrain"],
    modifier: ["pca", "directeur", "agent_terrain"],
  },

  campagnes: {
    lire:       ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "agent_terrain", "auditeur"],
    creer:      ["pca", "directeur"],
    fermer:     ["pca", "directeur"],
    verifier:   ["pca", "directeur", "comptable"],
    cloturer:   ["pca", "directeur"],
    voir_bilan: ["pca", "directeur", "comptable", "auditeur"],
  },

  audit: {
    voir_journal:           ["pca", "directeur", "auditeur"],
    voir_stats:             ["pca", "directeur"],
    exporter:               ["pca", "directeur", "auditeur"],
    voir_historique_entite: ["pca", "directeur", "comptable", "auditeur"],
  },
};
