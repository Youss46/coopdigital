import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useGetBalance,
  useGetCompteResultat,
  useGetMargeCollecte,
  useGetTresorerie,
  useGetBilan,
  useGetFluxTresorerie,
  useGetMargeCampagnes,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import { Download } from "lucide-react";
const BASE = import.meta.env.VITE_API_URL ?? "";
function getAuthToken(): string | null {
  return localStorage.getItem("coop_token");
}

// ─── Utilitaires ────────────────────────────────────────────────────────────
const FCFA = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n) + " FCFA";

const VERT = "#1a4731";
const OR = "#c4962a";
const ROUGE = "#dc2626";
const GRIS = "#6b7280";
const VERT_CLAIR = "#4ade80";
const OR_CLAIR = "#fcd34d";

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const ANNEE = new Date().getFullYear();

// ─── Composants utilitaires ──────────────────────────────────────────────────
function KpiCard({ label, value, sous, couleur = VERT }: { label: string; value: string; sous?: string; couleur?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: couleur }}>{value}</p>
      {sous && <p className="text-xs text-gray-400 mt-0.5">{sous}</p>}
    </div>
  );
}

function SectionTitre({ titre, description }: { titre: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-gray-900">{titre}</h2>
      {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 bg-gray-100 rounded w-1/3" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
}

// ─── Onglet 1 : Tableau de bord financier ───────────────────────────────────
function TabDashboard() {
  const { data: marge, isLoading: ml } = useGetMargeCollecte({ exercice: ANNEE });
  const { data: treso, isLoading: tl } = useGetTresorerie();
  const { data: cr, isLoading: crl } = useGetCompteResultat({ exercice: ANNEE });
  const { data: campagnes, isLoading: cpl } = useGetMargeCampagnes();

  if (ml || tl || crl || cpl) return <Skeleton />;

  const ventilation = cr?.ventilationMensuelle ?? [];
  const chartData = ventilation.map((m) => ({
    mois: MOIS[(m.mois ?? 1) - 1] ?? String(m.mois),
    Produits: m.produitsFcfa,
    Charges: m.chargesFcfa,
    Résultat: m.resultatFcfa,
  }));

  const campagnesData = (campagnes ?? []).slice(0, 5).reverse().map((c) => ({
    annee: String(c.annee),
    CA: c.caVentesFcfa,
    Achats: c.coutAchatsFcfa,
    "Marge nette": c.margeNetteFcfa,
  }));

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="CA Ventes cacao"
          value={FCFA(marge?.caVentesFcfa ?? 0)}
          sous={`Exercice ${ANNEE}`}
          couleur={VERT}
        />
        <KpiCard
          label="Marge nette"
          value={FCFA(marge?.margeNetteFcfa ?? 0)}
          sous={`Taux : ${marge?.tauxMarge?.toFixed(1) ?? 0} %`}
          couleur={(marge?.margeNetteFcfa ?? 0) >= 0 ? VERT : ROUGE}
        />
        <KpiCard
          label="Trésorerie banque"
          value={FCFA(treso?.soldeBanqueFcfa ?? 0)}
          sous="Solde comptable"
          couleur={OR}
        />
        <KpiCard
          label="Coût achats cacao"
          value={FCFA(marge?.coutAchatsFcfa ?? 0)}
          sous="Compte 601"
          couleur={GRIS}
        />
      </div>

      {/* Évolution mensuelle CA vs Charges */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <SectionTitre
          titre={`Évolution mensuelle ${ANNEE}`}
          description="Produits (ventes) vs charges vs résultat"
        />
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barGap={2} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => (v / 1_000_000).toFixed(1) + "M"} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => FCFA(v)} />
            <Legend />
            <Bar dataKey="Produits" fill={VERT} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Charges" fill={OR} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Résultat" fill={VERT_CLAIR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparatif campagnes */}
      {campagnesData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitre
            titre="Comparatif campagnes"
            description="CA, achats, marge nette par exercice"
          />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={campagnesData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => (v / 1_000_000).toFixed(0) + "M"} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => FCFA(v)} />
              <Legend />
              <Bar dataKey="CA" fill={VERT} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Achats" fill={OR} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Marge nette" fill={VERT_CLAIR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Onglet 2 : États financiers ─────────────────────────────────────────────
function TabEtatsFinanciers() {
  const { data: bilan, isLoading: bl } = useGetBilan({ exercice: ANNEE });
  const { data: cr, isLoading: crl } = useGetCompteResultat({ exercice: ANNEE });
  const { data: flux, isLoading: fl } = useGetFluxTresorerie({ exercice: ANNEE });

  if (bl || crl || fl) return <Skeleton />;

  // Bilan PieChart
  const bilanActif = bilan?.actif ?? [];
  const bilanPassif = bilan?.passif ?? [];
  const pieActif = bilanActif.map((a) => ({ name: a.libelle, value: a.montantFcfa }));
  const COULEURS_PIE = [VERT, OR, "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"];

  // Compte de résultat
  const produits = cr?.produits ?? [];
  const charges = cr?.charges ?? [];
  const resultatNet = cr?.resultatNetFcfa ?? 0;

  // Flux trésorerie
  return (
    <div className="space-y-8">
      {/* Bilan */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <SectionTitre titre={`Bilan OHADA ${ANNEE}`} description="Actif et passif consolidés" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tableau actif */}
          <div>
            <h3 className="text-sm font-semibold text-green-700 mb-2 uppercase tracking-wide">Actif</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-green-50">
                  <th className="text-left p-2 font-semibold text-gray-600">Compte</th>
                  <th className="text-right p-2 font-semibold text-gray-600">Montant</th>
                </tr>
              </thead>
              <tbody>
                {bilanActif.map((a, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="p-2 text-gray-700">{a.libelle} <span className="text-gray-400">({a.compte})</span></td>
                    <td className="p-2 text-right font-mono text-gray-900">{FCFA(a.montantFcfa)}</td>
                  </tr>
                ))}
                <tr className="bg-green-100 font-bold">
                  <td className="p-2 text-green-800">Total Actif</td>
                  <td className="p-2 text-right font-mono text-green-800">{FCFA(bilan?.totalActifFcfa ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Tableau passif */}
          <div>
            <h3 className="text-sm font-semibold text-amber-700 mb-2 uppercase tracking-wide">Passif</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 font-semibold text-gray-600">Compte</th>
                  <th className="text-right p-2 font-semibold text-gray-600">Montant</th>
                </tr>
              </thead>
              <tbody>
                {bilanPassif.map((a, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="p-2 text-gray-700">{a.libelle} <span className="text-gray-400">({a.compte})</span></td>
                    <td className="p-2 text-right font-mono text-gray-900">{FCFA(a.montantFcfa)}</td>
                  </tr>
                ))}
                <tr className="bg-amber-100 font-bold">
                  <td className="p-2 text-amber-800">Total Passif</td>
                  <td className="p-2 text-right font-mono text-amber-800">{FCFA(bilan?.totalPassifFcfa ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* PieChart actif */}
        {pieActif.length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-gray-500 mb-2">Répartition de l'actif</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieActif} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieActif.map((_, i) => (
                    <Cell key={i} fill={COULEURS_PIE[i % COULEURS_PIE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => FCFA(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Compte de résultat */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <SectionTitre titre="Compte de résultat OHADA" description={`Exercice ${ANNEE}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-green-700 mb-2 uppercase tracking-wide">Produits</h3>
            <table className="w-full text-xs">
              <tbody>
                {produits.map((p, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-green-50" : "bg-white"}>
                    <td className="p-2">{p.libelle} <span className="text-gray-400">({p.compte})</span></td>
                    <td className="p-2 text-right font-mono">{FCFA(p.montantFcfa)}</td>
                  </tr>
                ))}
                <tr className="bg-green-100 font-bold text-green-800">
                  <td className="p-2">Total Produits</td>
                  <td className="p-2 text-right font-mono">{FCFA(cr?.totalProduitsFcfa ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-700 mb-2 uppercase tracking-wide">Charges</h3>
            <table className="w-full text-xs">
              <tbody>
                {charges.map((c, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-red-50" : "bg-white"}>
                    <td className="p-2">{c.libelle} <span className="text-gray-400">({c.compte})</span></td>
                    <td className="p-2 text-right font-mono">{FCFA(c.montantFcfa)}</td>
                  </tr>
                ))}
                <tr className="bg-red-100 font-bold text-red-800">
                  <td className="p-2">Total Charges</td>
                  <td className="p-2 text-right font-mono">{FCFA(cr?.totalChargesFcfa ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className={`mt-4 p-4 rounded-lg text-center font-bold text-lg ${resultatNet >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          Résultat net : {FCFA(resultatNet)}
        </div>
      </div>

      {/* Flux de trésorerie */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <SectionTitre titre="Flux de trésorerie" description={`Exercice ${ANNEE}`} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs text-gray-500">Encaissements exportateurs</p>
            <p className="text-xl font-bold text-green-700 mt-1">{FCFA(flux?.encaissementsExportateursFcfa ?? 0)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-xs text-gray-500">Paiements producteurs</p>
            <p className="text-xl font-bold text-red-700 mt-1">{FCFA(flux?.paiementsProducteursFcfa ?? 0)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-xs text-gray-500">Avances octroyées</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{FCFA(flux?.avancesOctroyes ?? 0)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs text-gray-500">Flux opérationnels</p>
            <p className="text-xl font-bold text-blue-700 mt-1">{FCFA(flux?.fluxOperationnelsFcfa ?? 0)}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-xs text-gray-500">Flux financement</p>
            <p className="text-xl font-bold text-purple-700 mt-1">{FCFA(flux?.fluxFinancementFcfa ?? 0)}</p>
          </div>
          <div className={`rounded-lg p-4 ${(flux?.soldeFinalFcfa ?? 0) >= 0 ? "bg-green-100" : "bg-red-100"}`}>
            <p className="text-xs text-gray-500">Solde final</p>
            <p className={`text-xl font-bold mt-1 ${(flux?.soldeFinalFcfa ?? 0) >= 0 ? "text-green-800" : "text-red-800"}`}>
              {FCFA(flux?.soldeFinalFcfa ?? 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 3 : Rapports téléchargeables ────────────────────────────────────
function TabRapports() {
  const [loading, setLoading] = useState<string | null>(null);
  const peutGenererMensuel = usePermission("reporting", "generer_rapport_mensuel");
  const peutGenererCampagne = usePermission("reporting", "generer_bilan_campagne");

  const now = new Date();
  const annee = now.getFullYear();
  const mois = now.getMonth() + 1;
  const moisPrecedent = mois === 1 ? 12 : mois - 1;
  const anneeMoisPrecedent = mois === 1 ? annee - 1 : annee;

  async function telechargerPdf(url: string, nomFichier: string, cle: string) {
    setLoading(cle);
    try {
      const token = getAuthToken();
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`Erreur ${resp.status}`);
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = nomFichier;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      alert("Échec du téléchargement : " + String(e));
    } finally {
      setLoading(null);
    }
  }

  const rapports = [
    ...(peutGenererMensuel ? [
      {
        titre: "Rapport mensuel – mois précédent",
        description: `Synthèse complète de ${new Date(anneeMoisPrecedent, moisPrecedent - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} : livraisons, ventes, compte de résultat.`,
        url: `/api/rapports/mensuel/${moisPrecedent}/${anneeMoisPrecedent}`,
        fichier: `rapport_${anneeMoisPrecedent}_${String(moisPrecedent).padStart(2, "0")}.pdf`,
        cle: "mensuel_precedent",
        icone: "📄",
      },
      {
        titre: "Rapport mensuel – mois courant",
        description: `Synthèse en cours pour ${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}.`,
        url: `/api/rapports/mensuel/${mois}/${annee}`,
        fichier: `rapport_${annee}_${String(mois).padStart(2, "0")}.pdf`,
        cle: "mensuel_courant",
        icone: "📋",
      },
    ] : []),
    ...(peutGenererCampagne ? [
      {
        titre: `Bilan de campagne ${annee}`,
        description: `Bilan annuel complet ${annee} : top producteurs, exportateurs, compte de résultat, ventilation mensuelle.`,
        url: `/api/rapports/campagne/${annee}`,
        fichier: `bilan_campagne_${annee}.pdf`,
        cle: `bilan_${annee}`,
        icone: "📊",
      },
      {
        titre: `Bilan de campagne ${annee - 1}`,
        description: `Bilan annuel complet ${annee - 1} (exercice clos).`,
        url: `/api/rapports/campagne/${annee - 1}`,
        fichier: `bilan_campagne_${annee - 1}.pdf`,
        cle: `bilan_${annee - 1}`,
        icone: "📁",
      },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Téléchargez vos rapports financiers au format PDF. Les données sont générées à la demande depuis la comptabilité.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rapports.map((r) => (
          <div key={r.cle} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{r.icone}</span>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-sm">{r.titre}</h3>
                <p className="text-xs text-gray-500 mt-1">{r.description}</p>
              </div>
            </div>
            <button
              onClick={() => void telechargerPdf(r.url, r.fichier, r.cle)}
              disabled={loading === r.cle}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: loading === r.cle ? "#e5e7eb" : VERT,
                color: loading === r.cle ? GRIS : "white",
              }}
            >
              {loading === r.cle ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Génération…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Télécharger PDF
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Fiche membre */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Fiche membre individuelle</h3>
        <FicheMembre />
      </div>
    </div>
  );
}

function FicheMembre() {
  const [membreId, setMembreId] = useState("");
  const [loading, setLoading] = useState(false);
  const peutGenererFiche = usePermission("reporting", "generer_fiche_membre");

  async function telechargerFiche() {
    const id = parseInt(membreId);
    if (!id) return;
    setLoading(true);
    try {
      const token = getAuthToken();
      const resp = await fetch(`${BASE}/api/rapports/membre/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ erreur: `Erreur ${resp.status}` })) as { erreur: string };
        throw new Error(err.erreur);
      }
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `fiche_membre_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      alert("Échec : " + String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!peutGenererFiche) return null;

  return (
    <div className="flex gap-3 items-center">
      <input
        type="number"
        placeholder="ID du membre (ex: 1)"
        value={membreId}
        onChange={(e) => setMembreId(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-48"
      />
      <button
        onClick={() => void telechargerFiche()}
        disabled={!membreId || loading}
        className="flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: VERT }}
      >
        {loading ? "Génération…" : "Télécharger fiche"}
      </button>
    </div>
  );
}

// ─── Reporting EUDR (pour responsable_tracabilite) ────────────────────────────
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) => fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } });

interface StatsRT {
  membresTotal: number;
  membresSansGps: number;
  demandesEnAttente: number;
  missionsSoumises: number;
  parcellesTotal: number;
  parcellesConformes: number;
  parcellesNonConformes: number;
  parcellesNonVerifiees: number;
  tauxEudrConforme: number;
  tauxCompletionGps: number;
}

interface ConformiteData {
  nb_parcelles_total: number;
  nb_conformes: number;
  nb_non_conformes: number;
  nb_non_verifiees: number;
  par_section: { section: string; total: number; conformes: number; pct: number }[];
}

function JaugePct({ pct, couleur }: { pct: number; couleur: string }) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>0%</span>
        <span className="font-semibold" style={{ color: couleur }}>{pct}%</span>
        <span>100%</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: couleur }}
        />
      </div>
    </div>
  );
}

function CarteStatRT({
  titre, valeur, sousTitre, couleur,
}: { titre: string; valeur: string; sousTitre?: string; couleur?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{titre}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: couleur ?? "#111827" }}>{valeur}</p>
      {sousTitre && <p className="text-xs text-gray-400 mt-0.5">{sousTitre}</p>}
    </div>
  );
}

function ReportingEudr() {
  const { data: stats, isLoading: sl } = useQuery<StatsRT>({
    queryKey: ["dashboard-tracabilite"],
    queryFn: async () => {
      const r = await apiFetch("/api/dashboard/tracabilite");
      if (!r.ok) throw new Error("Erreur");
      return r.json() as Promise<StatsRT>;
    },
  });

  const { data: conformite, isLoading: cl } = useQuery<ConformiteData>({
    queryKey: ["parcelles-conformite"],
    queryFn: async () => {
      const r = await apiFetch("/api/parcelles/conformite");
      if (!r.ok) return null;
      return r.json();
    },
  });

  const isLoading = sl || cl;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  const s: StatsRT = stats ?? {
    membresTotal: 0, membresSansGps: 0, demandesEnAttente: 0, missionsSoumises: 0,
    parcellesTotal: 0, parcellesConformes: 0, parcellesNonConformes: 0, parcellesNonVerifiees: 0,
    tauxEudrConforme: 0, tauxCompletionGps: 0,
  };

  const eudrCouleur = s.tauxEudrConforme >= 80 ? "#16a34a" : s.tauxEudrConforme >= 50 ? "#c4962a" : "#dc2626";
  const gpsCouleur  = s.tauxCompletionGps  >= 80 ? "#16a34a" : s.tauxCompletionGps  >= 50 ? "#c4962a" : "#dc2626";

  const pieData = [
    { name: "Conformes",      value: s.parcellesConformes,    fill: "#16a34a" },
    { name: "Non conformes",  value: s.parcellesNonConformes, fill: "#dc2626" },
    { name: "Non vérifiées",  value: s.parcellesNonVerifiees, fill: "#d1d5db" },
  ].filter((d) => d.value > 0);

  const parSections = (conformite?.par_section ?? []);
  const barData = parSections.map((s) => ({ section: s.section, "% Conforme": s.pct }));

  async function handleExportTerrainGeoJSON() {
    const r = await apiFetch("/api/parcelles/gps-terrain");
    if (!r.ok) return;
    const data = await r.json() as {
      polygones: {
        membreId: number; membreNom: string; membrePrenoms: string;
        village: string | null; section: string | null;
        missionId: number; missionTitre: string; statut: string;
        dateCollecte: string | null; superficieHa: string | null;
        polygone: [number, number][];
      }[];
    };
    const features = data.polygones.map(p => {
      const coords = p.polygone.map(([lat, lng]) => [lng, lat]);
      const ring = coords.length > 0 ? [...coords, coords[0]] : coords;
      return {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [ring] },
        properties: {
          membre_id:    p.membreId,
          nom_membre:   `${p.membreNom} ${p.membrePrenoms}`.trim(),
          village:      p.village ?? "",
          section:      p.section ?? "",
          superficie_ha: p.superficieHa ? parseFloat(String(p.superficieHa)) : 0,
          date_collecte: p.dateCollecte ? p.dateCollecte.slice(0, 10) : null,
          statut:       p.statut,
          mission_id:   p.missionId,
          mission_titre: p.missionTitre,
        },
      };
    });
    const geojson = {
      type: "FeatureCollection",
      features,
      metadata: {
        generated_at: new Date().toISOString(),
        total_parcelles: features.length,
        regulation: "EUDR (EU) 2023/1115",
      },
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gps_terrain_complet_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Taux de complétion */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Taux de complétion des fiches membres</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-2">Couverture GPS</p>
            <JaugePct pct={s.tauxCompletionGps} couleur={gpsCouleur} />
            <p className="text-xs text-gray-400 mt-1">
              {s.membresTotal - s.membresSansGps} membres géolocalisés sur {s.membresTotal}
              {s.membresSansGps > 0 && ` · ${s.membresSansGps} sans GPS`}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Conformité EUDR parcelles</p>
            <JaugePct pct={s.tauxEudrConforme} couleur={eudrCouleur} />
            <p className="text-xs text-gray-400 mt-1">
              {s.parcellesConformes} conformes sur {s.parcellesTotal} parcelles actives
            </p>
          </div>
        </div>
      </div>

      {/* KPIs résumé */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CarteStatRT titre="Membres actifs" valeur={String(s.membresTotal)} />
        <CarteStatRT titre="Sans GPS" valeur={String(s.membresSansGps)} couleur={s.membresSansGps > 0 ? "#c4962a" : "#16a34a"} sousTitre="à cartographier" />
        <CarteStatRT titre="Demandes en attente" valeur={String(s.demandesEnAttente)} couleur={s.demandesEnAttente > 0 ? "#c4962a" : "#16a34a"} />
        <CarteStatRT titre="Missions à valider" valeur={String(s.missionsSoumises)} couleur={s.missionsSoumises > 0 ? "#7c3aed" : "#16a34a"} sousTitre="données GPS soumises" />
      </div>

      {/* Parcelles EUDR — répartition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">Répartition EUDR — {s.parcellesTotal} parcelles</h2>
          {pieData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune parcelle active</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} parcelles`]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: "Conformes",     val: s.parcellesConformes,    col: "text-green-700",  bg: "bg-green-50 border-green-200" },
                  { label: "Non conformes", val: s.parcellesNonConformes, col: "text-red-700",    bg: "bg-red-50 border-red-200" },
                  { label: "Non vérifiées", val: s.parcellesNonVerifiees, col: "text-gray-700",   bg: "bg-gray-50 border-gray-200" },
                ].map((item) => (
                  <div key={item.label} className={`rounded-lg border text-center py-2 ${item.bg}`}>
                    <p className={`text-lg font-bold ${item.col}`}>{item.val}</p>
                    <p className="text-xs text-gray-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Par section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">Conformité EUDR par section</h2>
          {barData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune donnée de section</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="section" width={90} tick={{ fontSize: 11 }} />
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Conformité"]} />
                <Bar dataKey="% Conforme" fill="#16a34a" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry["% Conforme"] >= 80 ? "#16a34a" : entry["% Conforme"] >= 50 ? "#c4962a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tableau détaillé par section */}
      {parSections.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Détail par section — Rapport EUDR</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-5 py-3">Section</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="text-right px-5 py-3">Conformes</th>
                <th className="text-right px-5 py-3">Non conformes</th>
                <th className="text-right px-5 py-3">Taux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {parSections.map((sec) => (
                <tr key={sec.section} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{sec.section}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{sec.total}</td>
                  <td className="px-5 py-3 text-right text-green-700">{sec.conformes}</td>
                  <td className="px-5 py-3 text-right text-red-600">{sec.total - sec.conformes}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      sec.pct >= 80 ? "bg-green-100 text-green-800" :
                      sec.pct >= 50 ? "bg-amber-100 text-amber-800" :
                      "bg-red-100 text-red-800"
                    }`}>{sec.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Export GPS Terrain */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Export GPS Terrain — GeoJSON EUDR</h2>
            <p className="text-xs text-gray-500 mt-1">
              Télécharger tous les polygones GPS collectés par les agents terrain au format GeoJSON
              compatible avec QGIS et les outils de conformité EUDR (Règlement UE 2023/1115).
            </p>
          </div>
          <button
            onClick={handleExportTerrainGeoJSON}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition-colors"
          >
            <Download size={14} />
            Télécharger GeoJSON
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────
type Onglet = "dashboard" | "etats" | "rapports";

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "dashboard", label: "Tableau de bord financier" },
  { id: "etats", label: "États financiers" },
  { id: "rapports", label: "Rapports téléchargeables" },
];

export default function ReportingPage() {
  const { utilisateur } = useAuth();
  const [onglet, setOnglet] = useState<Onglet>("dashboard");

  if (utilisateur?.role === "responsable_tracabilite") {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Rapports EUDR</h1>
          <p className="text-sm text-gray-500 mt-1">
            Conformité parcelles, couverture GPS et taux de complétion des fiches membres
          </p>
        </div>
        <ReportingEudr />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Comptabilité & Reporting</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tableaux de bord financiers OHADA, états financiers et rapports PDF
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-full overflow-x-auto">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              onglet === o.id
                ? "bg-white shadow text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {onglet === "dashboard" && <TabDashboard />}
      {onglet === "etats" && <TabEtatsFinanciers />}
      {onglet === "rapports" && <TabRapports />}
    </div>
  );
}
