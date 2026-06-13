import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, Users, Package, TrendingDown, X, MapPin, Phone, QrCode, Wheat, LayoutGrid, ChevronRight } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

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

type MenuItem = { label: string; href: string; roles: string[]; category: string };

const ALL_MENUS: MenuItem[] = [
  { label: "Vue PCA",                   href: "/dashboard/pca",          roles: ["pca"],                                                               category: "Tableau de bord" },
  { label: "Tableau de bord",           href: "/dashboard",              roles: ["pca","directeur","comptable","magasinier","responsable_tracabilite","auditeur"], category: "Tableau de bord" },
  { label: "Tableau de bord délégué",   href: "/dashboard-delegue",      roles: ["delegue"],                                                           category: "Tableau de bord" },
  { label: "Mes missions",              href: "/missions",               roles: ["agent_terrain"],                                                     category: "Terrain" },
  { label: "Membres",                   href: "/membres",                roles: ["pca","directeur","comptable","responsable_tracabilite","delegue","auditeur"], category: "Membres" },
  { label: "Cartes membres",            href: "/cartes-membres",         roles: ["pca","directeur","comptable","delegue","auditeur"],                   category: "Membres" },
  { label: "Scoring Producteurs",       href: "/scoring",                roles: ["pca","directeur","comptable","auditeur"],                            category: "Membres" },
  { label: "Campagnes",                 href: "/campagnes",              roles: ["pca","directeur","comptable","magasinier","delegue","auditeur"],      category: "Collecte" },
  { label: "Livraisons",                href: "/livraisons/nouvelle",    roles: ["pca","directeur","delegue","comptable","auditeur"],                   category: "Collecte" },
  { label: "Transport",                 href: "/transport",              roles: ["pca","directeur","comptable","auditeur","magasinier"],                category: "Collecte" },
  { label: "Expéditions port",          href: "/expeditions",            roles: ["pca","directeur","comptable","responsable_tracabilite","auditeur"],   category: "Collecte" },
  { label: "Traçabilité",               href: "/tracabilite",            roles: ["pca","directeur","responsable_tracabilite","auditeur"],               category: "Traçabilité" },
  { label: "Parcelles & EUDR",          href: "/parcelles",              roles: ["pca","directeur","comptable","responsable_tracabilite","auditeur"],   category: "Traçabilité" },
  { label: "Missions terrain",          href: "/missions",               roles: ["responsable_tracabilite"],                                           category: "Traçabilité" },
  { label: "Stocks",                    href: "/stocks",                 roles: ["pca","directeur","magasinier","comptable","auditeur"],                category: "Stocks" },
  { label: "Stocks refoulés",           href: "/refus",                  roles: ["pca","directeur","magasinier","comptable","auditeur"],                category: "Stocks" },
  { label: "Avances",                   href: "/avances",                roles: ["pca","directeur","comptable","delegue","auditeur"],                   category: "Finance membre" },
  { label: "Intrants",                  href: "/intrants",               roles: ["pca","directeur","comptable","delegue","auditeur","magasinier"],      category: "Finance membre" },
  { label: "Règlements",                href: "/reglements",             roles: ["pca","directeur","comptable","delegue","auditeur"],                   category: "Finance membre" },
  { label: "Fournisseurs",              href: "/fournisseurs",           roles: ["pca","directeur","comptable","delegue","auditeur"],                   category: "Commerce" },
  { label: "Exportateurs",              href: "/exportateurs",           roles: ["pca","directeur","comptable","auditeur"],                            category: "Commerce" },
  { label: "Créances",                  href: "/creances",               roles: ["pca","directeur","comptable","auditeur"],                            category: "Commerce" },
  { label: "Suivi des Prix",            href: "/prix",                   roles: ["pca","directeur","comptable","auditeur"],                            category: "Commerce" },
  { label: "Tableau de bord financier", href: "/finances/tableau-bord",  roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Budget",                    href: "/budget",                 roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Emprunts",                  href: "/emprunts",               roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Subventions",               href: "/subventions",            roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Dons",                      href: "/dons",                   roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Caisse",                    href: "/caisse",                 roles: ["pca","directeur","comptable","auditeur","delegue"],                   category: "Finances" },
  { label: "Banque",                    href: "/banque",                 roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Fiscalité",                 href: "/fiscalite",              roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Réconciliation",            href: "/reconciliation",         roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Investissements",           href: "/investissements",        roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Comptabilité",              href: "/comptabilite",           roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Salaires",                  href: "/salaires",               roles: ["pca","directeur","comptable","auditeur"],                            category: "Finances" },
  { label: "Formations",                href: "/formations",             roles: ["pca","directeur","comptable","auditeur","delegue"],                   category: "RH & Social" },
  { label: "Formations RSE",            href: "/formations-rse",         roles: ["pca","directeur","comptable","auditeur"],                            category: "RH & Social" },
  { label: "Équipements",               href: "/equipements",            roles: ["pca","directeur","comptable","auditeur"],                            category: "RH & Social" },
  { label: "Prévisions",                href: "/previsions",             roles: ["pca","directeur","comptable","auditeur"],                            category: "Pilotage" },
  { label: "Reporting",                 href: "/reporting",              roles: ["pca","directeur","comptable","responsable_tracabilite","auditeur"],   category: "Pilotage" },
  { label: "Anomalies",                 href: "/anomalies",              roles: ["pca","directeur","comptable","auditeur"],                            category: "Pilotage" },
  { label: "Journal d'audit",           href: "/audit",                  roles: ["pca","directeur","auditeur"],                                        category: "Pilotage" },
  { label: "Gouvernance",               href: "/gouvernance",            roles: ["pca","directeur","secretaire","auditeur"],                           category: "Organisation" },
  { label: "Communication",             href: "/communication",          roles: ["pca","directeur"],                                                   category: "Organisation" },
  { label: "Délégués Localité",         href: "/delegues",               roles: ["pca","directeur","comptable","auditeur"],                            category: "Organisation" },
  { label: "Administration",            href: "/administration/comptes", roles: ["pca","directeur"],                                                   category: "Organisation" },
  { label: "Paramètres",                href: "/parametres",             roles: ["pca","directeur"],                                                   category: "Organisation" },
];

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

const HISTORY_KEY = "coop_search_history";
const HISTORY_MAX = 5;

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

function saveToHistory(q: string) {
  const trimmed = q.trim();
  if (!trimmed || trimmed.length < 2) return;
  const prev = loadHistory().filter((h) => h !== trimmed);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([trimmed, ...prev].slice(0, HISTORY_MAX)));
}

export default function GlobalSearch() {
  const [, navigate] = useLocation();
  const { utilisateur } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQ = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQ.length < 2) { setResults(null); setError(""); return; }
    setLoading(true);
    setError("");
    customFetch<SearchResults>(`/api/search?q=${encodeURIComponent(debouncedQ)}`)
      .then((data: SearchResults) => setResults(data))
      .catch((e: unknown) => { setResults(null); setError((e as Error)?.message ?? "Erreur réseau"); })
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  const menuMatches = useMemo(() => {
    if (query.length < 2) return [];
    const q = normalize(query);
    const role = utilisateur?.role ?? "";
    return ALL_MENUS.filter(
      (m) => normalize(m.label).includes(q) && (m.roles.length === 0 || m.roles.includes(role))
    ).slice(0, 6);
  }, [query, utilisateur?.role]);

  // Flat list of all navigable items in render order, used for ↑↓ keyboard nav
  const flatItems = useMemo<Array<() => void>>(() => {
    const items: Array<() => void> = [];
    for (const m of menuMatches) items.push(() => { navigate(m.href); });
    for (const m of (results?.membres ?? [])) items.push(() => { navigate(`/membres/${m.id}`); });
    for (const a of (results?.avances ?? [])) items.push(() => { navigate(`/membres/${a.membreId}`); });
    for (const l of (results?.livraisons ?? [])) items.push(() => { navigate("/membres"); });
    for (const l of (results?.lots ?? [])) items.push(() => { navigate("/tracabilite"); });
    return items;
  // navigate is stable from wouter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuMatches, results]);

  // Reset focus when results change
  useEffect(() => { setFocusedIndex(-1); }, [flatItems]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${focusedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  // Charger l'historique à l'ouverture
  useEffect(() => {
    if (open) setHistory(loadHistory());
  }, [open]);

  const doNavigate = useCallback((action: () => void) => {
    saveToHistory(query);
    setHistory(loadHistory());
    action();
    close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setError("");
    setFocusedIndex(-1);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      const action = flatItems[focusedIndex];
      if (action) doNavigate(action);
    }
  }, [flatItems, focusedIndex, doNavigate]);

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

  const apiTotal =
    (results?.membres?.length ?? 0) +
    (results?.lots?.length ?? 0) +
    (results?.livraisons?.length ?? 0) +
    (results?.avances?.length ?? 0);

  const hasAnyResult = menuMatches.length > 0 || apiTotal > 0;

  // Build sequential index for each rendered item
  let itemIdx = -1;
  const nextIdx = () => { itemIdx += 1; return itemIdx; };

  const itemCls = (idx: number) =>
    `w-full text-left flex items-center gap-3 border-b border-gray-50 transition-colors ${
      focusedIndex === idx ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200" : "hover:bg-gray-50"
    }`;

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

            {/* Barre de recherche */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search size={18} className="text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nom, menu, téléphone, village, avance…"
                className="flex-1 text-sm outline-none text-gray-900 placeholder-gray-400"
                autoComplete="off"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults(null); setFocusedIndex(-1); }} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
              <button onClick={close} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 font-mono">Esc</button>
            </div>

            {/* Aide navigation clavier */}
            {hasAnyResult && (
              <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-50 bg-gray-50/60">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> naviguer
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[10px]">↵</kbd> ouvrir
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[10px]">Esc</kbd> fermer
                </span>
              </div>
            )}

            <div ref={listRef} className="max-h-[26rem] overflow-y-auto">
              {loading && menuMatches.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Recherche…</div>
              )}

              {!loading && error && (
                <div className="px-4 py-4 text-center text-sm text-red-500">{error}</div>
              )}

              {!loading && !error && query.length >= 2 && results !== null && !hasAnyResult && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Aucun résultat pour « {query} »</div>
              )}

              {/* Panneau d'aide + historique — query vide */}
              {query.length < 2 && (
                <div className="px-4 py-4">
                  {/* Historique */}
                  {history.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Recherches récentes</p>
                        <button
                          onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]); }}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                          Effacer
                        </button>
                      </div>
                      {history.map((h) => (
                        <button
                          key={h}
                          onClick={() => setQuery(h)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 text-left group transition-colors"
                        >
                          <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Search size={11} className="text-gray-400" />
                          </div>
                          <span className="flex-1 text-sm text-gray-700 truncate">{h}</span>
                          <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                        </button>
                      ))}
                      <div className="border-t border-gray-100 mt-3 mb-3" />
                    </div>
                  )}
                  {/* Hints */}
                  <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Vous pouvez rechercher…</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: <LayoutGrid size={12} className="text-purple-700" />, bg: "bg-purple-100", label: "Menus", sub: "ex. Avances, Budget" },
                      { icon: <Users size={12} className="text-green-700" />, bg: "bg-green-100", label: "Membres", sub: "nom, prénoms" },
                      { icon: <Phone size={12} className="text-blue-700" />, bg: "bg-blue-100", label: "Téléphone", sub: "ex. 0701020304" },
                      { icon: <MapPin size={12} className="text-amber-700" />, bg: "bg-amber-100", label: "Village", sub: "ex. Méagui, Gueyo" },
                      { icon: <TrendingDown size={12} className="text-orange-700" />, bg: "bg-orange-100", label: "Avances", sub: "par nom du membre" },
                      { icon: <Wheat size={12} className="text-amber-700" />, bg: "bg-amber-100", label: "Livraisons", sub: "par nom du membre" },
                    ].map(({ icon, bg, label, sub }) => (
                      <div key={label} className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
                        <div className={`mt-0.5 w-6 h-6 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-300 mt-3 text-center">Tapez au moins 2 caractères</p>
                </div>
              )}

              {/* Menus — résultats instantanés */}
              {menuMatches.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <LayoutGrid size={11} /> Navigation
                  </div>
                  {menuMatches.map((m) => {
                    const idx = nextIdx();
                    return (
                      <button
                        key={m.href + m.label}
                        data-idx={idx}
                        onClick={() => doNavigate(() => navigate(m.href))}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`px-4 py-2.5 ${itemCls(idx)}`}
                      >
                        <div className="w-7 h-7 rounded-lg flex-shrink-0 bg-purple-100 flex items-center justify-center">
                          <LayoutGrid size={13} className="text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{m.label}</p>
                          <p className="text-xs text-gray-400">{m.category}</p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Membres */}
              {results && (results.membres?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <Users size={11} /> Membres
                  </div>
                  {results.membres.map((m) => {
                    const idx = nextIdx();
                    return (
                      <button
                        key={m.id}
                        data-idx={idx}
                        onClick={() => doNavigate(() => navigate(`/membres/${m.id}`))}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`px-4 py-3 ${itemCls(idx)}`}
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
                    );
                  })}
                </div>
              )}

              {/* Avances */}
              {results && (results.avances?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <TrendingDown size={11} /> Avances
                  </div>
                  {results.avances.map((a) => {
                    const idx = nextIdx();
                    const statut = AVANCE_STATUT_LABELS[a.statut] ?? { label: a.statut, cls: "bg-gray-100 text-gray-500" };
                    return (
                      <button
                        key={a.id}
                        data-idx={idx}
                        onClick={() => doNavigate(() => navigate(`/membres/${a.membreId}`))}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`px-4 py-3 ${itemCls(idx)}`}
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
                  {results.livraisons.map((l) => {
                    const idx = nextIdx();
                    return (
                      <button
                        key={l.id}
                        data-idx={idx}
                        onClick={() => doNavigate(() => navigate("/membres"))}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`px-4 py-3 ${itemCls(idx)}`}
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
                    );
                  })}
                </div>
              )}

              {/* Lots */}
              {results && (results.lots?.length ?? 0) > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 bg-gray-50 border-b border-gray-100">
                    <QrCode size={11} /> Lots
                  </div>
                  {results.lots.map((l) => {
                    const idx = nextIdx();
                    return (
                      <button
                        key={l.id}
                        data-idx={idx}
                        onClick={() => doNavigate(() => navigate("/tracabilite"))}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`px-4 py-3 ${itemCls(idx)}`}
                      >
                        <div className="w-8 h-8 rounded-full flex-shrink-0 bg-blue-100 flex items-center justify-center">
                          <QrCode size={14} className="text-blue-600" />
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
