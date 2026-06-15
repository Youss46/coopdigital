// ─── Source de vérité unique pour la navigation ───────────────────────────────
// Tout ajout/modification de module DOIT se faire ici.
// Layout.tsx et GlobalSearch.tsx consomment ce fichier — plus jamais de
// désynchronisation entre la sidebar et la recherche globale.

export type NavItemConfig = {
  href: string;
  label: string;
  roles: string[];
  category: string;
  showBadge?: boolean;
  showAnomaliesBadge?: boolean;
  showEudrAlerteBadge?: boolean;
};

export const NAV_ITEMS: NavItemConfig[] = [
  // ── Dashboards ──────────────────────────────────────────────────────────────
  { href: "/dashboard/pca",          label: "Vue PCA",                   roles: ["pca"],                                                                       category: "Tableau de bord" },
  { href: "/dashboard",              label: "Tableau de bord",           roles: ["pca","directeur","comptable","magasinier","responsable_tracabilite","auditeur"], category: "Tableau de bord" },
  { href: "/dashboard-delegue",      label: "Tableau de bord délégué",   roles: ["delegue"],                                                                   category: "Tableau de bord" },

  // ── Agent terrain ────────────────────────────────────────────────────────────
  { href: "/missions",               label: "Mes missions",              roles: ["agent_terrain"],                                                             category: "Terrain" },

  // ── Membres ──────────────────────────────────────────────────────────────────
  { href: "/membres",                label: "Membres",                   roles: ["pca","directeur","comptable","responsable_tracabilite","delegue","auditeur"], category: "Membres" },
  { href: "/cartes-membres",         label: "Cartes membres",            roles: ["pca","directeur","comptable","delegue","auditeur"],                          category: "Membres" },
  { href: "/scoring",                label: "Scoring Producteurs",       roles: ["pca","directeur","comptable","auditeur"],                                    category: "Membres" },

  // ── Collecte ─────────────────────────────────────────────────────────────────
  { href: "/campagnes",              label: "Campagnes",                 roles: ["pca","directeur","comptable","magasinier","delegue","auditeur"],              category: "Collecte" },
  { href: "/livraisons",             label: "Livraisons",                roles: ["delegue"],                                                                   category: "Collecte" },
  { href: "/livraisons/nouvelle",    label: "Livraisons",                roles: ["pca","directeur","comptable","auditeur"],                                    category: "Collecte" },
  { href: "/transport",              label: "Transport",                 roles: ["pca","directeur","comptable","auditeur","magasinier"],                       category: "Collecte" },
  { href: "/expeditions",            label: "Expéditions port",          roles: ["pca","directeur","comptable","responsable_tracabilite","auditeur"],           category: "Collecte" },

  // ── Traçabilité ──────────────────────────────────────────────────────────────
  { href: "/tracabilite",            label: "Traçabilité",               roles: ["pca","directeur","responsable_tracabilite","auditeur"],                      category: "Traçabilité" },
  { href: "/parcelles",              label: "Parcelles & EUDR",          roles: ["pca","directeur","comptable","responsable_tracabilite","auditeur"],           category: "Traçabilité", showEudrAlerteBadge: true },
  { href: "/missions",               label: "Missions terrain",          roles: ["responsable_tracabilite"],                                                   category: "Traçabilité" },

  // ── Stocks ───────────────────────────────────────────────────────────────────
  { href: "/stocks",                 label: "Stocks",                    roles: ["pca","directeur","magasinier","comptable","auditeur"],                       category: "Stocks" },
  { href: "/entrepots",              label: "Entrepôts délégués",        roles: ["pca","directeur","comptable","auditeur"],                                    category: "Stocks" },
  { href: "/mon-entrepot",           label: "Mon entrepôt",              roles: ["delegue"],                                                                   category: "Stocks" },
  { href: "/refus",                  label: "Stocks refoulés",           roles: ["pca","directeur","magasinier","comptable","auditeur"],                       category: "Stocks" },

  // ── Finance membre ───────────────────────────────────────────────────────────
  { href: "/avances",                label: "Avances",                   roles: ["pca","directeur","comptable","delegue","auditeur"],                          category: "Finance membre" },
  { href: "/intrants",               label: "Intrants",                  roles: ["pca","directeur","comptable","delegue","auditeur","magasinier"],             category: "Finance membre" },
  { href: "/reglements",             label: "Règlements",                roles: ["pca","directeur","comptable","delegue","auditeur"],                          category: "Finance membre" },

  // ── Commerce ─────────────────────────────────────────────────────────────────
  { href: "/fournisseurs",           label: "Fournisseurs",              roles: ["pca","directeur","comptable","delegue","auditeur"],                          category: "Commerce" },
  { href: "/exportateurs",           label: "Exportateurs",              roles: ["pca","directeur","comptable","auditeur"],                                    category: "Commerce" },
  { href: "/creances",               label: "Créances",                  roles: ["pca","directeur","comptable","auditeur"],                                    category: "Commerce" },
  { href: "/prix",                   label: "Suivi des Prix",            roles: ["pca","directeur","comptable","responsable_tracabilite","delegue","auditeur"], category: "Commerce" },

  // ── Finances ─────────────────────────────────────────────────────────────────
  { href: "/finances/tableau-bord",  label: "Tableau de bord financier", roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/budget",                 label: "Budget",                    roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/emprunts",               label: "Emprunts",                  roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/subventions",            label: "Subventions",               roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/dons",                   label: "Dons",                      roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/caisse",                 label: "Caisse",                    roles: ["pca","directeur","comptable","auditeur","delegue"],                          category: "Finances" },
  { href: "/banque",                 label: "Banque",                    roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/mobile-marchand",        label: "Mobile Marchands",          roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/fiscalite",              label: "Fiscalité",                 roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/reconciliation",         label: "Réconciliation",            roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/investissements",        label: "Investissements",           roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },
  { href: "/comptabilite",           label: "Comptabilité",              roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances", showBadge: true },
  { href: "/salaires",               label: "Salaires",                  roles: ["pca","directeur","comptable","auditeur"],                                    category: "Finances" },

  // ── RH & Social ──────────────────────────────────────────────────────────────
  { href: "/formations",             label: "Formations",                roles: ["pca","directeur","comptable","auditeur","delegue"],                          category: "RH & Social" },
  { href: "/formations-rse",         label: "Formations RSE",            roles: ["pca","directeur","comptable","auditeur"],                                    category: "RH & Social" },
  { href: "/equipements",            label: "Équipements",               roles: ["pca","directeur","comptable","auditeur"],                                    category: "RH & Social" },

  // ── Pilotage ─────────────────────────────────────────────────────────────────
  { href: "/previsions",             label: "Prévisions",                roles: ["pca","directeur","comptable","auditeur"],                                    category: "Pilotage" },
  { href: "/reporting",              label: "Reporting",                 roles: ["pca","directeur","comptable","responsable_tracabilite","auditeur"],           category: "Pilotage" },
  { href: "/anomalies",              label: "Anomalies",                 roles: ["pca","directeur","comptable","auditeur"],                                    category: "Pilotage", showAnomaliesBadge: true },
  { href: "/audit",                  label: "Journal d'audit",           roles: ["pca","directeur","auditeur"],                                               category: "Pilotage" },

  // ── Organisation ─────────────────────────────────────────────────────────────
  { href: "/gouvernance",            label: "Gouvernance",               roles: ["pca","directeur","secretaire","auditeur"],                                   category: "Organisation" },
  { href: "/communication",          label: "Communication",             roles: ["pca","directeur"],                                                           category: "Organisation" },
  { href: "/delegues",               label: "Délégués Localité",         roles: ["pca","directeur","comptable","auditeur"],                                    category: "Organisation" },
  { href: "/administration/comptes", label: "Administration",            roles: ["pca","directeur"],                                                           category: "Organisation" },
  { href: "/parametres",             label: "Paramètres",                roles: ["pca","directeur"],                                                           category: "Organisation" },
];
