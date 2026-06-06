import { type Request, type Response, type NextFunction } from "express";

// ─── Matrice des permissions RBAC ───────────────────────────────────────────

export const PERMISSIONS: Record<string, Record<string, string[]>> = {

  // MODULE COMPTES & ADMINISTRATION
  users: {
    lire:      ["pca", "directeur"],
    creer:     ["pca", "directeur"],
    modifier:  ["pca", "directeur"],
    supprimer: ["pca", "directeur"],
    activer:   ["pca", "directeur"],
  },

  // MODULE M01 — MEMBRES
  membres: {
    lire:     ["pca", "directeur", "comptable", "responsable_tracabilite", "agent_terrain", "auditeur"],
    creer:    ["pca", "directeur", "agent_terrain"],
    modifier: ["pca", "directeur", "agent_terrain"],
    supprimer:["pca", "directeur"],
    exporter: ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE M02 — TRAÇABILITÉ
  tracabilite: {
    lire:             ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
    creer_lot:        ["pca", "directeur", "responsable_tracabilite"],
    modifier_lot:     ["pca", "directeur", "responsable_tracabilite"],
    supprimer_lot:    ["pca", "directeur"],
    scanner_qr:       ["pca", "directeur", "responsable_tracabilite", "agent_terrain"],
    exporter_eudr:    ["pca", "directeur", "responsable_tracabilite", "auditeur"],
  },

  // MODULE M03 — STOCKS
  stocks: {
    lire:                ["pca", "directeur", "comptable", "magasinier", "auditeur"],
    entree:              ["pca", "directeur", "magasinier"],
    sortie:              ["pca", "directeur", "magasinier"],
    creer_entrepot:      ["pca", "directeur"],
    modifier_entrepot:   ["pca", "directeur"],
    supprimer_entrepot:  ["pca"],
    voir_alertes:        ["pca", "directeur", "magasinier"],
  },

  // MODULE M04 — AVANCES & PAIEMENTS
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

  // MODULE M04 ÉTENDU — EXPORTATEURS & CRÉANCES
  exportateurs: {
    lire:     ["pca", "directeur", "comptable", "auditeur"],
    creer:    ["pca", "directeur"],
    modifier: ["pca", "directeur"],
    supprimer:["pca"],
  },

  creances: {
    lire:                      ["pca", "directeur", "comptable", "auditeur"],
    enregistrer_encaissement:  ["pca", "directeur", "comptable"],
    modifier:                  ["pca", "directeur"],
  },

  // MODULE M05 — COMPTABILITÉ
  comptabilite: {
    lire:                             ["pca", "directeur", "comptable", "auditeur"],
    saisir_ecriture_manuelle:         ["pca", "directeur", "comptable"],
    modifier_ecriture:                ["pca", "directeur"],
    supprimer_ecriture:               ["pca"],
    cloture_exercice:                 ["pca", "directeur"],
    voir_grand_livre:                 ["pca", "directeur", "comptable", "auditeur"],
    voir_balance:                     ["pca", "directeur", "comptable", "auditeur"],
    voir_bilan:                       ["pca", "directeur", "comptable", "auditeur"],
    voir_compte_resultat:             ["pca", "directeur", "comptable", "auditeur"],
    voir_config:                      ["pca", "directeur", "comptable"],
    modifier_config:                  ["pca", "directeur", "comptable"],
    voir_ecritures_attente:           ["pca", "directeur", "comptable"],
    valider_ecriture:                 ["pca", "directeur", "comptable"],
    rejeter_ecriture:                 ["pca", "directeur", "comptable"],
    valider_tout:                     ["pca", "directeur", "comptable"],
    // Plan comptable personnalisé
    voir_plan:                        ["pca", "directeur", "comptable", "auditeur"],
    ajouter_compte:                   ["pca", "directeur", "comptable"],
    modifier_compte:                  ["pca", "directeur", "comptable"],
    desactiver_compte:                ["pca", "directeur"],
    // Paramètres comptes modules
    voir_params:                      ["pca", "directeur", "comptable", "auditeur"],
    modifier_params:                  ["pca", "directeur", "comptable"],
    reset_ohada:                      ["pca", "directeur"],
    // Corrections d'écritures
    corriger:                         ["pca", "directeur", "comptable"],
    voir_historique_corrections:      ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE M06 — REPORTING
  reporting: {
    voir_dashboard:               ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "auditeur"],
    generer_rapport_mensuel:      ["pca", "directeur", "comptable"],
    generer_bilan_campagne:       ["pca", "directeur", "comptable"],
    generer_fiche_membre:         ["pca", "directeur", "agent_terrain"],
    exporter_donnees_bailleurs:   ["pca", "directeur", "auditeur"],
  },

  // MODULE M08 — SALAIRES
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

  // MODULE CAMPAGNES
  campagnes: {
    lire:       ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "agent_terrain", "auditeur"],
    creer:      ["pca", "directeur"],
    fermer:     ["pca", "directeur"],
    verifier:   ["pca", "directeur", "comptable"],
    cloturer:   ["pca", "directeur"],
    voir_bilan: ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE PARTS SOCIALES
  parts_sociales: {
    lire:               ["pca", "directeur", "comptable", "agent_terrain", "auditeur"],
    enregistrer_versement: ["pca", "directeur", "comptable", "agent_terrain"],
    configurer:         ["pca", "directeur"],
  },

  // MODULE REFUS
  refus: {
    lire:    ["pca", "directeur", "magasinier", "responsable_tracabilite", "comptable", "auditeur"],
    traiter: ["pca", "directeur", "magasinier", "responsable_tracabilite"],
  },

  // MODULE FOURNISSEURS
  fournisseurs: {
    lire:     ["pca", "directeur", "comptable", "agent_terrain", "responsable_tracabilite", "auditeur"],
    creer:    ["pca", "directeur", "agent_terrain"],
    modifier: ["pca", "directeur", "agent_terrain"],
  },

  // MODULE M07 — COMMUNICATION
  communication: {
    lire_historique:    ["pca", "directeur", "comptable"],
    envoyer_sms:        ["pca", "directeur"],
    envoyer_whatsapp:   ["pca", "directeur"],
    configurer_alertes: ["pca", "directeur"],
  },

  // MODULE BUDGET
  budget: {
    voir:     ["pca", "directeur", "comptable", "auditeur"],
    creer:    ["pca", "directeur", "comptable"],
    valider:  ["pca", "directeur"],
    modifier: ["pca", "directeur", "comptable"],
  },

  // MODULE GOUVERNANCE — ASSEMBLÉES GÉNÉRALES
  gouvernance: {
    voir:             ["pca", "directeur", "comptable", "auditeur"],
    planifier_ag:     ["pca", "directeur"],
    convoquer:        ["pca", "directeur"],
    gerer_seance:     ["pca", "directeur"],
    enregistrer_vote: ["pca", "directeur"],
    generer_pv:       ["pca", "directeur"],
    voir_archives:    ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE SUBVENTIONS / BAILLEURS
  subventions: {
    voir:              ["pca", "directeur", "comptable", "auditeur"],
    creer_subvention:  ["pca", "directeur"],
    enregistrer_fonds: ["pca", "directeur", "comptable"],
    utiliser_fonds:    ["pca", "directeur", "comptable"],
    generer_rapport:   ["pca", "directeur", "comptable"],
  },

  // MODULE DEVISES & CHANGE
  devises: {
    voir_taux:      ["pca", "directeur", "comptable", "auditeur"],
    modifier_taux:  ["pca", "directeur", "comptable"],
    rapport_change: ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE EMPRUNTS
  emprunts: {
    voir:        ["pca", "directeur", "comptable", "auditeur"],
    creer:       ["pca", "directeur"],
    rembourser:  ["pca", "directeur", "comptable"],
    supprimer:   ["pca"],
  },

  // MODULE PRIX
  prix: {
    voir:         ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
    saisir_prix:  ["pca", "directeur"],
    diffuser_sms: ["pca", "directeur"],
    voir_analyse: ["pca", "directeur", "comptable", "auditeur"],
    configurer:   ["pca", "directeur"],
  },

  // MODULE M28 — INTRANTS
  intrants: {
    voir:          ["pca", "directeur", "comptable", "agent_terrain", "auditeur", "magasinier"],
    distribuer:    ["pca", "directeur", "agent_terrain"],
    approvisionner:["pca", "directeur", "magasinier"],
    rembourser:    ["pca", "directeur", "agent_terrain", "comptable"],
    rapport:       ["pca", "directeur", "comptable", "auditeur"],
    creer:         ["pca", "directeur", "magasinier"],
    modifier:      ["pca", "directeur", "magasinier"],
  },

  // MODULE PARCELLES & EUDR
  parcelles: {
    voir_carte:       ["pca", "directeur", "comptable", "responsable_tracabilite", "agent_terrain", "auditeur"],
    creer_parcelle:   ["pca", "directeur", "agent_terrain", "responsable_tracabilite"],
    modifier_parcelle:["pca", "directeur", "agent_terrain", "responsable_tracabilite"],
    verifier_eudr:    ["pca", "directeur", "responsable_tracabilite", "auditeur"],
    exporter_geojson: ["pca", "directeur", "responsable_tracabilite", "auditeur"],
    importer_zones:   ["pca", "directeur"],
  },

  // MODULE DONS
  dons: {
    voir:             ["pca", "directeur", "comptable", "auditeur"],
    creer:            ["pca", "directeur", "comptable"],
    modifier:         ["pca", "directeur"],
    valider:          ["pca", "directeur"],
    annuler:          ["pca", "directeur"],
    generer_pv:       ["pca", "directeur", "comptable"],
    voir_stats:       ["pca", "directeur", "comptable", "auditeur"],
    rapport_ag:       ["pca", "directeur", "comptable"],
    gerer_programmes: ["pca", "directeur"],
  },

  // MODULE RSE — RESPONSABILITÉ SOCIALE DES ENTREPRISES
  rse: {
    voir:                 ["pca", "directeur", "comptable", "auditeur"],
    calculer:             ["pca", "directeur"],
    enregistrer_formation:["pca", "directeur", "responsable_tracabilite"],
    generer_rapport:      ["pca", "directeur", "comptable"],
  },

  // MODULE M15 — PISTE D'AUDIT
  audit: {
    voir_journal:           ["pca", "directeur", "auditeur"],
    voir_stats:             ["pca", "directeur"],
    exporter:               ["pca", "directeur", "auditeur"],
    voir_historique_entite: ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE — GESTION DE CAISSE
  caisse: {
    voir:             ["pca", "directeur", "comptable", "auditeur"],
    ouvrir_session:   ["pca", "directeur", "comptable"],
    enregistrer_mvt:  ["pca", "directeur", "comptable", "agent_terrain"],
    fermer_session:   ["pca", "directeur", "comptable"],
    creer_caisse:     ["pca", "directeur"],
    voir_alertes:     ["pca", "directeur", "comptable"],
  },

  // MODULE — RÉCONCILIATION BANCAIRE
  reconciliation: {
    voir:        ["pca", "directeur", "comptable", "auditeur"],
    importer:    ["pca", "directeur", "comptable"],
    reconcilier: ["pca", "directeur", "comptable"],
  },

  // MODULE — FISCALITÉ
  fiscalite: {
    voir:       ["pca", "directeur", "comptable", "auditeur"],
    generer:    ["pca", "directeur", "comptable"],
    payer:      ["pca", "directeur", "comptable"],
    configurer: ["pca", "directeur"],
  },

  // MODULE — FORMATIONS & RENFORCEMENT DE CAPACITÉS
  formation: {
    voir:                  ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
    planifier:             ["pca", "directeur", "responsable_tracabilite"],
    inscrire:              ["pca", "directeur", "responsable_tracabilite"],
    gerer_presences:       ["pca", "directeur", "responsable_tracabilite", "agent_terrain"],
    generer_attestation:   ["pca", "directeur", "responsable_tracabilite"],
    voir_stats:            ["pca", "directeur", "comptable", "auditeur"],
  },

  // MODULE — PLANIFICATION DES COLLECTES
  planning_collecte: {
    voir:        ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
    planifier:   ["pca", "directeur", "responsable_tracabilite"],
    notifier_sms:["pca", "directeur"],
    terminer:    ["pca", "directeur", "responsable_tracabilite", "agent_terrain"],
    gerer_zones: ["pca", "directeur"],
  },

};

// ─── Fonction principale ─────────────────────────────────────────────────────

export function hasPermission(userRole: string, module: string, action: string): boolean {
  const allowed = PERMISSIONS[module]?.[action];
  if (!allowed) return false;
  return allowed.includes(userRole);
}

// ─── Middleware Express réutilisable ─────────────────────────────────────────

export function checkPermission(module: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role ?? "";
    if (!hasPermission(role, module, action)) {
      res.status(403).json({
        erreur: "Accès refusé",
        message: `Votre rôle (${role}) ne permet pas cette action.`,
      });
      return;
    }
    next();
  };
}
