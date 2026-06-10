export interface AgentUser {
  id: number;
  nom: string;
  prenoms: string;
  email: string;
  telephone: string | null;
  role: string;
  cooperativeId: number | null;
  section: string | null;
  zoneType: string | null;
  zoneNom: string | null;
  motDePasseTemporaire?: boolean;
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
  statutPaiement?: "PAYÉ" | "DIFFÉRÉ";
  soldeCaisseApres?: number;
}

export interface CaisseDelegue {
  id: number;
  solde: number;
  plafond: number | null;
  paiementsDifferesCount: number;
  montantDuFcfa: number;
}

export interface PaiementDiffere {
  livraisonId: number;
  membreId: number;
  membreNom: string;
  dateLivraison: string;
  poidsKg: number;
  montantNetFcfa: number;
  montantRestant: number;
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

export interface GpsPoint {
  lat: number;
  lon: number;
  accuracy?: number;
  ts: number;
}

export interface GpsCollecteInput {
  missionId: number;
  membreId: number;
  polygoneGps: GpsPoint[];
  photos: string[];
  notes?: string;
  superficieCalculeeHa?: number;
  probleme?: { type: string; description: string };
  localId?: string;
}

export interface MissionTerrain {
  id: number;
  cooperativeId: number;
  titre: string;
  zoneType: string;
  zoneNom: string;
  datePrevue: string;
  agentId: number | null;
  statut: "planifiee" | "en_cours" | "soumise" | "validee" | "rejetee";
  objectifParcelles: number | null;
  parcellesCollectees: number | null;
  motifRejet: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  membresTotal: number;
  membresCollectes: number;
  membresRejetes: number;
}

export interface MissionMembre {
  id: number;
  membreId: number;
  statut: "a_faire" | "collecte" | "valide" | "rejete";
  gpsCollecte: unknown;
  photosCollectees: unknown;
  notesAgent: string | null;
  dateCollecte: string | null;
  motifRejet: string | null;
  membreNom: string | null;
  membrePrenoms: string | null;
  membreVillage: string | null;
  membreSection: string | null;
  superficieHa: string | null;
}

export interface MessageMission {
  id: number;
  message: string;
  type: string | null;
  lu: boolean | null;
  createdAt: string;
  auteurId: number | null;
  auteurNom: string | null;
  auteurPrenoms: string | null;
  auteurRole: string | null;
}

export interface MissionDetail extends MissionTerrain {
  membres: MissionMembre[];
  messages: MessageMission[];
}

export interface StatsAgent {
  parcellesMappees: number;
  missionsTerminees: number;
  missionsTotal: number;
  tauxValidation: number;
}

export interface PendingOp {
  localId: string;
  type: "collecte" | "paiement" | "avance" | "gps_collecte";
  data: CollecteInput | PaiementInput | AvanceInput | GpsCollecteInput;
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
