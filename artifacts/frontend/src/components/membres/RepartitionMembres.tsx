import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, UserRound, Loader2 } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) } });

interface RepartitionData {
  total: number;
  genre: {
    hommes: number;
    femmes: number;
    nonRenseigne: number;
    pourcentageFemmes: number;
    pourcentageHommes: number;
  };
  age: {
    moyenne: number | null;
    nonRenseigne: number;
    tranches: { cle: string; label: string; count: number }[];
  };
}

export function RepartitionMembres() {
  const { data, isLoading, error } = useQuery<RepartitionData>({
    queryKey: ["membres-repartition"],
    queryFn: async () => {
      const r = await apiFetch("/api/membres/repartition");
      if (!r.ok) throw new Error("Erreur lors du chargement de la répartition");
      return r.json();
    },
  });

  const [monte, setMonte] = useState(false);
  useEffect(() => {
    if (!data) return;
    setMonte(false);
    const t = setTimeout(() => setMonte(true), 30);
    return () => clearTimeout(t);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Chargement…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">
        Impossible de charger la répartition des membres.
      </div>
    );
  }

  const { total, genre, age } = data;
  const maxTranche = Math.max(1, ...age.tranches.map((t) => t.count));

  return (
    <div className="space-y-5">
      {/* ── Cartes résumé ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <Users size={14} /> Membres actifs
          </div>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <UserRound size={14} className="text-blue-600" /> Hommes
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {genre.hommes} <span className="text-sm font-medium text-gray-400">({genre.pourcentageHommes}%)</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <UserRound size={14} className="text-pink-600" /> Femmes
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {genre.femmes} <span className="text-sm font-medium text-gray-400">({genre.pourcentageFemmes}%)</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            Âge moyen
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {age.moyenne !== null ? `${age.moyenne} ans` : "—"}
          </p>
        </div>
      </div>

      {/* ── Répartition par genre ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Répartition par genre</h3>
        {total > 0 ? (
          <>
            <div className="flex h-4 w-full rounded-full overflow-hidden bg-gray-100">
              <div
                className="bg-blue-500 transition-all duration-700 ease-out"
                style={{ width: monte ? `${genre.pourcentageHommes}%` : "0%" }}
                title={`Hommes ${genre.pourcentageHommes}%`}
              />
              <div
                className="bg-pink-500 transition-all duration-700 ease-out"
                style={{ width: monte ? `${genre.pourcentageFemmes}%` : "0%" }}
                title={`Femmes ${genre.pourcentageFemmes}%`}
              />
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Hommes — {genre.hommes} ({genre.pourcentageHommes}%)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-pink-500" /> Femmes — {genre.femmes} ({genre.pourcentageFemmes}%)</span>
              {genre.nonRenseigne > 0 && (
                <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Non renseigné — {genre.nonRenseigne}</span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Aucune donnée disponible.</p>
        )}
      </div>

      {/* ── Répartition par tranche d'âge ─────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Répartition par tranche d'âge</h3>
        {total > 0 ? (
          <div className="space-y-3">
            {age.tranches.map((t) => (
              <div key={t.cle} className="flex items-center gap-3">
                <span className="w-16 text-xs text-gray-600 font-medium flex-shrink-0">{t.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: monte ? `${(t.count / maxTranche) * 100}%` : "0%", backgroundColor: "#1a4731" }}
                  />
                </div>
                <span className="w-10 text-xs text-gray-500 text-right flex-shrink-0">{t.count}</span>
              </div>
            ))}
            {age.nonRenseigne > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {age.nonRenseigne} membre{age.nonRenseigne > 1 ? "s" : ""} sans date de naissance renseignée.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucune donnée disponible.</p>
        )}
      </div>
    </div>
  );
}
