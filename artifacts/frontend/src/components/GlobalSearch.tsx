import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Users, Package, TrendingDown, X, MapPin, Phone, QrCode, Wheat } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

type SearchResults = {
  membres: { id: number; nom: string; prenoms: string; telephone: string; village: string | null; statut: string }[];
  lots: { id: number; qrCodeLot: string; statut: string; poidsTotalKg: string | null; dateCreation: string }[];
  livraisons: { id: number; poidsKg: string; dateLivraison: string; membreNom: string; membrePrenoms: string }[];
  avances: {
    id: number;
    montantOctroyeFcfa: number;
    montantRembourseFcfa: number;
    statut: string;
    dateOctroi: string;
    motif: string | null;
    membreId: number;
    membreNom: string;
    membrePrenoms: string;
    membreTelephone: string;
  }[];
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const AVANCE_STATUT_LABELS: Record<string, { label: string; cls: string }> = {
  en_cours:  { label: "En cours",  cls: "bg-blue-100 text-blue-700" },
  rembourse: { label: "Remboursé", cls: "bg-green-100 text-green-700" },
  en_retard: { label: "En retard", cls: "bg-red-100 text-red-700" },
};

function formatFcfa(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

export default function GlobalSearch() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQ = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQ.length < 2) { setResults(null); setError(""); return; }
    setLoading(true);
    setError("");
    customFetch<SearchResults>(`/api/search?q=${encodeURIComponent(debouncedQ)}`)
      .then((data) => setResults(data))
      .catch((e) => { setResults(null); setError(e?.message ?? "Erreur réseau"); })
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setError("");
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  const total =
    (results?.membres?.length ?? 0) +
    (results?.lots?.length ?? 0) +
    (results?.livraisons?.length ?? 0) +
    (results?.avances?.length ?? 0);

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-sm transition-colors"
        title="Recherche globale (Ctrl+K)"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Rechercher…</span>
        <kbd className="hidden sm:inline text-xs bg-gray-200 text-gray-500 rounded px-1 py-0.5 font-mono">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/40">
          <div ref={containerRef} className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search size={18} className="text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, téléphone, village, avance…"
                className="flex-1 text-sm outline-none text-gray-900 placeholder-gray-400"
                autoComplete="off"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults(null); }} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
              <button onClick={close} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 font-mono">Esc</button>
            </div>

            <div className="max-h-[28rem] overflow-y-auto">
              {loading && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Recherche…</div>
              )}

              {!loading && error && (
                <div className="px-4 py-4 text-center text-sm text-red-500">{error}</div>
              )}

              {!loading && !error && query.length >= 2 && results !== null && total === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Aucun résultat pour « {query} »</div>
              )}

              {!loading && !error && query.length < 2 && (
                <div className="px-4 py-5">
                  <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Vous pouvez rechercher…</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="mt-0.5 w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Users size={12} className="text-green-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Membres</p>
                        <p className="text-xs text-gray-400 mt-0.5">nom, prénoms</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="mt-0.5 w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Phone size={12} className="text-blue-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Téléphone</p>
                        <p className="text-xs text-gray-400 mt-0.5">ex. 0701020304</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="mt-0.5 w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <MapPin size={12} className="text-amber-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Village</p>
                        <p className="text-xs text-gray-400 mt-0.5">ex. Méagui, Gueyo</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="mt-0.5 w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <TrendingDown size={12} className="text-orange-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Avances</p>
                        <p className="text-xs text-gray-400 mt-0.5">par nom du membre</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="mt-0.5 w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Wheat size={12} className="text-amber-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Livraisons</p>
                        <p className="text-xs text-gray-400 mt-0.5">par nom du membre</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="mt-0.5 w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <QrCode size={12} className="text-blue-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Lots</p>
                        <p className="text-xs text-gray-400 mt-0.5">par code QR lot</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-300 mt-3 text-center">Tapez au moins 2 caractères</p>
                </div>
              )}

              {/* Membres */}
              {results && (results.membres?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <Users size={11} /> Membres
                  </div>
                  {results.membres.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { navigate(`/membres/${m.id}`); close(); }}
                      className="w-full text-left px-4 py-3 hover:bg-green-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: "#1a4731" }}
                      >
                        {m.nom[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.nom} {m.prenoms}</p>
                        <p className="text-xs text-gray-500">
                          {m.telephone}
                          {m.village ? ` · ${m.village}` : ""}
                        </p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${m.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {m.statut}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Avances */}
              {results && (results.avances?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <TrendingDown size={11} /> Avances
                  </div>
                  {results.avances.map((a) => {
                    const statut = AVANCE_STATUT_LABELS[a.statut] ?? { label: a.statut, cls: "bg-gray-100 text-gray-500" };
                    return (
                      <button
                        key={a.id}
                        onClick={() => { navigate(`/membres/${a.membreId}`); close(); }}
                        className="w-full text-left px-4 py-3 hover:bg-green-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full flex-shrink-0 bg-orange-100 flex items-center justify-center">
                          <TrendingDown size={14} className="text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {a.membreNom} {a.membrePrenoms}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFcfa(a.montantOctroyeFcfa)}
                            {a.motif ? ` · ${a.motif}` : ""}
                            {" · "}
                            {new Date(a.dateOctroi + "T00:00:00").toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${statut.cls}`}>
                          {statut.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Livraisons */}
              {results && (results.livraisons?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <Package size={11} /> Livraisons récentes
                  </div>
                  {results.livraisons.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => { navigate("/membres"); close(); }}
                      className="w-full text-left px-4 py-3 hover:bg-green-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full flex-shrink-0 bg-amber-100 flex items-center justify-center">
                        <Package size={14} className="text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {l.membreNom} {l.membrePrenoms}
                        </p>
                        <p className="text-xs text-gray-500">
                          {parseFloat(l.poidsKg).toLocaleString("fr-FR")} kg · {new Date(l.dateLivraison + "T00:00:00").toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">#{l.id}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Lots */}
              {results && (results.lots?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <Package size={11} /> Lots
                  </div>
                  {results.lots.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => { navigate("/tracabilite"); close(); }}
                      className="w-full text-left px-4 py-3 hover:bg-green-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full flex-shrink-0 bg-blue-100 flex items-center justify-center">
                        <Package size={14} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 font-mono truncate text-xs">{l.qrCodeLot}</p>
                        <p className="text-xs text-gray-500">
                          {l.poidsTotalKg ? `${parseFloat(l.poidsTotalKg).toLocaleString("fr-FR")} kg · ` : ""}
                          {new Date(l.dateCreation).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        l.statut === "en_stock" ? "bg-blue-100 text-blue-700" :
                        l.statut === "vendu" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {l.statut.replace("_", " ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
