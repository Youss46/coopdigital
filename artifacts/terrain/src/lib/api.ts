import { getToken, clearAuth } from "./auth";
import { queueOp, queueGpsOp, queueEnqueteOp, type PendingOpType, type GpsOp } from "./idb";
import type {
  CollecteInput, PaiementInput, AvanceInput,
  MissionTerrain, MissionDetail, StatsAgent, GpsCollecteInput, MessageMission, EnqueteOp,
} from "./types";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/terrain`;

async function apiFetch<T>(path: string, options: RequestInit = {}, skipSessionExpiry = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401 && !skipSessionExpiry) {
      clearAuth();
      window.location.href = `${import.meta.env.BASE_URL ?? "/"}login`;
      throw new Error("Session expirée");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur || `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> { return apiFetch<T>(path); }
export function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(data) });
}

export async function loginTerrain(telephone: string, motDePasse: string) {
  return apiFetch<{ token: string; agent: import("./types").AgentUser }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ telephone, motDePasse }) },
    true,
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

export async function enregistrerCollecte(data: CollecteInput, online: boolean) {
  if (!online) {
    await queueOp({ type: "collecte" as PendingOpType, data, localId: data.localId ?? crypto.randomUUID() });
    return null;
  }
  return apiPost<import("./types").CollecteResult>("/collecte", data);
}

export async function enregistrerPaiement(data: PaiementInput, online: boolean) {
  if (!online) {
    await queueOp({ type: "paiement" as PendingOpType, data, localId: data.localId ?? crypto.randomUUID() });
    return null;
  }
  return apiPost<{ paiementId: number; ref: string }>("/paiement", data);
}

export async function octroierAvance(data: AvanceInput, online: boolean) {
  if (!online) {
    await queueOp({ type: "avance" as PendingOpType, data, localId: data.localId ?? crypto.randomUUID() });
    return null;
  }
  return apiPost<{ avanceId: number }>("/avance", data);
}

export async function getBilan() { return apiGet<import("./types").BilanJour>("/bilan-jour"); }

export async function syncOps(operations: import("./types").PendingOp[]) {
  return apiPost<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }>(
    "/sync",
    { operations },
  );
}

export async function envoyerRapport() { return apiPost<{ message: string }>("/rapport-journalier", {}); }

export async function changerMotDePasse(nouveauMotDePasse: string) {
  return apiPost<{ message: string }>("/auth/change-password", { nouveauMotDePasse });
}

export async function getCaisse() { return apiGet<import("./types").CaisseDelegue>("/caisse"); }

export async function getMesCommissions(campagneId?: number) {
  const qs = campagneId ? `?campagneId=${campagneId}` : "";
  return apiGet<import("./types").CommissionResume>(`/mes-commissions${qs}`);
}

export async function telechargerReleveCommissions(campagneId?: number): Promise<void> {
  const token = getToken();
  const qs = campagneId ? `?campagneId=${campagneId}` : "";
  const res = await fetch(`${BASE}/commissions/releve${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur || `Erreur ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = campagneId ? `_campagne_${campagneId}` : "_toutes_campagnes";
  a.download = `releve_commissions${suffix}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

export async function getPaiementsDifferes() {
  return apiGet<import("./types").PaiementDiffere[]>("/paiements-differes");
}

export async function regulariserPaiement(livraisonId: number, modePaiement: string) {
  return apiPost<{ solde: number; montantPayeFcfa: number }>(`/regulariser/${livraisonId}`, { modePaiement });
}

// ── Agent terrain ────────────────────────────────────────────────────────────

export async function getMissions(): Promise<MissionTerrain[]> {
  return apiGet<MissionTerrain[]>("/missions");
}

export async function getMissionDetail(id: number): Promise<MissionDetail> {
  return apiGet<MissionDetail>(`/missions/${id}`);
}

export async function soumettresMission(id: number): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(`/missions/${id}/soumettre`, {});
}

export async function collecterParcelle(
  missionId: number,
  membreId: number,
  data: Omit<GpsCollecteInput, "missionId" | "membreId" | "localId">,
  online: boolean,
): Promise<{ ok: boolean } | null> {
  if (!online) {
    const localId = crypto.randomUUID();
    await queueGpsOp({ localId, missionId, membreId, data });
    return null;
  }
  return apiPost<{ ok: boolean }>(`/missions/${missionId}/parcelle/${membreId}`, data);
}

export async function syncGpsOps(ops: GpsOp[]): Promise<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }> {
  if (ops.length === 0) return { succes: [], echecs: [] };
  const operations = ops.map((op) => ({
    type: "gps_collecte",
    localId: op.localId,
    data: { missionId: op.missionId, membreId: op.membreId, ...op.data },
  }));
  return apiPost<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }>("/sync", { operations });
}

export async function soumettreEnqueteOffline(
  missionId: number,
  membreId: number,
  reponses: EnqueteOp["reponses"],
  notesAgent?: string,
): Promise<void> {
  await queueEnqueteOp({
    localId: crypto.randomUUID(),
    missionId,
    membreId,
    reponses,
    notesAgent,
  });
}

export async function syncEnqueteOps(
  ops: EnqueteOp[],
): Promise<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }> {
  if (ops.length === 0) return { succes: [], echecs: [] };
  const operations = ops.map((op) => ({
    localId: op.localId,
    missionId: op.missionId,
    membreId: op.membreId,
    reponses: op.reponses,
    notesAgent: op.notesAgent,
  }));
  return apiPost<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }>(
    "/enquetes/sync",
    { operations },
  );
}

export async function getMessages(missionId: number): Promise<MessageMission[]> {
  return apiGet<MessageMission[]>(`/messages/${missionId}`);
}

export async function sendMessage(missionId: number, message: string, type = "commentaire"): Promise<MessageMission> {
  return apiPost<MessageMission>(`/messages/${missionId}`, { message, type });
}

export async function getStatsAgent(): Promise<StatsAgent> {
  return apiGet<StatsAgent>("/agent/stats");
}

export async function telechargerRecuLivraison(livraisonId: number): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/recu/livraison/${livraisonId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur || `Erreur ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recu_livraison_${livraisonId}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

export async function getHistoriqueAgent(): Promise<MissionTerrain[]> {
  return apiGet<MissionTerrain[]>("/agent/historique");
}

// ─── Missions d'enquête ────────────────────────────────────────────────────────

export async function getPeseurCollectes(): Promise<import("./types").PeseurCollecte[]> {
  return apiGet<import("./types").PeseurCollecte[]>("/peseur/collectes");
}

export async function getEnquetes(): Promise<import("./types").MissionEnquete[]> {
  return apiGet<import("./types").MissionEnquete[]>("/enquetes");
}

export async function getEnqueteDetail(id: number): Promise<import("./types").EnqueteDetail> {
  return apiGet<import("./types").EnqueteDetail>(`/enquetes/${id}`);
}
