const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

function getToken(): string | null {
  return localStorage.getItem("m15_token");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface TicketM15 {
  id: number;
  reference: string;
  titre: string;
  priorite: string;
  statut: string;
  categorie: string;
  module_concerne: string | null;
  assigne_m15: string | null;
  cooperative_id: number;
  cooperative_nom: string;
  ouvert_par_nom: string | null;
  created_at: string;
  nb_messages: number;
  nb_non_lus: number;
}

export interface MessageTicket {
  id: number;
  auteur_type: "client" | "m15tech";
  auteur_nom: string;
  contenu: string;
  piece_jointe_url?: string;
  lu: boolean;
  created_at: string;
}

export interface TicketDetailM15 extends TicketM15 {
  description: string;
  messages: MessageTicket[];
  date_resolution: string | null;
  satisfaction: number | null;
}

export async function fetchTickets(filters?: {
  priorite?: string;
  statut?: string;
  cooperative_id?: number;
}): Promise<TicketM15[]> {
  const params = new URLSearchParams();
  if (filters?.priorite)      params.set("priorite", filters.priorite);
  if (filters?.statut)        params.set("statut", filters.statut);
  if (filters?.cooperative_id) params.set("cooperative_id", String(filters.cooperative_id));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<TicketM15[]>(`/m15/support/tickets${qs}`);
}

export async function fetchTicketDetail(id: number): Promise<TicketDetailM15> {
  return request<TicketDetailM15>(`/m15/support/tickets/${id}`);
}

export async function prendreEnCharge(id: number): Promise<TicketDetailM15> {
  return request<TicketDetailM15>(`/m15/support/tickets/${id}/prendre`, { method: "PUT" });
}

export async function marquerResolu(id: number): Promise<TicketDetailM15> {
  return request<TicketDetailM15>(`/m15/support/tickets/${id}/resoudre`, { method: "PUT" });
}

export async function repondre(id: number, contenu: string): Promise<MessageTicket> {
  return request<MessageTicket>(`/m15/support/tickets/${id}/repondre`, {
    method: "POST",
    body: JSON.stringify({ contenu }),
  });
}

export const PRIORITE_COLORS: Record<string, string> = {
  urgente: "bg-red-100 text-red-700 border-red-200",
  haute:   "bg-orange-100 text-orange-700 border-orange-200",
  normale: "bg-blue-100 text-blue-700 border-blue-200",
  basse:   "bg-gray-100 text-gray-600 border-gray-200",
};

export const STATUT_COLORS: Record<string, string> = {
  ouvert:   "bg-blue-100 text-blue-700",
  en_cours: "bg-yellow-100 text-yellow-700",
  resolu:   "bg-green-100 text-green-700",
  ferme:    "bg-gray-100 text-gray-500",
};

export const STATUT_LABELS: Record<string, string> = {
  ouvert:   "Ouvert",
  en_cours: "En cours",
  resolu:   "Résolu",
  ferme:    "Fermé",
};

export const PRIORITE_LABELS: Record<string, string> = {
  basse:   "Basse",
  normale: "Normale",
  haute:   "Haute",
  urgente: "Urgente 🚨",
};
