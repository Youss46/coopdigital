import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BriefcaseBusiness, CalendarDays, Check, Clock3, FileText,
  History, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Upload, UserRound, Users,
  XCircle,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";
const token = () => localStorage.getItem("coop_token") ?? "";

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { erreur?: string } | null)?.erreur ?? `Erreur ${response.status}`);
  return response.json() as Promise<T>;
}

async function apiMutate<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { erreur?: string } | null)?.erreur ?? `Erreur ${response.status}`);
  return response.json() as Promise<T>;
}

async function apiUpload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("fichier", file);
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { erreur?: string } | null)?.erreur ?? `Erreur ${response.status}`);
  return response.json() as Promise<T>;
}

async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { erreur?: string } | null)?.erreur ?? `Erreur ${response.status}`);
  return response.json() as Promise<T>;
}

async function downloadRhFile(path: string, fileName: string) {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { erreur?: string } | null)?.erreur ?? `Erreur ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

type Personnel = {
  id: number; nom: string; prenoms: string; poste: string; roleSysteme: string | null;
  userId: number | null; dateEmbauche: string; dateFinContrat: string | null;
  dateNaissance: string | null; adresse: string | null; contactUrgenceNom: string | null;
  contactUrgenceTelephone: string | null; numeroCnps: string | null; numeroCni: string | null;
  statut: "actif" | "suspendu" | "sorti";
};
type UserOption = { id: number; nom: string; prenoms: string; email: string; role: string; actif: boolean };
type RhHistoryEntry = {
  id: number;
  personnelId: number | null;
  entite: string;
  entiteId: number | null;
  action: string;
  details: Record<string, unknown> | null;
  faitPar: number | null;
  faitParNom: string | null;
  faitParPrenoms: string | null;
  faitParEmail: string | null;
  createdAt: string;
};
type PersonnelDetails = { historique: RhHistoryEntry[] };
type Dashboard = {
  effectif: { total: number; actifs: number; suspendus: number; sortis: number };
  mouvements: { embauches30J: number; finsContrat60J: number };
  conges: { demandes: number; approuvesAnnee: number; soldeReference: number };
  absences: { enAttente: number; joursAnnee: number };
  echeances: { id: number; nature: string; personnelId: number; date: string; titre: string; urgent: boolean }[];
};
type Contract = { id: number; personnelId: number; personnelNom: string; poste: string; type: string; reference: string | null; dateDebut: string; dateFin: string | null; dateSignature: string | null; statut: string; notes: string | null };
type Document = { id: number; personnelId: number; personnelNom: string; type: string; titre: string; reference: string | null; dateDocument: string | null; dateExpiration: string | null; url: string | null; notes: string | null; pieceJointe: { nom: string; typeMime: string; taille: number; url: string } | null };
type Leave = { id: number; personnelId: number; personnelNom: string; poste: string; type: string; dateDebut: string; dateFin: string; jours: number; motif: string | null; statut: string; solde?: { entitlement: number; used: number; remaining: number } };
type Absence = { id: number; personnelId: number; personnelNom: string; poste: string; type: string; dateDebut: string; dateFin: string; jours: number; motif: string | null; justificatifUrl: string | null; statut: string };

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(value: string) {
  return ({ actif: "Actif", suspendu: "Suspendu", sorti: "Sorti", demande: "En attente", approuve: "Approuvé", refuse: "Refusé", signalee: "À valider", validee: "Validée", refusee: "Refusée", resilie: "Résilié", expire: "Expiré" } as Record<string, string>)[value] ?? value;
}

function StatusBadge({ value }: { value: string }) {
  const color = ["actif", "approuve", "validee"].includes(value) ? "bg-emerald-100 text-emerald-700" : ["demande", "signalee"].includes(value) ? "bg-amber-100 text-amber-700" : ["sorti", "refuse", "refusee", "expire", "resilie"].includes(value) ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{statusLabel(value)}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-sm"><span className="font-medium text-slate-600">{label}</span>{children}</label>;
}

function StatCard({ label, value, detail, icon: Icon, tone = "emerald" }: { label: string; value: number | string; detail: string; icon: typeof Users; tone?: "emerald" | "amber" | "blue" | "rose" }) {
  const tones = { emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", rose: "bg-rose-50 text-rose-700" };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><div className={`rounded-lg p-2 ${tones[tone]}`}><Icon size={19} /></div></div></div>;
}

function useRhMutation(path: string, method: "POST" | "PUT", onDone: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: unknown) => apiMutate(path, method, body),
    onSuccess: () => { onDone(); toast({ title: "Modification enregistrée" }); },
    onError: (error: Error) => toast({ title: "Opération impossible", description: error.message, variant: "destructive" }),
  });
}

export default function RessourcesHumainesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"dashboard" | "dossiers" | "contrats" | "conges">("dashboard");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const canEdit = usePermission("rh", "modifier_dossier");
  const canContracts = usePermission("rh", "gerer_contrats");
  const canDocuments = usePermission("rh", "gerer_documents");
  const canRequestLeave = usePermission("rh", "demander_conge");
  const canApproveLeave = usePermission("rh", "valider_conge");
  const canAbsences = usePermission("rh", "gerer_absences");

  const dashboard = useQuery({ queryKey: ["rh-dashboard"], queryFn: () => apiFetch<Dashboard>("/api/rh/dashboard") });
  const personnel = useQuery({ queryKey: ["rh-personnel"], queryFn: () => apiFetch<Personnel[]>("/api/rh/personnel") });
  const users = useQuery({ queryKey: ["rh-users"], queryFn: () => apiFetch<UserOption[]>("/api/rh/utilisateurs") });
  const contracts = useQuery({ queryKey: ["rh-contracts"], queryFn: () => apiFetch<Contract[]>("/api/rh/contrats") });
  const documents = useQuery({ queryKey: ["rh-documents"], queryFn: () => apiFetch<Document[]>("/api/rh/documents") });
  const leaves = useQuery({ queryKey: ["rh-leaves"], queryFn: () => apiFetch<Leave[]>("/api/rh/conges") });
  const absences = useQuery({ queryKey: ["rh-absences"], queryFn: () => apiFetch<Absence[]>("/api/rh/absences") });
  const personnelDetails = useQuery({
    queryKey: ["rh-personnel-detail", selectedId],
    queryFn: () => apiFetch<PersonnelDetails>(`/api/rh/personnel/${selectedId}`),
    enabled: selectedId !== null,
  });
  const selected = personnel.data?.find((person) => person.id === selectedId) ?? null;

  function refresh() {
    void Promise.all([dashboard.refetch(), personnel.refetch(), contracts.refetch(), documents.refetch(), leaves.refetch(), absences.refetch()]);
  }
  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["rh"] });
    refresh();
  }

  const tabs = [
    ["dashboard", "Tableau de bord", ShieldCheck],
    ["dossiers", "Dossiers du personnel", Users],
    ["contrats", "Contrats & documents", FileText],
    ["conges", "Congés & absences", CalendarDays],
  ] as const;

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-700 p-3 text-white"><Users size={22} /></div><div><h1 className="text-2xl font-bold text-slate-900">Ressources humaines</h1><p className="text-sm text-slate-500">Dossiers, contrats, congés et suivi administratif</p></div></div>
      <button className={`${buttonClass} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`} onClick={refresh}><RefreshCw size={15} />Actualiser</button>
    </div>
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
      {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={16} />{label}</button>)}
    </div>

    {tab === "dashboard" && <DashboardTab data={dashboard.data} isLoading={dashboard.isLoading} personnel={personnel.data ?? []} onGo={(next) => setTab(next)} />}
    {tab === "dossiers" && <DossiersTab personnel={personnel.data ?? []} users={users.data ?? []} selected={selected} selectedId={selectedId} onSelect={setSelectedId} canEdit={canEdit} onSaved={invalidate} history={personnelDetails.data?.historique ?? []} historyLoading={personnelDetails.isLoading} />}
    {tab === "contrats" && <ContractsTab personnel={personnel.data ?? []} contracts={contracts.data ?? []} documents={documents.data ?? []} canContracts={canContracts} canDocuments={canDocuments} onSaved={invalidate} onDownloaded={() => void qc.invalidateQueries({ queryKey: ["rh-personnel-detail"] })} />}
    {tab === "conges" && <LeaveTab personnel={personnel.data ?? []} leaves={leaves.data ?? []} absences={absences.data ?? []} canRequestLeave={canRequestLeave} canApproveLeave={canApproveLeave} canAbsences={canAbsences} onSaved={invalidate} />}
  </div>;
}

function DashboardTab({ data, isLoading, personnel, onGo }: { data?: Dashboard; isLoading: boolean; personnel: Personnel[]; onGo: (tab: "dossiers" | "contrats" | "conges") => void }) {
  if (isLoading || !data) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Chargement du tableau de bord RH…</div>;
  const nameById = new Map(personnel.map((person) => [person.id, `${person.nom} ${person.prenoms}`]));
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Effectif actif" value={data.effectif.actifs} detail={`${data.effectif.total} dossier${data.effectif.total > 1 ? "s" : ""} au total`} icon={Users} />
      <StatCard label="Mouvements récents" value={data.mouvements.embauches30J} detail="embauches sur 30 jours" icon={BriefcaseBusiness} tone="blue" />
      <StatCard label="Congés à traiter" value={data.conges.demandes} detail={`${data.conges.approuvesAnnee} jours approuvés cette année`} icon={CalendarDays} tone="amber" />
      <StatCard label="Absences à valider" value={data.absences.enAttente} detail={`${data.absences.joursAnnee} jours cette année`} icon={Clock3} tone="rose" />
    </div>
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Échéances à surveiller</h2><p className="text-xs text-slate-500">Contrats et documents expirés ou arrivant à échéance sous 60 jours</p></div><AlertTriangle className="text-amber-500" size={19} /></div>
        {data.echeances.length === 0 ? <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">Aucune échéance à signaler.</p> : <div className="divide-y divide-slate-100">{data.echeances.slice(0, 8).map((item) => <div key={`${item.nature}-${item.id}`} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-slate-800">{item.titre}</p><p className="text-xs text-slate-500">{nameById.get(item.personnelId) ?? "Personnel"} · {dateLabel(item.date)}</p></div><span className={`text-xs font-semibold ${item.urgent ? "text-red-600" : "text-amber-600"}`}>{item.urgent ? "En retard" : "À prévoir"}</span></div>)}</div>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Répartition des dossiers</h2><div className="mt-5 space-y-4">{[["Actifs", data.effectif.actifs, "bg-emerald-500"], ["Suspendus", data.effectif.suspendus, "bg-amber-400"], ["Sortis", data.effectif.sortis, "bg-slate-400"]].map(([label, count, color]) => <div key={String(label)}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{label}</span><strong>{count}</strong></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${color}`} style={{ width: `${data.effectif.total ? (Number(count) / data.effectif.total) * 100 : 0}%` }} /></div></div>)}</div><div className="mt-6 grid grid-cols-2 gap-2"><button className={`${buttonClass} bg-emerald-700 text-white`} onClick={() => onGo("dossiers")}>Voir les dossiers</button><button className={`${buttonClass} border border-slate-200 text-slate-600`} onClick={() => onGo("conges")}>Suivre les congés</button></div></section>
    </div>
  </div>;
}

function DossiersTab({ personnel, users, selected, selectedId, onSelect, canEdit, onSaved, history, historyLoading }: {
  personnel: Personnel[];
  users: UserOption[];
  selected: Personnel | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  canEdit: boolean;
  onSaved: () => void;
  history: RhHistoryEntry[];
  historyLoading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Partial<Personnel>>({});
  const update = useRhMutation(`/api/rh/personnel/${selectedId ?? 0}`, "PUT", onSaved);
  const filtered = useMemo(() => personnel.filter((person) => `${person.nom} ${person.prenoms} ${person.poste}`.toLowerCase().includes(search.toLowerCase())), [personnel, search]);
  function select(person: Personnel) { onSelect(person.id); setDraft({ ...person }); }
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Dossiers existants</h2><p className="text-xs text-slate-500">La création du personnel reste dans le module Salaires.</p></div><input className={`${inputClass} sm:max-w-xs`} placeholder="Rechercher…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="divide-y divide-slate-100">{filtered.map((person) => <button key={person.id} onClick={() => select(person)} className={`flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 ${selectedId === person.id ? "bg-emerald-50" : ""}`}><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">{person.nom[0]}{person.prenoms[0]}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{person.nom} {person.prenoms}</p><p className="truncate text-xs text-slate-500">{person.poste} · depuis {dateLabel(person.dateEmbauche)}</p></div></div><StatusBadge value={person.statut} /></button>)}{filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Aucun dossier trouvé.</p>}</div></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{!selected ? <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-slate-400"><UserRound size={32} /><p className="mt-2 text-sm">Sélectionnez un dossier pour consulter ses informations administratives.</p></div> : <><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{selected.nom} {selected.prenoms}</h2><p className="text-xs text-slate-500">Informations administratives, sans données de paie</p></div><Pencil size={16} className="text-slate-400" /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nom"><input className={inputClass} disabled={!canEdit} value={String(draft.nom ?? "")} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} /></Field><Field label="Prénoms"><input className={inputClass} disabled={!canEdit} value={String(draft.prenoms ?? "")} onChange={(e) => setDraft({ ...draft, prenoms: e.target.value })} /></Field><Field label="Poste"><input className={inputClass} disabled={!canEdit} value={String(draft.poste ?? "")} onChange={(e) => setDraft({ ...draft, poste: e.target.value })} /></Field><Field label="Rôle / fonction"><input className={inputClass} disabled={!canEdit} value={String(draft.roleSysteme ?? "")} onChange={(e) => setDraft({ ...draft, roleSysteme: e.target.value })} /></Field><Field label="Compte utilisateur associé"><select className={inputClass} disabled={!canEdit} value={draft.userId ? String(draft.userId) : ""} onChange={(e) => setDraft({ ...draft, userId: e.target.value ? Number(e.target.value) : null })}><option value="">Aucun compte associé</option>{users.filter((user) => user.actif || user.id === selected.userId).map((user) => <option key={user.id} value={user.id}>{user.nom} {user.prenoms} · {user.email}</option>)}</select></Field><Field label="Date de naissance"><input type="date" className={inputClass} disabled={!canEdit} value={String(draft.dateNaissance ?? "")} onChange={(e) => setDraft({ ...draft, dateNaissance: e.target.value })} /></Field><Field label="N° CNPS"><input className={inputClass} disabled={!canEdit} value={String(draft.numeroCnps ?? "")} onChange={(e) => setDraft({ ...draft, numeroCnps: e.target.value })} /></Field><Field label="N° CNI"><input className={inputClass} disabled={!canEdit} value={String(draft.numeroCni ?? "")} onChange={(e) => setDraft({ ...draft, numeroCni: e.target.value })} /></Field><Field label="Statut"><select className={inputClass} disabled={!canEdit} value={String(draft.statut ?? "actif")} onChange={(e) => setDraft({ ...draft, statut: e.target.value as Personnel["statut"] })}><option value="actif">Actif</option><option value="suspendu">Suspendu</option><option value="sorti">Sorti</option></select></Field><Field label="Adresse"><input className={inputClass} disabled={!canEdit} value={String(draft.adresse ?? "")} onChange={(e) => setDraft({ ...draft, adresse: e.target.value })} /></Field><Field label="Contact d'urgence"><input className={inputClass} disabled={!canEdit} value={String(draft.contactUrgenceNom ?? "")} onChange={(e) => setDraft({ ...draft, contactUrgenceNom: e.target.value })} /></Field><Field label="Téléphone urgence"><input className={inputClass} disabled={!canEdit} value={String(draft.contactUrgenceTelephone ?? "")} onChange={(e) => setDraft({ ...draft, contactUrgenceTelephone: e.target.value })} /></Field></div>{canEdit && <button className={`${buttonClass} mt-5 w-full bg-emerald-700 text-white hover:bg-emerald-800`} disabled={update.isPending} onClick={() => update.mutate(draft)}><Check size={16} />Enregistrer le dossier</button>}<RhHistoryPanel entries={history} isLoading={historyLoading} /></>}</section>
  </div>;
}

function historyActionLabel(action: string) {
  return ({
    creation: "Création",
    modification: "Modification",
    remplacement_fichier: "Remplacement d’une pièce jointe",
    ajout_fichier: "Ajout d’une pièce jointe",
    suppression_fichier: "Suppression d’une pièce jointe",
    consultation_fichier: "Téléchargement d’une pièce jointe",
  } as Record<string, string>)[action] ?? action;
}

function RhHistoryPanel({ entries, isLoading }: { entries: RhHistoryEntry[]; isLoading: boolean }) {
  const [filter, setFilter] = useState<"tous" | "consultations">("tous");
  const visibleEntries = filter === "consultations"
    ? entries.filter((entry) => entry.action === "consultation_fichier")
    : entries;

  return <div className="mt-6 border-t border-slate-100 pt-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History size={16} />Historique du dossier</h3>
        <p className="text-xs text-slate-500">Les téléchargements de justificatifs sont tracés avec leur utilisateur et leur date.</p>
      </div>
      <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" value={filter} onChange={(event) => setFilter(event.target.value as "tous" | "consultations")}>
        <option value="tous">Toutes les actions</option>
        <option value="consultations">Téléchargements uniquement</option>
      </select>
    </div>
    {isLoading ? <p className="py-4 text-center text-sm text-slate-500">Chargement de l’historique…</p>
      : visibleEntries.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">{filter === "consultations" ? "Aucun téléchargement enregistré." : "Aucune action enregistrée."}</p>
        : <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
          {visibleEntries.map((entry) => {
            const actor = [entry.faitParNom, entry.faitParPrenoms].filter(Boolean).join(" ") || (entry.faitPar ? `Compte #${entry.faitPar}` : "Système");
            const documentName = typeof entry.details?.nom === "string" ? entry.details.nom : null;
            return <div key={entry.id} className="p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{historyActionLabel(entry.action)}</span>
                <time className="text-slate-500" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("fr-FR")}</time>
              </div>
              <div className="mt-1 text-slate-500">{actor}{documentName ? ` · ${documentName}` : ""}{entry.faitParEmail ? ` · ${entry.faitParEmail}` : ""}</div>
            </div>;
          })}
        </div>}
  </div>;
}

function ContractsTab({ personnel, contracts, documents, canContracts, canDocuments, onSaved, onDownloaded }: { personnel: Personnel[]; contracts: Contract[]; documents: Document[]; canContracts: boolean; canDocuments: boolean; onSaved: () => void; onDownloaded: () => void }) {
  const { toast } = useToast();
  const [section, setSection] = useState<"contrats" | "documents">("contrats");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ personnelId: "", type: "cdi", titre: "", dateDebut: "", dateFin: "", dateExpiration: "", reference: "", url: "", notes: "" });
  const contractMut = useRhMutation("/api/rh/contrats", "POST", () => { setShowForm(false); onSaved(); });
  const documentMut = useRhMutation("/api/rh/documents", "POST", () => { setShowForm(false); onSaved(); });
  const uploadFile = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => apiUpload<Document>(`/api/rh/documents/${id}/fichier`, file),
    onSuccess: () => { toast({ title: "Pièce jointe enregistrée" }); onSaved(); },
    onError: (error: Error) => toast({ title: "Dépôt impossible", description: error.message, variant: "destructive" }),
  });
  const deleteFile = useMutation({
    mutationFn: (id: number) => apiDelete<Document>(`/api/rh/documents/${id}/fichier`),
    onSuccess: () => { toast({ title: "Pièce jointe retirée" }); onSaved(); },
    onError: (error: Error) => toast({ title: "Retrait impossible", description: error.message, variant: "destructive" }),
  });
  const canCreate = section === "contrats" ? canContracts : canDocuments;
  function update(key: string, value: string) { setForm({ ...form, [key]: value }); }
  function fileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex gap-2">
        <button className={`${buttonClass} ${section === "contrats" ? "bg-emerald-700 text-white" : "border border-slate-200 text-slate-600"}`} onClick={() => setSection("contrats")}><BriefcaseBusiness size={16} />Contrats</button>
        <button className={`${buttonClass} ${section === "documents" ? "bg-emerald-700 text-white" : "border border-slate-200 text-slate-600"}`} onClick={() => setSection("documents")}><FileText size={16} />Documents</button>
      </div>
      {canCreate && <button className={`${buttonClass} bg-emerald-700 text-white`} onClick={() => setShowForm(!showForm)}><Plus size={16} />Ajouter</button>}
    </div>
    {showForm && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Personnel"><select className={inputClass} value={form.personnelId} onChange={(e) => update("personnelId", e.target.value)}><option value="">Sélectionner…</option>{personnel.filter((p) => p.statut !== "sorti").map((p) => <option key={p.id} value={p.id}>{p.nom} {p.prenoms}</option>)}</select></Field>
        {section === "contrats" ? <><Field label="Type"><select className={inputClass} value={form.type} onChange={(e) => update("type", e.target.value)}><option value="cdi">CDI</option><option value="cdd">CDD</option><option value="journalier">Journalier</option><option value="stagiaire">Stagiaire</option></select></Field><Field label="Début"><input type="date" className={inputClass} value={form.dateDebut} onChange={(e) => update("dateDebut", e.target.value)} /></Field><Field label="Fin (facultatif)"><input type="date" className={inputClass} value={form.dateFin} onChange={(e) => update("dateFin", e.target.value)} /></Field></> : <><Field label="Type"><select className={inputClass} value={form.type} onChange={(e) => update("type", e.target.value)}><option value="cni">CNI</option><option value="cnps">Attestation CNPS</option><option value="diplome">Diplôme</option><option value="medical">Certificat médical</option><option value="autre">Autre</option></select></Field><Field label="Titre"><input className={inputClass} value={form.titre} onChange={(e) => update("titre", e.target.value)} /></Field><Field label="Expiration"><input type="date" className={inputClass} value={form.dateExpiration} onChange={(e) => update("dateExpiration", e.target.value)} /></Field></>}
      </div>
      {section === "documents" && <p className="mt-3 text-xs text-slate-600">Vous pourrez joindre le fichier juste après la création du document. Formats acceptés : PDF, JPG, PNG, WEBP, DOC ou DOCX, 10 Mo maximum.</p>}
      <div className="mt-3 flex justify-end gap-2"><button className={`${buttonClass} border border-slate-200 bg-white text-slate-600`} onClick={() => setShowForm(false)}>Annuler</button><button className={`${buttonClass} bg-emerald-700 text-white`} disabled={!form.personnelId || (section === "contrats" ? !form.dateDebut : !form.titre) || contractMut.isPending || documentMut.isPending} onClick={() => section === "contrats" ? contractMut.mutate({ personnelId: Number(form.personnelId), type: form.type, dateDebut: form.dateDebut, dateFin: form.dateFin || null, reference: form.reference || null, notes: form.notes || null }) : documentMut.mutate({ personnelId: Number(form.personnelId), type: form.type, titre: form.titre, dateExpiration: form.dateExpiration || null, reference: form.reference || null, url: form.url || null, notes: form.notes || null })}><Check size={16} />Enregistrer</button></div>
    </div>}
    {section === "contrats" ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Personnel</th><th className="p-3">Type</th><th className="p-3">Période</th><th className="p-3">Statut</th><th className="p-3">Référence</th></tr></thead><tbody className="divide-y divide-slate-100">{contracts.map((row) => <tr key={row.id}><td className="p-3 font-medium text-slate-800">{row.personnelNom}<div className="text-xs font-normal text-slate-500">{row.poste}</div></td><td className="p-3">{row.type.toUpperCase()}</td><td className="p-3">{dateLabel(row.dateDebut)} → {dateLabel(row.dateFin)}</td><td className="p-3"><StatusBadge value={row.statut} /></td><td className="p-3 text-slate-500">{row.reference ?? "—"}</td></tr>)}</tbody></table>{contracts.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Aucun contrat suivi.</p>}</div> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Personnel</th><th className="p-3">Document</th><th className="p-3">Date</th><th className="p-3">Expiration</th><th className="p-3">Pièce jointe</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{documents.map((row) => <tr key={row.id}><td className="p-3 font-medium text-slate-800">{row.personnelNom}</td><td className="p-3">{row.titre}<div className="text-xs text-slate-500">{row.type}</div></td><td className="p-3">{dateLabel(row.dateDocument)}</td><td className={`p-3 ${row.dateExpiration && row.dateExpiration < new Date().toISOString().slice(0, 10) ? "font-semibold text-red-600" : "text-slate-600"}`}>{dateLabel(row.dateExpiration)}</td><td className="p-3">{row.pieceJointe ? <button className="text-left text-emerald-700 hover:underline" onClick={() => void downloadRhFile(row.pieceJointe!.url, row.pieceJointe!.nom).then(onDownloaded).catch((error: Error) => toast({ title: "Téléchargement impossible", description: error.message, variant: "destructive" }))}><span className="block max-w-[190px] truncate font-medium">{row.pieceJointe.nom}</span><span className="text-xs text-slate-500">{fileSize(row.pieceJointe.taille)}</span></button> : <span className="text-slate-400">Aucune pièce</span>}</td><td className="p-3"><div className="flex items-center gap-2">{canDocuments && <><input id={`rh-file-${row.id}`} className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={uploadFile.isPending} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) uploadFile.mutate({ id: row.id, file }); }} /><label htmlFor={`rh-file-${row.id}`} className={`${buttonClass} cursor-pointer border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Upload size={15} />{row.pieceJointe ? "Remplacer" : "Joindre"}</label>{row.pieceJointe && <button className={`${buttonClass} border border-red-100 bg-red-50 px-2 text-red-700`} disabled={deleteFile.isPending} title="Retirer la pièce jointe" onClick={() => { if (window.confirm("Retirer cette pièce jointe ?")) deleteFile.mutate(row.id); }}><Trash2 size={15} /></button>}</>}</div></td></tr>)}</tbody></table>{documents.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Aucun document suivi.</p>}</div>}
  </div>;
}

function LeaveTab({ personnel, leaves, absences, canRequestLeave, canApproveLeave, canAbsences, onSaved }: { personnel: Personnel[]; leaves: Leave[]; absences: Absence[]; canRequestLeave: boolean; canApproveLeave: boolean; canAbsences: boolean; onSaved: () => void }) {
  const [section, setSection] = useState<"conges" | "absences">("conges");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ personnelId: "", type: "annuel", dateDebut: "", dateFin: "", motif: "" });
  const createLeave = useRhMutation("/api/rh/conges", "POST", () => { setShowForm(false); onSaved(); });
  const createAbsence = useRhMutation("/api/rh/absences", "POST", () => { setShowForm(false); onSaved(); });
  const decision = useMutation({ mutationFn: ({ id, decision }: { id: number; decision: "approuve" | "refuse" }) => apiMutate(`/api/rh/conges/${id}/decision`, "POST", { decision }), onSuccess: onSaved });
  const absenceDecision = useMutation({ mutationFn: ({ id, statut }: { id: number; statut: "validee" | "refusee" }) => apiMutate(`/api/rh/absences/${id}`, "PUT", { statut }), onSuccess: onSaved });
  const canCreate = section === "conges" ? canRequestLeave : canAbsences;
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex gap-2"><button className={`${buttonClass} ${section === "conges" ? "bg-emerald-700 text-white" : "border border-slate-200 text-slate-600"}`} onClick={() => setSection("conges")}><CalendarDays size={16} />Congés</button><button className={`${buttonClass} ${section === "absences" ? "bg-emerald-700 text-white" : "border border-slate-200 text-slate-600"}`} onClick={() => setSection("absences")}><Clock3 size={16} />Absences</button></div>{canCreate && <button className={`${buttonClass} bg-emerald-700 text-white`} onClick={() => setShowForm(!showForm)}><Plus size={16} />Saisir</button>}</div>
    {showForm && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Personnel"><select className={inputClass} value={form.personnelId} onChange={(e) => setForm({ ...form, personnelId: e.target.value })}><option value="">Sélectionner…</option>{personnel.filter((p) => p.statut === "actif").map((p) => <option key={p.id} value={p.id}>{p.nom} {p.prenoms}</option>)}</select></Field><Field label="Type"><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{section === "conges" ? <><option value="annuel">Congé annuel</option><option value="maladie">Maladie</option><option value="maternite">Maternité</option><option value="exceptionnel">Exceptionnel</option><option value="sans_solde">Sans solde</option></> : <><option value="justifiee">Justifiée</option><option value="maladie">Maladie</option><option value="injustifiee">Injustifiée</option><option value="retard">Retard</option></>}</select></Field><Field label="Du"><input type="date" className={inputClass} value={form.dateDebut} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} /></Field><Field label="Au"><input type="date" className={inputClass} value={form.dateFin} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} /></Field></div><div className="mt-3 flex gap-3"><Field label="Motif"><input className={inputClass} value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} /></Field><button className={`${buttonClass} self-end bg-emerald-700 text-white`} disabled={!form.personnelId || !form.dateDebut || !form.dateFin} onClick={() => section === "conges" ? createLeave.mutate(form) : createAbsence.mutate(form)}><Check size={16} />Enregistrer</button></div></div>}
    {section === "conges" ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Personnel</th><th className="p-3">Période</th><th className="p-3">Type</th><th className="p-3">Solde annuel</th><th className="p-3">État</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{leaves.map((row) => <tr key={row.id}><td className="p-3 font-medium text-slate-800">{row.personnelNom}<div className="text-xs font-normal text-slate-500">{row.poste}</div></td><td className="p-3">{dateLabel(row.dateDebut)} → {dateLabel(row.dateFin)}<div className="text-xs text-slate-500">{row.jours} jour{row.jours > 1 ? "s" : ""}</div></td><td className="p-3">{row.type}</td><td className="p-3 text-xs">{row.solde ? `${row.solde.remaining} / ${row.solde.entitlement} jours restants` : "—"}</td><td className="p-3"><StatusBadge value={row.statut} /></td><td className="p-3">{canApproveLeave && row.statut === "demande" && <div className="flex gap-1"><button title="Approuver" className="rounded-md bg-emerald-100 p-2 text-emerald-700" onClick={() => decision.mutate({ id: row.id, decision: "approuve" })}><Check size={15} /></button><button title="Refuser" className="rounded-md bg-red-100 p-2 text-red-700" onClick={() => decision.mutate({ id: row.id, decision: "refuse" })}><XCircle size={15} /></button></div>}</td></tr>)}</tbody></table>{leaves.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Aucune demande de congé.</p>}</div> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Personnel</th><th className="p-3">Période</th><th className="p-3">Type</th><th className="p-3">Motif</th><th className="p-3">État</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{absences.map((row) => <tr key={row.id}><td className="p-3 font-medium text-slate-800">{row.personnelNom}<div className="text-xs font-normal text-slate-500">{row.poste}</div></td><td className="p-3">{dateLabel(row.dateDebut)} → {dateLabel(row.dateFin)}<div className="text-xs text-slate-500">{row.jours} jour{row.jours > 1 ? "s" : ""}</div></td><td className="p-3">{row.type}</td><td className="p-3 text-slate-500">{row.motif ?? "—"}</td><td className="p-3"><StatusBadge value={row.statut} /></td><td className="p-3">{canAbsences && row.statut === "signalee" && <div className="flex gap-1"><button title="Valider" className="rounded-md bg-emerald-100 p-2 text-emerald-700" onClick={() => absenceDecision.mutate({ id: row.id, statut: "validee" })}><Check size={15} /></button><button title="Refuser" className="rounded-md bg-red-100 p-2 text-red-700" onClick={() => absenceDecision.mutate({ id: row.id, statut: "refusee" })}><XCircle size={15} /></button></div>}</td></tr>)}</tbody></table>{absences.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Aucune absence saisie.</p>}</div>}</div>;
}