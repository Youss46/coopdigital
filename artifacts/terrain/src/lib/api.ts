import { getToken } from "./auth";
import { queueOp, type PendingOpType } from "./idb";
import type { CollecteInput, PaiementInput, AvanceInput } from "./types";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/terrain`;

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur || `Erreur ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function loginTerrain(telephone: string, motDePasse: string) {
  return apiPost<{ token: string; agent: import("./types").AgentUser }>(
    "/auth/login",
    { telephone, motDePasse }
  );
}

export async function getProfil() {
  return apiGet<import("./types").AgentUser & {
    statsJour: import("./types").BilanJour;
    prixActuel: import("./types").PrixActuel;
  }>("/profil");
}

export async function getFournisseurs(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiGet<import("./types").Fournisseur[]>(`/fournisseurs${qs}`);
}

export async function getFournisseurRecap(id: number) {
  return apiGet<import("./types").FournisseurRecap>(`/fournisseur/${id}/recap`);
}

export async function getPrix() {
  return apiGet<import("./types").PrixActuel>("/prix");
}

export async function enregistrerCollecte(
  data: CollecteInput,
  online: boolean
) {
  if (!online) {
    await queueOp({ type: "collecte" as PendingOpType, data, localId: data.localId ?? crypto.randomUUID() });
    return null;
  }
  return apiPost<import("./types").CollecteResult>("/collecte", data);
}

export async function enregistrerPaiement(
  data: PaiementInput,
  online: boolean
) {
  if (!online) {
    await queueOp({ type: "paiement" as PendingOpType, data, localId: data.localId ?? crypto.randomUUID() });
    return null;
  }
  return apiPost<{ paiementId: number; ref: string }>("/paiement", data);
}

export async function octroierAvance(
  data: AvanceInput,
  online: boolean
) {
  if (!online) {
    await queueOp({ type: "avance" as PendingOpType, data, localId: data.localId ?? crypto.randomUUID() });
    return null;
  }
  return apiPost<{ avanceId: number }>("/avance", data);
}

export async function getBilan() {
  return apiGet<import("./types").BilanJour>("/bilan-jour");
}

export async function syncOps(operations: import("./types").PendingOp[]) {
  return apiPost<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }>(
    "/sync",
    { operations }
  );
}

export async function envoyerRapport() {
  return apiPost<{ message: string }>("/rapport-journalier", {});
}

export async function changerMotDePasse(motDePasseActuel: string, nouveauMotDePasse: string) {
  return apiPost<{ message: string }>("/auth/change-password", { motDePasseActuel, nouveauMotDePasse });
}
