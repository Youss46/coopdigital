const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/portail`;
const TOKEN_KEY = "portail_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ConnexionResult {
  token: string;
  membre: { id: number; nom: string; prenoms: string; telephone: string; statut: string };
}

export type Profil = {
  id: number; codeMembre: string; nom: string; prenoms: string;
  telephone: string; village: string | null; groupement: string | null;
  dateAdhesion: string; statut: string;
  photoUrl: string | null; carteStatut: string;
  campagneActive: { id: number; libelle: string } | null;
};

export type Livraison = {
  id: number; codeAchat: string | null; dateLivraison: string;
  produit: string | null; poidsKg: string; prixUnitaireFcfa: number;
  montantBrutFcfa: number; avanceDeduiteFcfa: number;
  intrantsDeduitsFcfa: number; montantNetFcfa: number;
  campagneId: number | null; campagneLibelle: string | null;
};

export type Avance = {
  id: number; montantOctroyeFcfa: number; montantRembourseFcfa: number;
  soldeRestantFcfa: number; dateOctroi: string; dateEcheance: string | null;
  motif: string | null; statut: string; pctRembourse: number;
};

export type Intrant = {
  id: number; intrantLibelle: string | null; intrantUnite: string | null;
  dateDistribution: string; quantite: string; montantFcfa: string;
  montantMembreFcfa: string; montantRembourseFcfa: string;
  statutRemboursement: string; soldeDuFcfa: number;
};

export type PartsSociales = {
  nbrePartsSouscrites: number; valeurNominaleFcfa: number;
  totalSouscritFcfa: number; totalLibereFcfa: number;
  resteALibererFcfa: number; pctLibere: number;
  historiqueVersements: { id: number; dateVersement: string; montantFcfa: number; codeLiberation: string | null }[];
};

export type Score = {
  scoreGlobal: number; niveau: string | null; rang: number | null;
  totalMembres: number; dateCalcul: string;
  details: { volume: number; qualite: number; regularite: number; remboursement: number; fidelite: number; cotisation: number };
} | null;

export const api = {
  connexion: (code_membre: string, telephone: string) =>
    req<ConnexionResult>("/connexion", {
      method: "POST",
      body: JSON.stringify({ code_membre, telephone }),
    }),
  profil: () => req<Profil>("/profil"),
  livraisons: () => req<Livraison[]>("/livraisons"),
  avances: () => req<Avance[]>("/avances"),
  intrants: () => req<Intrant[]>("/intrants"),
  partsSociales: () => req<PartsSociales>("/parts-sociales"),
  score: () => req<Score>("/score"),
  recuPdfUrl: (livraisonId: number) => `${BASE}/recus/${livraisonId}`,
  carteMembreUrl: () => `${BASE}/carte-membre`,
  uploadPhoto: (photoDataUrl: string) =>
    req<{ ok: boolean }>("/photo", {
      method: "PUT",
      body: JSON.stringify({ photoDataUrl }),
    }),

  // ── Push notifications ──────────────────────────────────────────────────────
  pushVapidKey: () => req<{ vapidKey: string }>("/push/vapid-key"),
  pushSubscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    req<{ ok: boolean }>("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub),
    }),
  pushUnsubscribe: (endpoint: string) =>
    req<{ ok: boolean }>("/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
};
