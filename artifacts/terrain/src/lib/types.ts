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
  /** Peseur uniquement : ID du délégué de rattachement (null = base centrale) */
  delegueId?: number | null;
  /** Si true : la saisie manuelle du poids est désactivée — balance obligatoire */
  machinePeseeObligatoire?: boolean;
  /** Chauffeur uniquement : ID dans la table chauffeurs (transport) */
  chauffeurId?: number | null;
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
  /** Les membres délégués doivent passer par un bon de réception avant pesée. */
  isMembreDelegue?: boolean;
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
  /** ID du membre (planteur inscrit à la coopérative) */
  membreId?: number;
  /** ID du fournisseur externe (pisteur / non-membre) */
  fournisseurId?: number;
  nombreSacs: number;
  poidsBrutKg: number;
  retenueKg: number;
  /** Mode de paiement — optionnel au niveau terrain, le règlement se fait via la page Règlements */
  modePaiement?: "orange_money" | "mtn_momo" | "especes";
  localId?: string;
  /** Si renseigné : la livraison est imputée à ce délégué central (saisie proxy) */
  targetDelegueId?: number;
  /** Plan de déduction de l'avance du membre — par défaut "integral" */
  avancePlanType?: "integral" | "partiel" | "reporte";
  /** Montant à déduire si planType = "partiel" */
  avanceMontantPartiel?: number;
  /** Certification du cacao pour un fournisseur externe */
  certificationCacao?: "RA" | "FAIRTRADE" | "ASR_1000" | "ORDINAIRE";
}

export interface DelegueProxy {
  id: number;
  nom: string;
  prenoms: string;
  section: string | null;
  zoneNom: string | null;
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
  commissionFcfa?: number | null;
  saisiePour?: string | null;
}

export interface ConversionLivraisonResult {
  livraisonId: number;
  poidsKg: number;
  prixUnitaireFcfa: number;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  intrantsDeduitsFcfa: number;
  montantNetFcfa: number;
  modePaiement?: string;
}

export interface CommissionResume {
  enAttenteFcfa: number;
  payeFcfa: number;
  totalFcfa: number;
  nb: number;
  recentes: Array<{
    id: number;
    livraisonId: number;
    poidsKg: string;
    montantFcfa: string;
    tauxFcfaParKg: string;
    statut: string;
    createdAt: string;
  }>;
  campagnes: Array<{
    id: number;
    libelle: string;
    anneeDebut: number;
    anneeFin: number;
    statut: string;
  }>;
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
  targetDelegueId?: number;
}

export interface AvanceInput {
  membreId: number;
  montantFcfa: number;
  motif: string;
  localId?: string;
  targetDelegueId?: number;
}

export interface BilanJour {
  collectes: { nb: number; tonnage: number; valeur: number; nombreSacs: number };
  paiements: { nb: number; total: number };
  avances: { nb: number; total: number };
  dernieresOps: Array<{
    heure: string;
    type: string;
    label: string;
    montant: number;
    /** Nom du délégué pour lequel l'opération a été saisie (mode proxy), sinon null */
    saisiePour?: string | null;
  }>;
}

export interface GpsPoint {
  lat: number;
  lon: number;
  accuracy?: number;
  ts: number;
}

export const GPS_CRS = "EPSG:4326" as const;

export function normalizeGpsPoint(point: GpsPoint): GpsPoint {
  return {
    ...point,
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6)),
  };
}

export interface GpsCollecteInput {
  missionId: number;
  membreId: number;
  crs: typeof GPS_CRS;
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
  membresValides?: number;
  tauxValidation?: number;
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

export interface PeseurCollecte {
  id: number;
  dateLivraison: string;
  poidsKg: number;
  montantNetFcfa: number;
  statutPaiement: string;
  membreNom: string;
  membrePrenoms: string;
  membreCode: string;
  /** Vrai si la livraison est issue d'une session de pesée groupée */
  fromSession?: boolean;
  /** Plan de déduction d'avance : null = pas d'avance, "integral" = déduit, "partiel" = partiel, "reporte" = reporté */
  planAvanceType?: string | null;
  /** Présent uniquement pour les entrées de type réception de transfert */
  type?: "livraison" | "reception_transfert";
  transfertNumero?: string | null;
  entrepotNom?: string | null;
  sessionId?: number | null;
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

/** Format commun utilisé par l'historique de synchronisation. */
export interface SyncHistoryOp {
  localId: string;
  type: PendingOp["type"] | "enquete" | "pesee_brouillon";
  data: Record<string, unknown>;
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

// ─── Offline enquête ops ──────────────────────────────────────────────────────

export interface EnqueteOp {
  localId: string;
  missionId: number;
  membreId: number;
  reponses: Record<string, { valeur: "oui" | "non" | "na"; commentaire?: string }>;
  notesAgent?: string;
  timestamp: number;
  status: "pending" | "synced" | "error";
  tentatives?: number;
  errorMsg?: string;
  syncedAt?: number;
}

// ─── Brouillons pesée hors-ligne ─────────────────────────────────────────────

export interface BrouillonLigne {
  localId: string;
  nbSacs: number;
  poidsBrutKg: number;
  tareKg: number;
  notes?: string;
  numeroPassage: number;
  timestamp: number;
}

export interface BrouillonPesee {
  localId: string;
  membreId: number;
  membreNom: string;
  membrePrenoms: string;
  membreCode: string;
  produit: string;
  operation: string;
  /** Certification déclarée par le peseur avant le démarrage hors ligne */
  certificationCacao: string;
  statut: "en_cours" | "terminee" | "annulee";
  syncStatus: "pending" | "syncing" | "synced" | "error";
  lignes: BrouillonLigne[];
  poidsTotalKg: number;
  nbSacsTotal: number;
  createdAt: number;
  updatedAt: number;
  serverId?: number;
  numeroSession?: string;
  /** Contexte d'une pré-pesée export créée hors connexion. */
  expeditionId?: number;
  expeditionNumero?: string;
  expeditionPoidsPrevuKg?: string | null;
  tentatives?: number;
  syncedAt?: number;
  errorMsg?: string;
}

// ─── Missions d'enquête ────────────────────────────────────────────────────────

export interface MissionEnquete {
  id: number;
  titre: string;
  certificationId: number;
  certType: string;
  datePrevue: string;
  statut: string;
  objectifMembres: number | null;
  membresTotal: number;
  membresProgres: number;
}

export interface EnqueteMembre {
  membreId: number;
  statut: string;
  reponses: Record<string, { valeur: "oui" | "non" | "na"; commentaire?: string }> | null;
  notesAgent: string | null;
  commentaireRt: string | null;
  dateCollecte: string | null;
  nom: string;
  prenoms: string;
  code: string | null;
  village: string | null;
}

export interface EnqueteDetail {
  id: number;
  titre: string;
  certificationId: number;
  certType: string;
  datePrevue: string;
  statut: string;
  instructions: string | null;
  criteres: string[];
  membres: EnqueteMembre[];
}

// ─── Bons de réception membres délégués de localités ─────────────────────────

export interface BonReceptionMembre {
  id: number;
  cooperativeId: number;
  membreDelegueId: number;
  membreNom: string | null;
  membrePrenoms: string | null;
  membreTel: string | null;
  membreSection: string | null;
  statut: "en_attente_pesee" | "en_pesee" | "terminee" | "annulee";
  poidsDeclaraKg: number | null;
  nombreSacsDeclares: number | null;
  typeTransport: "cooperatif" | "externe";
  vehiculeId: number | null;
  chauffeurId: number | null;
  typeVehicule: string | null;
  immatriculation: string | null;
  nomChauffeur: string | null;
  telephoneChauffeur: string | null;
  fraisCarburantFcfa: number;
  autresChargesFcfa: number;
  autresChargesLibelle: string | null;
  notes: string | null;
  sessionPeseeId: number | null;
  createdAt: string;
}

export interface BonReceptionCreationOptions {
  membres: Array<{
    id: number;
    nom: string;
    prenoms: string | null;
    section: string | null;
  }>;
  vehicules: Array<{
    id: number;
    immatriculation: string;
    marque: string | null;
    modele: string | null;
  }>;
  chauffeurs: Array<{
    id: number;
    nom: string;
    prenoms: string | null;
    telephone: string | null;
  }>;
}

// ─── Sessions de pesée ────────────────────────────────────────────────────────

export interface ExpeditionPrechargement {
  id: number;
  numeroExpedition: string;
  statut: string;
  typeVehicule: string;
  immatriculation: string | null;
  nomChauffeur: string | null;
  transporteur: string | null;
  port: string;
  poidsChargeKg: string | null;
  poidsPrevuKg?: string | null;
  nombreSacs: number | null;
  poidsChargeEffectifKg?: string | null;
  nombreSacsEffectif?: number | null;
  prechargement: {
    id: number;
    numeroSession: string;
    statut: "en_cours" | "terminee" | "annulee";
    poidsTotalKg: string | null;
    nbSacsTotal: number | null;
    prechargementStatut: "conforme" | "a_justifier" | "valide" | null;
    prechargementEcartKg: string | null;
    prechargementEcartPct: string | null;
    dateFin: string | null;
  } | null;
}

export interface LignePesee {
  id: number;
  sessionId: number;
  numeroPassage: number;
  nbSacs: number;
  poidsBrutKg: string;
  tareKg: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SessionPesee {
  id: number;
  cooperativeId: number;
  /** Peseur ayant créé la session — utilisé pour rejeter toute réponse hors périmètre. */
  peseurId: number | null;
  numeroSession: string;
  membreId: number | null;
  membreNom: string | null;
  membrePrenoms: string | null;
  /** ID du fournisseur externe (pisteur) — mutuellement exclusif avec membreId */
  fournisseurId?: number | null;
  fournisseurNom?: string | null;
  fournisseurPrenoms?: string | null;
  produit: string;
  operation: string;
  statut: "en_cours" | "terminee" | "annulee";
  poidsTotalKg: string;
  nbSacsTotal: number;
  nbLignes?: number;
  dateDebut: string;
  dateFin: string | null;
  notes: string | null;
  livraisonId: number | null;
  /** Pour les sessions de type 'reception_transfert' */
  transfertId?: number | null;
  /** Pour les sessions de type 'reception_membre_delegue' */
  bonReceptionId?: number | null;
  expeditionId?: number | null;
  prechargementStatut?: "conforme" | "a_justifier" | "valide" | null;
  prechargementEcartKg?: string | null;
  prechargementEcartPct?: string | null;
  /** Certification du cacao déclarée par le peseur */
  certificationCacao?: string | null;
  createdAt: string;
}

// ─── Transferts en attente de pesée (peseur central) ─────────────────────────

export type TransfertStatut = "planifie" | "en_cours" | "arrive" | "en_pesee" | "confirme" | "litige";

export interface TransfertEnAttente {
  id: number;
  numeroTransfert: string;
  statut: TransfertStatut;
  poidsDepart_kg: string;
  nombreSacs: number | null;
  dateDepart: string | null;
  dateArrivee: string | null;
  notes: string | null;
  sessionPeseeId: number | null;
  entrepotNom: string | null;
  zoneNom: string | null;
  delegueNom: string | null;
  deleguePrenoms: string | null;
}

export interface SessionDetail extends SessionPesee {
  lignes: LignePesee[];
  /** Contexte transfert (renseigné quand operation = 'reception_transfert') */
  transfertNumero?: string | null;
  transfertPoidsDeclaréKg?: string | null;
  transfertNombreSacs?: number | null;
  transfertEntrepotNom?: string | null;
  transfertZoneNom?: string | null;
  transfertDelegueNom?: string | null;
  transfertDeleguePrenoms?: string | null;
}
