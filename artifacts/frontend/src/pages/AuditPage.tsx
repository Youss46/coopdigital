import { useState } from "react";
import { openPdfViewer } from "@/lib/pdfViewer";
import {
  useGetAuditJournal,
  useGetAuditStats,
  useGetAuditSessions,
  getGetAuditJournalQueryKey,
  getGetAuditStatsQueryKey,
  getGetAuditSessionsQueryKey,
  getAuditExportPdf,
} from "@workspace/api-client-react";
import {
  ScrollText, Download, Activity, Shield, Clock,
  ChevronLeft, ChevronRight, Filter, User, RefreshCw,
  BarChart3, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from "recharts";

function formaterDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ACTION_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  CREATE: { label: "Création",    bg: "bg-green-100",  text: "text-green-700" },
  UPDATE: { label: "Modification", bg: "bg-blue-100",   text: "text-blue-700" },
  DELETE: { label: "Suppression", bg: "bg-red-100",    text: "text-red-700" },
  LOGIN:  { label: "Connexion",   bg: "bg-purple-100", text: "text-purple-700" },
  LOGOUT: { label: "Déconnexion", bg: "bg-gray-100",   text: "text-gray-600" },
  VIEW:   { label: "Consultation", bg: "bg-slate-100",  text: "text-slate-600" },
  EXPORT: { label: "Export",      bg: "bg-amber-100",  text: "text-amber-700" },
};

const STATUT_SESSION: Record<string, { label: string; bg: string; text: string }> = {
  active:       { label: "Active",       bg: "bg-green-100",  text: "text-green-700" },
  expiree:      { label: "Expirée",      bg: "bg-amber-100",  text: "text-amber-600" },
  deconnectee:  { label: "Déconnectée", bg: "bg-gray-100",   text: "text-gray-500" },
};

const MODULE_LABELS: Record<string, string> = {
  membres: "Membres", avances: "Avances", livraisons: "Livraisons",
  stocks: "Stocks", comptabilite: "Comptabilité", exportateurs: "Exportateurs",
  auth: "Authentification", utilisateurs: "Utilisateurs", campagnes: "Campagnes",
  paiements: "Paiements", scoring: "Scoring", anomalies: "Anomalies",
  budget: "Budget", salaires: "Salaires", reporting: "Reporting",
};

const TABS = ["Tableau de bord", "Journal des événements", "Sessions"] as const;
type Tab = typeof TABS[number];

// ─── Tab 1 : Dashboard ────────────────────────────────────────────────────────
function TabDashboard() {
  const peutVoirStats = usePermission("audit", "voir_stats");

  const { data: stats, isLoading } = useGetAuditStats({
    query: { queryKey: getGetAuditStatsQueryKey(), enabled: peutVoirStats },
  });

  if (!peutVoirStats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Shield size={40} className="mb-3" />
        <p className="text-sm">Accès réservé aux PCA et directeurs.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-12 text-center text-gray-400 text-sm">Chargement des statistiques…</div>;
  }

  const parModule = (stats?.actions_par_module ?? []).map((m) => ({
    name: MODULE_LABELS[m.module ?? ""] ?? m.module ?? "Autre",
    nb: Number(m.nb ?? 0),
  }));

  const parUser = (stats?.actions_par_user ?? []).slice(0, 8).map((u) => ({
    name: u.nom ?? `User #${u.userId}`,
    nb: Number(u.nb ?? 0),
  }));

  const evolution = (stats?.evolution_horaire ?? []).map((e) => ({
    heure: e.heure ? String(e.heure) : "",
    nb: Number(e.nb ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Actions aujourd'hui"
          value={stats?.nb_actions_aujourd_hui ?? 0}
          Icon={Activity}
          color="text-green-600" bg="bg-green-50" border="border-green-100"
        />
        <KpiCard
          label="Actions cette semaine"
          value={stats?.nb_actions_semaine ?? 0}
          Icon={BarChart3}
          color="text-blue-600" bg="bg-blue-50" border="border-blue-100"
        />
        <KpiCard
          label="Modules actifs"
          value={parModule.length}
          Icon={Shield}
          color="text-purple-600" bg="bg-purple-50" border="border-purple-100"
        />
        <KpiCard
          label="Modifications critiques"
          value={stats?.modifications_critiques?.length ?? 0}
          Icon={AlertTriangle}
          color="text-amber-600" bg="bg-amber-50" border="border-amber-100"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Actions par module</h3>
          {parModule.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={parModule} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="nb" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Évolution horaire</h3>
          {evolution.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={evolution} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="heure" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line dataKey="nb" stroke="#c4962a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 text-sm mb-4">Utilisateurs les plus actifs</h3>
        {parUser.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucune donnée</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={parUser} layout="vertical" margin={{ left: 20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip />
              <Bar dataKey="nb" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label, value, Icon, color, bg, border,
}: {
  label: string; value: number;
  Icon: React.ElementType; color: string; bg: string; border: string;
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`${color} w-5 h-5`} />
        <span className="text-xs text-gray-500 leading-tight">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString("fr-FR")}</p>
    </div>
  );
}

// ─── Tab 2 : Journal ──────────────────────────────────────────────────────────
function TabJournal({ peutExporter }: { peutExporter: boolean }) {
  const [filtres, setFiltres] = useState<{
    module: string; action: string; dateDebut: string; dateFin: string; recherche: string;
  }>({ module: "", action: "", dateDebut: "", dateFin: "", recherche: "" });
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const limit = 25;

  const params = {
    ...(filtres.module    ? { module: filtres.module }       : {}),
    ...(filtres.action    ? { action: filtres.action }       : {}),
    ...(filtres.dateDebut ? { date_debut: filtres.dateDebut } : {}),
    ...(filtres.dateFin   ? { date_fin: filtres.dateFin }    : {}),
    ...(filtres.recherche ? { recherche: filtres.recherche } : {}),
    limit,
    offset,
  };

  const { data, isLoading, refetch } = useGetAuditJournal(params, {
    query: { queryKey: getGetAuditJournalQueryKey(params) },
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  function resetFiltres() {
    setFiltres({ module: "", action: "", dateDebut: "", dateFin: "", recherche: "" });
    setOffset(0);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await getAuditExportPdf({
        ...(filtres.module    ? { module: filtres.module }       : {}),
        ...(filtres.dateDebut ? { date_debut: filtres.dateDebut } : {}),
        ...(filtres.dateFin   ? { date_fin: filtres.dateFin }    : {}),
      });
      openPdfViewer(URL.createObjectURL(blob), `audit_coopdigital_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      alert("Erreur lors de la génération du PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={15} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filtres</span>
          <button
            onClick={resetFiltres}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <RefreshCw size={12} /> Réinitialiser
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <select
            value={filtres.module}
            onChange={(e) => { setFiltres((f) => ({ ...f, module: e.target.value })); setOffset(0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Tous les modules</option>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filtres.action}
            onChange={(e) => { setFiltres((f) => ({ ...f, action: e.target.value })); setOffset(0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Toutes les actions</option>
            {Object.entries(ACTION_STYLES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={filtres.dateDebut}
            onChange={(e) => { setFiltres((f) => ({ ...f, dateDebut: e.target.value })); setOffset(0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Date début"
          />
          <input
            type="date"
            value={filtres.dateFin}
            onChange={(e) => { setFiltres((f) => ({ ...f, dateFin: e.target.value })); setOffset(0); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Date fin"
          />
          <input
            type="text"
            value={filtres.recherche}
            onChange={(e) => { setFiltres((f) => ({ ...f, recherche: e.target.value })); setOffset(0); }}
            placeholder="Rechercher…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {isLoading ? "Chargement…" : `${total.toLocaleString("fr-FR")} événement${total !== 1 ? "s" : ""}`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Actualiser
          </button>
          {peutExporter && (
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[#1a4731] text-white rounded-lg hover:bg-[#163d28] disabled:opacity-50"
            >
              <Download size={14} /> {exporting ? "Génération…" : "Exporter PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Chargement…</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <ScrollText size={32} className="mx-auto mb-2 opacity-30" />
            Aucun événement trouvé
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Utilisateur</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Module</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e) => {
                  const style = ACTION_STYLES[e.action] ?? { label: e.action, bg: "bg-gray-100", text: "text-gray-600" };
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {formaterDate(e.created_at as unknown as string)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-green-700" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 text-xs">{e.user_nom ?? "Système"}</p>
                            <p className="text-gray-400 text-xs">{e.user_role ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {MODULE_LABELS[e.module] ?? e.module}
                        {e.entite_type && (
                          <span className="text-gray-400 ml-1">/ {e.entite_type}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">
                        {e.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                        {e.ip_address ?? e.user_ip ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {currentPage} / {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3 : Sessions ─────────────────────────────────────────────────────────
function TabSessions() {
  const { data, isLoading, refetch } = useGetAuditSessions({ limit: 50 }, {
    query: { queryKey: getGetAuditSessionsQueryKey({ limit: 50 }) },
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {isLoading ? "Chargement…" : `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
        </p>
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Chargement…</div>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <Clock size={32} className="mx-auto mb-2 opacity-30" />
            Aucune session enregistrée
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Connexion</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Déconnexion</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Durée</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((s) => {
                  const st = STATUT_SESSION[s.statut] ?? { label: s.statut, bg: "bg-gray-100", text: "text-gray-600" };
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                          {s.statut === "active" && <CheckCircle2 size={11} />}
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formaterDate(s.date_connexion)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {s.date_deconnexion ? formaterDate(s.date_deconnexion) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {s.duree_session_min != null ? `${s.duree_session_min} min` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                        {s.nb_actions}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                        {s.ip_address ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AuditPage() {
  const [onglet, setOnglet] = useState<Tab>("Tableau de bord");

  const peutVoirJournal  = usePermission("audit", "voir_journal");
  const peutExporter     = usePermission("audit", "exporter");

  if (!peutVoirJournal && !usePermission("audit", "voir_stats")) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Shield size={48} className="mb-4" />
        <p className="text-base font-medium">Accès non autorisé</p>
        <p className="text-sm mt-1">Vous n'avez pas les droits pour consulter le journal d'audit.</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1a4731" }}>
            <ScrollText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Journal d'audit</h1>
            <p className="text-sm text-gray-500">Traçabilité inaltérable de toutes les opérations</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          <Shield size={13} />
          Signé SHA-256 · FCFA
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setOnglet(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              onglet === tab
                ? "bg-white text-[#1a4731] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {onglet === "Tableau de bord"        && <TabDashboard />}
      {onglet === "Journal des événements" && <TabJournal peutExporter={peutExporter} />}
      {onglet === "Sessions"               && <TabSessions />}
    </div>
  );
}
