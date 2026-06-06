const BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("m15_token");
}

export function setToken(t: string) {
  localStorage.setItem("m15_token", t);
}

export function clearToken() {
  localStorage.removeItem("m15_token");
  localStorage.removeItem("m15_user");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = import.meta.env.BASE_URL + "login";
    throw new Error("Non authentifié");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface M15User { id: number; nom: string; email: string; role: string }

export async function loginM15(email: string, motDePasse: string) {
  return request<{ token: string; user: M15User }>("/m15/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, motDePasse }),
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardM15 {
  actives: number; trials: number; suspendues: number; expirees: number;
  revenus: number; totalMembres: number; expirantDans30j: number;
  expirations: Array<{ id: number; cooperativeId: number; dateExpiration: string; planNom?: string }>;
}

export async function fetchDashboard(): Promise<DashboardM15> {
  return request<DashboardM15>("/m15/dashboard");
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export interface Plan {
  id: number; nom: string;
  prix1anFcfa: string; prix2ansFcfa: string; prix3ansFcfa: string; prix5ansFcfa: string;
  nbMembresMax: number | null; nbUsersMax: number | null; support: string | null;
  stockageGo: number | null;
}

export async function fetchPlans(): Promise<Plan[]> {
  return request<Plan[]>("/m15/plans");
}

// ─── Coopératives ─────────────────────────────────────────────────────────────

export interface LicenceSummary {
  id: number; statut: string; dateActivation: string | null; dateExpiration: string | null;
  renouvellementAuto: boolean; planNom: string | null; dureeAns: number; cleLicence: string;
}

export interface CoopItem {
  id: number; nom: string; ville: string; region: string; createdAt: string;
  licence: LicenceSummary | null; joursRestants: number | null; nbMembres: number;
}

export async function fetchCooperatives(): Promise<CoopItem[]> {
  return request<CoopItem[]>("/m15/cooperatives");
}

export interface CoopDetail {
  cooperative: { id: number; nom: string; ville: string; region: string; createdAt: string };
  licenceCourante: LicenceSummary | null;
  joursRestants: number | null;
  historique: Array<{
    id: number; action: string; ancienStatut: string | null; nouveauStatut: string | null;
    details: Record<string, unknown> | null; createdAt: string; effectuePar: string | null;
  }>;
  stats: { nbMembres: number; nbUsers: number };
}

export async function fetchCooperative(id: number): Promise<CoopDetail> {
  return request<CoopDetail>(`/m15/cooperatives/${id}`);
}

export async function createCooperative(data: {
  nom: string; ville: string; region: string;
  planId: number; dureeAns: number;
  renouvellementAuto?: boolean; trialActif?: boolean; dureeTrialJours?: number;
  montantPaye?: number; modePaiement?: string; referencePaiement?: string; notesInternes?: string;
  pcaNom: string; pcaPrenoms: string; pcaTelephone: string; pcaEmail?: string;
}) {
  return request<{ cooperative: CoopDetail["cooperative"]; cleLicence: string; dateExpiration: string | null }>("/m15/cooperatives", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function suspendreCooperative(id: number, motif: string) {
  return request<{ message: string }>(`/m15/cooperatives/${id}/suspendre`, {
    method: "PUT",
    body: JSON.stringify({ motif }),
  });
}

export async function reactiverCooperative(id: number) {
  return request<{ message: string }>(`/m15/cooperatives/${id}/reactiver`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
}

export async function supprimerCooperative(id: number, motif: string, confirmation: string) {
  return request<{ message: string }>(`/m15/cooperatives/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ motif, confirmation }),
  });
}

// ─── Licences ─────────────────────────────────────────────────────────────────

export async function renouvelerLicence(id: number, data: {
  dureeAns: number; montantPaye?: number; modePaiement?: string; referencePaiement?: string;
}) {
  return request<{ dateExpiration: string }>(`/m15/licences/${id}/renouveler`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function toggleRenouvellementAuto(id: number, activer: boolean) {
  return request<{ message: string }>(`/m15/licences/${id}/renouvellement-auto`, {
    method: "PUT",
    body: JSON.stringify({ activer }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatFcfa(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("fr-FR") + " FCFA";
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

export function statutColor(s: string | undefined | null): string {
  switch (s) {
    case "active": return "bg-green-100 text-green-800";
    case "trial": return "bg-yellow-100 text-yellow-800";
    case "suspendue": return "bg-red-100 text-red-800";
    case "expiree": return "bg-gray-200 text-gray-600";
    case "supprimee": return "bg-gray-100 text-gray-400";
    default: return "bg-blue-100 text-blue-700";
  }
}

export function joursColor(j: number | null | undefined): string {
  if (j === null || j === undefined) return "text-gray-400";
  if (j <= 0) return "text-red-600 font-bold";
  if (j <= 30) return "text-red-500 font-semibold";
  if (j <= 60) return "text-orange-500";
  return "text-green-600";
}
