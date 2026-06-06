export interface AgentUser {
  id: number;
  nom: string;
  prenoms: string;
  email: string;
  telephone: string | null;
  role: string;
  cooperativeId: number | null;
  section: string | null;
}

export interface Fournisseur {
  id: number;
  code: string;
  nom: string;
  prenoms: string;
  telephone: string;
  section: string | null;
  village: string | null;
  typeMembre: "membre" | "externe";
  avanceEnCours: number;
  intrantsDus: number;
  derniereLivraison: string | null;
}

export interface FournisseurRecap {
  id: number;
  code: string;
  nom: string;
  prenoms: string;
  telephone: string;
  section: string | null;
  village: string | null;
  typeMembre: string;
  avanceEnCours: number;
  avanceId: number | null;
  intrantsDus: number;
  derniereLivraison: string | null;
  nbJoursDepuisLivraison: number | null;
}

export interface CollecteInput {
  membreId: number;
  nombreSacs: number;
  poidsBrutKg: number;
  retenueKg: number;
  modePaiement: "orange_money" | "mtn_momo" | "especes";
  localId?: string;
}

export interface CollecteResult {
  livraisonId: number;
  ref: string;
  membreNom: string;
  poidsNetKg: number;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  intrantsDeduitsFcfa: number;
  montantNetFcfa: number;
  modePaiement: string;
  prixUnitaireFcfa: number;
}

export interface PaiementInput {
  membreId: number;
  livraisonId: number;
  modePaiement: "orange_money" | "mtn_momo" | "especes";
  localId?: string;
}

export interface AvanceInput {
  membreId: number;
  montantFcfa: number;
  motif: string;
  localId?: string;
}

export interface BilanJour {
  collectes: { nb: number; tonnage: number; valeur: number };
  paiements: { nb: number; total: number };
  avances: { nb: number; total: number };
  dernieresOps: Array<{
    heure: string;
    type: string;
    label: string;
    montant: number;
  }>;
}

export interface PendingOp {
  localId: string;
  type: "collecte" | "paiement" | "avance";
  data: CollecteInput | PaiementInput | AvanceInput;
  timestamp: number;
  status: "pending" | "synced" | "error";
  errorMsg?: string;
  tentatives?: number;
  syncedAt?: number;
}

export interface PrixActuel {
  prixBordChampFcfa: number;
  campagneId: number | null;
}
