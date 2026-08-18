import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, Search, Phone, MapPin, Wallet, PlusCircle, X,
  ChevronRight, AlertCircle, CalendarDays,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}

interface MembreDelegue {
  id: number;
  nom: string;
  prenoms: string | null;
  telephone: string;
  section: string | null;
  village: string | null;
  categorieMembre: string | null;
  statutMembre: string;
  numeroMembre: number;
}

interface Avance {
  id: number;
  membreId: number;
  montantOctroyeFcfa: number;
  soldeRestantFcfa: number;
  statut: "en_cours" | "rembourse" | "en_retard";
  dateOctroi: string;
  motif: string | null;
}

function formaterMontant(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DeleguesLocalitesPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const peutOctroyer = usePermission("avances", "octroyer");

  const [search, setSearch] = useState("");
  const [modalMembre, setModalMembre] = useState<MembreDelegue | null>(null);
  const [showOctroi, setShowOctroi] = useState(false);
  const [formOctroi, setFormOctroi] = useState({ montant: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
  const [errOctroi, setErrOctroi] = useState("");

  // ── Membres délégués de localités ─────────────────────────────────────────
  const { data: result, isLoading } = useQuery<{ membres: MembreDelegue[]; total: number }>({
    queryKey: ["delegues-localites"],
    queryFn: () => apiFetch(`/api/membres?categorie_membre=d%C3%A9l%C3%A9gu%C3%A9+de+localit%C3%A9s&limit=200&statut_membre=actif`),
    staleTime: 30_000,
  });

  const membres = result?.membres ?? [];

  // ── Avances en cours (toutes, filtrées côté client par membreId) ──────────
  const { data: toutesAvances = [] } = useQuery<Avance[]>({
    queryKey: ["avances-delegues-localites"],
    queryFn: () => apiFetch(`/api/avances`),
    staleTime: 30_000,
  });

  const avancesParMembre = new Map<number, Avance[]>();
  for (const a of toutesAvances) {
    if (!avancesParMembre.has(a.membreId)) avancesParMembre.set(a.membreId, []);
    avancesParMembre.get(a.membreId)!.push(a);
  }

  function soldeAvances(membreId: number): number {
    return (avancesParMembre.get(membreId) ?? [])
      .filter(a => a.statut !== "rembourse")
      .reduce((s, a) => s + a.soldeRestantFcfa, 0);
  }

  // ── Avances du membre sélectionné ────────────────────────────────────────
  const { data: avancesModal = [], isLoading: loadAvances } = useQuery<Avance[]>({
    queryKey: ["avances-membre", modalMembre?.id],
    queryFn: () => apiFetch(`/api/avances?membre_id=${modalMembre!.id}`),
    enabled: !!modalMembre,
    staleTime: 0,
  });

  // ── Octroyer avance ───────────────────────────────────────────────────────
  const mutOctroyer = useMutation({
    mutationFn: () => apiPost("/api/avances", {
      membreId: modalMembre!.id,
      montantOctroyeFcfa: parseInt(formOctroi.montant),
      dateOctroi: formOctroi.dateOctroi,
      dateEcheance: formOctroi.dateEcheance || undefined,
      motif: formOctroi.motif || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avances-membre", modalMembre?.id] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      setShowOctroi(false);
      setFormOctroi({ montant: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
      setErrOctroi("");
    },
    onError: (e: Error) => setErrOctroi(e.message),
  });

  // ── Filtrage local ────────────────────────────────────────────────────────
  const filtres = membres.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.nom.toLowerCase().includes(q) ||
      (m.prenoms ?? "").toLowerCase().includes(q) ||
      m.telephone.includes(q) ||
      (m.section ?? "").toLowerCase().includes(q) ||
      (m.village ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Délégués de localités</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Membres de catégorie "Délégué de localités" — {result?.total ?? 0} au total
          </p>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Nom, téléphone, section, village…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a4731] focus:border-[#1a4731]"
        />
      </div>

      {/* Liste */}
      {isLoading ? (
        <TableSkeleton />
      ) : filtres.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icone={Users}
            titre={search ? "Aucun résultat" : "Aucun délégué de localités"}
            description={
              search
                ? "Modifiez votre recherche."
                : "Créez des membres avec la catégorie \"Délégué de localités\" depuis la page Membres."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtres.map(m => {
            const solde = soldeAvances(m.id);
            const avancesM = avancesParMembre.get(m.id) ?? [];
            const enRetard = avancesM.some(a => a.statut === "en_retard");
            return (
              <div
                key={m.id}
                className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setModalMembre(m)}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#1a4731]/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-[#1a4731]">
                    {(m.prenoms ?? m.nom).charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">
                      {m.prenoms} {m.nom}
                    </p>
                    {enRetard && (
                      <AlertCircle size={13} className="text-red-500 shrink-0" />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Phone size={10} /> {m.telephone}
                    </span>
                    {(m.section || m.village) && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin size={10} /> {m.section ?? m.village}
                      </span>
                    )}
                  </div>

                  {solde > 0 && (
                    <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      enRetard ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                    }`}>
                      <Wallet size={10} />
                      {formaterMontant(solde)} d'avances
                    </div>
                  )}
                </div>

                <ChevronRight size={15} className="text-gray-300 shrink-0 mt-1" />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal membre ───────────────────────────────────────────────────── */}
      {modalMembre && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="font-bold text-gray-900">{modalMembre.prenoms} {modalMembre.nom}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalMembre.telephone}
                  {modalMembre.section && ` · ${modalMembre.section}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setLocation(`/membres/${modalMembre.id}`); }}
                  className="text-xs text-[#1a4731] font-medium hover:underline"
                >
                  Fiche complète
                </button>
                <button
                  onClick={() => { setModalMembre(null); setShowOctroi(false); setErrOctroi(""); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Avances */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Avances</p>
                {peutOctroyer && !showOctroi && (
                  <button
                    onClick={() => setShowOctroi(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#1a4731] hover:underline"
                  >
                    <PlusCircle size={13} /> Octroyer
                  </button>
                )}
              </div>

              {/* Formulaire octroi */}
              {showOctroi && (
                <div className="border border-[#1a4731]/20 rounded-xl p-4 space-y-3 bg-green-50/30">
                  <p className="text-xs font-semibold text-[#1a4731]">Nouvelle avance</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Montant (FCFA) *</label>
                      <input
                        type="number"
                        value={formOctroi.montant}
                        onChange={e => setFormOctroi(f => ({ ...f, montant: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                        placeholder="50 000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Date d'octroi *</label>
                      <input
                        type="date"
                        value={formOctroi.dateOctroi}
                        onChange={e => setFormOctroi(f => ({ ...f, dateOctroi: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Échéance</label>
                    <input
                      type="date"
                      value={formOctroi.dateEcheance}
                      onChange={e => setFormOctroi(f => ({ ...f, dateEcheance: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Motif</label>
                    <input
                      type="text"
                      value={formOctroi.motif}
                      onChange={e => setFormOctroi(f => ({ ...f, motif: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      placeholder="Achat d'intrants, frais de déplacement…"
                    />
                  </div>
                  {errOctroi && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {errOctroi}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => mutOctroyer.mutate()}
                      disabled={!formOctroi.montant || mutOctroyer.isPending}
                      className="flex-1 bg-[#1a4731] text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
                    >
                      {mutOctroyer.isPending ? "Enregistrement…" : "Confirmer"}
                    </button>
                    <button
                      onClick={() => { setShowOctroi(false); setErrOctroi(""); }}
                      className="px-4 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Liste des avances */}
              {loadAvances ? (
                <div className="text-sm text-center text-gray-400 py-4">Chargement…</div>
              ) : avancesModal.length === 0 ? (
                <div className="text-sm text-center text-gray-400 py-6">
                  Aucune avance enregistrée
                </div>
              ) : (
                <div className="space-y-2">
                  {avancesModal.map(a => {
                    const enCours = a.statut !== "rembourse";
                    return (
                      <div
                        key={a.id}
                        className={`rounded-xl border p-3 ${
                          a.statut === "en_retard"
                            ? "border-red-200 bg-red-50"
                            : a.statut === "rembourse"
                            ? "border-gray-100 bg-gray-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formaterMontant(a.montantOctroyeFcfa)}
                            </p>
                            {a.motif && (
                              <p className="text-xs text-gray-500 mt-0.5">{a.motif}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <CalendarDays size={10} /> {formaterDate(a.dateOctroi)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {enCours && (
                              <p className="text-xs font-semibold text-gray-700">
                                Solde : {formaterMontant(a.soldeRestantFcfa)}
                              </p>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              a.statut === "en_retard"
                                ? "bg-red-100 text-red-600"
                                : a.statut === "rembourse"
                                ? "bg-gray-100 text-gray-500"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
