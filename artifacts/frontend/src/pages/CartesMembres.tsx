import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Download, Ban, CheckCircle2, Search,
  Loader2, Users, AlertCircle, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface CarteMembre {
  id: number;
  nom: string;
  prenoms: string;
  telephone: string;
  village: string | null;
  dateAdhesion: string;
  statut: string;
  photoUrl: string | null;
  carteStatut: string;
  carteNumero: string | null;
  carteGenereLe: string | null;
  carteSuspendueLe: string | null;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}/api${path}`, {
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

function codeMembre(id: number, dateAdhesion: string) {
  const year = new Date(dateAdhesion).getFullYear();
  return `MBR-${year}-${String(id).padStart(4, "0")}`;
}

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  non_emise: { label: "Non émise", cls: "bg-gray-100 text-gray-600" },
  active:    { label: "Active",    cls: "bg-green-100 text-green-700" },
  suspendue: { label: "Suspendue", cls: "bg-red-100 text-red-700" },
};

export default function CartesMembres() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "non_emise" | "active" | "suspendue">("tous");
  const [motifModal, setMotifModal] = useState<{ id: number; action: "suspendre" | "activer" } | null>(null);
  const [motif, setMotif] = useState("");

  const { data: cartes = [], isLoading, error } = useQuery<CarteMembre[]>({
    queryKey: ["cartes-membres"],
    queryFn: () => apiFetch<CarteMembre[]>("/membres/cartes"),
  });

  const mutation = useMutation({
    mutationFn: ({ id, action, motif }: { id: number; action: string; motif?: string }) =>
      apiFetch(`/membres/${id}/carte-statut`, {
        method: "PATCH",
        body: JSON.stringify({ action, motif }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cartes-membres"] });
      setMotifModal(null);
      setMotif("");
    },
  });

  const filtered = cartes.filter((c) => {
    const matchSearch =
      !search ||
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      c.prenoms.toLowerCase().includes(search.toLowerCase()) ||
      codeMembre(c.id, c.dateAdhesion).toLowerCase().includes(search.toLowerCase());
    const matchFiltre = filtre === "tous" || c.carteStatut === filtre;
    return matchSearch && matchFiltre;
  });

  const stats = {
    total: cartes.length,
    emises: cartes.filter((c) => c.carteStatut !== "non_emise").length,
    actives: cartes.filter((c) => c.carteStatut === "active").length,
    suspendues: cartes.filter((c) => c.carteStatut === "suspendue").length,
  };

  const token = localStorage.getItem("token") ?? "";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cartes Membres</h1>
          <p className="text-sm text-gray-500">Gérez et émettez les cartes d'adhérent</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total membres", value: stats.total, icon: Users, color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Cartes émises", value: stats.emises, icon: CreditCard, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Actives", value: stats.actives, icon: CheckCircle2, color: "text-green-700", bg: "bg-green-50" },
          { label: "Suspendues", value: stats.suspendues, icon: Ban, color: "text-red-700", bg: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.bg} border border-gray-100`}>
            <s.icon className={`w-5 h-5 mb-2 ${s.color}`} />
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres + recherche */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, prénom ou code membre…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["tous", "non_emise", "active", "suspendue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filtre === f
                  ? "bg-green-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "tous" ? "Tous" : STATUT_BADGE[f]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-green-600" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-12 text-red-500">
            <AlertCircle className="w-5 h-5" />
            <span>Erreur de chargement</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Aucun résultat</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Membre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Village</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Carte</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Émise le</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const badge = STATUT_BADGE[c.carteStatut] ?? STATUT_BADGE["non_emise"]!;
                  const code = codeMembre(c.id, c.dateAdhesion);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Membre */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.photoUrl ? (
                            <img
                              src={c.photoUrl}
                              alt={c.nom}
                              className="w-9 h-9 rounded-full object-cover border border-gray-100"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700 text-sm">
                              {c.nom[0]}{(c.prenoms[0] ?? "")}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{c.nom} {c.prenoms}</div>
                            <div className="text-xs text-gray-400">{c.telephone}</div>
                          </div>
                        </div>
                      </td>
                      {/* Code */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="font-mono text-xs text-gray-600">{code}</span>
                      </td>
                      {/* Village */}
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                        {c.village ?? "—"}
                      </td>
                      {/* Statut carte */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-400 text-xs">
                        {c.carteGenereLe
                          ? new Date(c.carteGenereLe).toLocaleDateString("fr-FR")
                          : "—"}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Télécharger / Générer PDF */}
                          <a
                            href={`${BASE}/api/membres/${c.id}/carte-pdf`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              const url = `${BASE}/api/membres/${c.id}/carte-pdf`;
                              const a = document.createElement("a");
                              a.href = url;
                              a.target = "_blank";
                              fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                                .then((r) => r.blob())
                                .then((blob) => {
                                  const burl = URL.createObjectURL(blob);
                                  a.href = burl;
                                  a.download = `carte-${code}.pdf`;
                                  a.click();
                                  URL.revokeObjectURL(burl);
                                });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Télécharger</span>
                          </a>

                          {/* Suspendre / Activer */}
                          {c.carteStatut !== "suspendue" ? (
                            <button
                              onClick={() => setMotifModal({ id: c.id, action: "suspendre" })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Suspendre</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => mutation.mutate({ id: c.id, action: "activer" })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Réactiver</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal suspension */}
      {motifModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Suspendre la carte</h2>
            <p className="text-sm text-gray-500">
              Indiquez le motif de suspension. Le membre ne pourra plus télécharger sa carte.
            </p>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif de suspension…"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setMotifModal(null); setMotif(""); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                disabled={!motif.trim() || mutation.isPending}
                onClick={() => mutation.mutate({ id: motifModal.id, action: "suspendre", motif })}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
