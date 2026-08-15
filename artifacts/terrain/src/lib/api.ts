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
export function apiPut<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(data) });
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

export async function imprimerRecuLivraison(livraisonId: number): Promise<void> {
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

  // Ouvrir dans un iframe caché et déclencher l'impression directement
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;";
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // Nettoyage après un délai pour laisser le temps à la boîte d'impression
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60_000);
    }
  };
}

/** @deprecated Utiliser imprimerRecuLivraison */
export async function telechargerRecuLivraison(livraisonId: number): Promise<void> {
  return imprimerRecuLivraison(livraisonId);
}

export async function getHistoriqueAgent(): Promise<MissionTerrain[]> {
  return apiGet<MissionTerrain[]>("/agent/historique");
}

// ─── Missions d'enquête ────────────────────────────────────────────────────────

export async function getPeseurCollectes(): Promise<import("./types").PeseurCollecte[]> {
  return apiGet<import("./types").PeseurCollecte[]>("/peseur/collectes");
}

// ─── Sessions de pesée ─────────────────────────────────────────────────────────
const PESEE_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

async function apiPeseeFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${PESEE_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) { clearAuth(); window.location.href = `${import.meta.env.BASE_URL ?? "/"}login`; throw new Error("Session expirée"); }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur || `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Thrown when the API returns 409 — an `en_cours` session already exists for this member. */
export class SessionEnCoursError extends Error {
  constructor(public readonly sessionId: number, public readonly numeroSession: string) {
    super(`Une session en cours existe déjà pour ce membre (${numeroSession})`);
    this.name = "SessionEnCoursError";
  }
}

export async function createSessionPesee(data: {
  membreId?: number; produit?: string; operation?: string; notes?: string;
}): Promise<import("./types").SessionPesee> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${PESEE_BASE}/pesee/sessions`, {
    method: "POST",
    body: JSON.stringify(data),
    headers,
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({})) as {
      sessionId?: number;
      numeroSession?: string;
    };
    throw new SessionEnCoursError(body.sessionId!, body.numeroSession ?? "");
  }
  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
      window.location.href = `${import.meta.env.BASE_URL ?? "/"}login`;
      throw new Error("Session expirée");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur || `Erreur ${res.status}`);
  }
  return res.json();
}

export async function getSessionsEnCours(membreId?: number): Promise<import("./types").SessionPesee[]> {
  const q = membreId ? `?statut=en_cours&membreId=${membreId}` : "?statut=en_cours";
  return apiPeseeFetch(`/pesee/sessions${q}`);
}

/** Sessions clôturées sans livraison (terminee + livraisonId null) — le peseur peut encore les convertir. */
export async function getSessionsAConvertir(): Promise<import("./types").SessionPesee[]> {
  const sessions = await apiPeseeFetch<import("./types").SessionPesee[]>("/pesee/sessions?statut=terminee");
  return sessions.filter((s) => s.livraisonId === null);
}

export async function getSessionDetail(sessionId: number): Promise<import("./types").SessionDetail> {
  return apiPeseeFetch(`/pesee/sessions/${sessionId}`);
}

export async function addLignePesee(sessionId: number, data: {
  nbSacs: number; poidsBrutKg: number; tareKg?: number; notes?: string;
}): Promise<import("./types").SessionDetail> {
  const result = await apiPeseeFetch<{ ligne: import("./types").LignePesee; session: import("./types").SessionDetail }>(
    `/pesee/sessions/${sessionId}/lignes`,
    { method: "POST", body: JSON.stringify(data) },
  );
  return result.session;
}

export async function deleteLignePesee(sessionId: number, ligneId: number): Promise<import("./types").SessionDetail> {
  const result = await apiPeseeFetch<{ ok: boolean; session: import("./types").SessionDetail }>(
    `/pesee/sessions/${sessionId}/lignes/${ligneId}`,
    { method: "DELETE" },
  );
  return result.session;
}

export async function terminerSessionPesee(sessionId: number): Promise<import("./types").SessionDetail> {
  return apiPeseeFetch(`/pesee/sessions/${sessionId}/terminer`, { method: "PUT" });
}

export async function annulerSessionPesee(sessionId: number): Promise<void> {
  await apiPeseeFetch(`/pesee/sessions/${sessionId}/annuler`, { method: "PUT" });
}

export async function convertirSessionEnLivraison(
  sessionId: number,
  data: { modePaiement?: string } = {},
): Promise<import("./types").ConversionLivraisonResult> {
  const result = await apiPeseeFetch<{
    livraison: {
      id: number;
      poidsKg: string;
      prixUnitaireFcfa: number;
      montantBrutFcfa: number;
      avanceDeduiteFcfa: number;
      intrantsDeduitsFcfa: number;
      montantNetFcfa: number;
    };
    paiement: { modePaiement: string };
  }>(`/pesee/sessions/${sessionId}/livraison`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return {
    livraisonId: result.livraison.id,
    poidsKg: parseFloat(result.livraison.poidsKg),
    prixUnitaireFcfa: result.livraison.prixUnitaireFcfa,
    montantBrutFcfa: result.livraison.montantBrutFcfa,
    avanceDeduiteFcfa: result.livraison.avanceDeduiteFcfa,
    intrantsDeduitsFcfa: result.livraison.intrantsDeduitsFcfa,
    montantNetFcfa: result.livraison.montantNetFcfa,
    modePaiement: result.paiement.modePaiement,
  };
}

export async function getEnquetes(): Promise<import("./types").MissionEnquete[]> {
  return apiGet<import("./types").MissionEnquete[]>("/enquetes");
}

export async function getEnqueteDetail(id: number): Promise<import("./types").EnqueteDetail> {
  return apiGet<import("./types").EnqueteDetail>(`/enquetes/${id}`);
}
