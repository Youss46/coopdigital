import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetMembreById,
  useGetMembreHistorique,
  useGetAvances,
  useGetPartsMembre,
  useEnregistrerLiberation,
  useGetScoringResume,
  useModifierStatutMembre,
  getGetMembreByIdQueryKey,
  getGetMembreHistoriqueQueryKey,
  getGetAvancesQueryKey,
  getGetPartsMembreQueryKey,
  getGetScoringResumeQueryKey,
  type LiberationInput,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, MapPin, Phone, Users, Leaf, Calendar, TrendingDown,
  Coins, Plus, Loader2, ChevronDown, ChevronUp, UserCheck, UserX, Gift,
  GraduationCap, Award, Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";

// ── Helpers ───────────────────────────────────────────────────────────────────
const tokFn = () => localStorage.getItem("coop_token") ?? "";
const BASE_FICHE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Composant formations d'un membre ─────────────────────────────────────────
interface FormationMembre {
  session_id: number; titre: string; thematique: string | null;
  date_session: string; duree_heures: string | null;
  statut: string; numero_attestation: string | null; pdf_url: string | null;
}

interface FormationsMembreStats {
  nbFormations: number; heuresTotales: number;
  thematiques: string[]; formations: FormationMembre[];
}

const THEMATIQUES_FICHE: Record<string, string> = {
  bonnes_pratiques: "Bonnes pratiques", qualite_cacao: "Qualité du cacao",
  eudr: "EUDR", gestion_financiere: "Gestion financière",
  sante_securite: "Santé & sécurité", agroforesterie: "Agroforesterie",
  certification: "Certification", numerique: "Numérique",
};

const PRESENCE_COLORS_FICHE: Record<string, string> = {
  inscrit: "bg-blue-100 text-blue-700", present: "bg-green-100 text-green-700",
  absent:  "bg-red-100 text-red-700",  excuse:  "bg-yellow-100 text-yellow-700",
};

function FormationsMembre({ membreId }: { membreId: number }) {
  const { data, isLoading } = useQuery<FormationsMembreStats>({
    queryKey: ["formations-membre", membreId],
    queryFn: async () => {
      const r = await fetch(`${BASE_FICHE}/api/formations/membre/${membreId}`, {
        headers: { Authorization: `Bearer ${tokFn()}` },
      });
      if (!r.ok) throw new Error("Erreur chargement formations");
      return r.json() as Promise<FormationsMembreStats>;
    },
    enabled: !!membreId,
  });

  function downloadAttestation(sessionId: number) {
    const a = document.createElement("a");
    a.href = `${BASE_FICHE}/api/formations/sessions/${sessionId}/attestation/${membreId}`;
    a.setAttribute("download", `attestation-${sessionId}-${membreId}.pdf`);
    a.click();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 size={18} className="animate-spin mr-2" />Chargement…
      </div>
    );
  }

  const formations = data?.formations ?? [];

  if (formations.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Aucune formation enregistrée pour ce membre</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {/* Résumé */}
      <div className="px-5 py-4 bg-green-50 grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-700">{data?.nbFormations ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">formation(s)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-700">{data?.heuresTotales ?? 0}h</p>
          <p className="text-xs text-gray-500 mt-0.5">heures</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-700">{formations.filter((f) => f.numero_attestation).length}</p>
          <p className="text-xs text-gray-500 mt-0.5">attestation(s)</p>
        </div>
      </div>

      {/* Tableau des formations */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Date</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Formation</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Thématique</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">Durée</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">Statut</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">Attestation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {formations.map((f) => (
              <tr key={f.session_id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(f.date_session + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-2.5 font-medium text-gray-900 max-w-40 truncate">{f.titre}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {f.thematique ? (THEMATIQUES_FICHE[f.thematique] ?? f.thematique) : "—"}
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                  {f.duree_heures ? `${f.duree_heures}h` : "—"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PRESENCE_COLORS_FICHE[f.statut] ?? "bg-gray-100 text-gray-600"}`}>
                    {f.statut}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {f.numero_attestation ? (
                    <button onClick={() => downloadAttestation(f.session_id)}
                      title={f.numero_attestation}
                      className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 transition-colors">
                      <Award className="w-3.5 h-3.5" />
                      <Download className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Composant dons reçus d'un membre ─────────────────────────────────────────

interface DonMembre {
  id: number; reference?: string; libelle: string; dateDon: string;
  forme: string; montantFcfa?: string; valeurEstimeeFcfa?: string;
  categorieLibelle?: string;
}

function DonsRecusMembre({ membreId }: { membreId: number }) {
  const { data, isLoading } = useQuery<{ dons: DonMembre[]; totalRecu: number }>({
    queryKey: ["dons-membre", membreId],
    queryFn: async () => {
      const r = await fetch(`/api/dons/membre/${membreId}`, {
        headers: { Authorization: `Bearer ${tokFn()}` },
      });
      if (!r.ok) throw new Error("Erreur chargement dons");
      return r.json() as Promise<{ dons: DonMembre[]; totalRecu: number }>;
    },
    enabled: !!membreId,
  });

  const FCFA = (n: number | string) =>
    new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " F";

  const montant = (d: DonMembre) =>
    d.forme === "especes"
      ? parseFloat(d.montantFcfa ?? "0")
      : parseFloat(d.valeurEstimeeFcfa ?? "0");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 size={18} className="animate-spin mr-2" /> Chargement…
      </div>
    );
  }

  const dons = data?.dons ?? [];
  const total = data?.totalRecu ?? 0;

  if (dons.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Aucun don enregistré pour ce membre</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {/* Total */}
      <div className="px-5 py-4 bg-green-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-700">
          <Gift size={16} />
          <span className="text-sm font-semibold">Total dons reçus</span>
        </div>
        <span className="text-lg font-bold text-green-700">{FCFA(total)}</span>
      </div>
      {dons.map((d) => (
        <div key={d.id} className="flex items-start justify-between px-5 py-3.5">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{d.libelle}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {String(d.dateDon).slice(0, 10)}
              {d.reference && <> · <span className="font-mono">{d.reference}</span></>}
              {d.categorieLibelle && <> · {d.categorieLibelle}</>}
              <> · {d.forme === "especes" ? "Espèces" : "Nature"}</>
            </div>
          </div>
          <div className="ml-4 text-sm font-semibold text-green-700 shrink-0">{FCFA(montant(d))}</div>
        </div>
      ))}
    </div>
  );
}

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const BTN_CLS =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors";

function formaterFCFA(montant: number) {
  return new Intl.NumberFormat("fr-FR").format(montant) + " FCFA";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const TABS = ["Avances", "Livraisons", "Parts sociales", "Score", "Dons reçus", "Formations"] as const;
type Tab = (typeof TABS)[number];

const NIVEAUX_SCORE: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  platine:    { label: "Platine",    color: "text-purple-700", bg: "bg-purple-100",  emoji: "💎" },
  or:         { label: "Or",         color: "text-yellow-700", bg: "bg-yellow-100",  emoji: "🥇" },
  argent:     { label: "Argent",     color: "text-gray-600",   bg: "bg-gray-100",    emoji: "🥈" },
  bronze:     { label: "Bronze",     color: "text-orange-700", bg: "bg-orange-100",  emoji: "🥉" },
  non_classe: { label: "Non classé", color: "text-slate-500",  bg: "bg-slate-100",   emoji: "📋" },
};

export default function MembreFiche() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/membres/:id");
  const id = parseInt(params?.id ?? "0");
  const { toast } = useToast();
  const qc = useQueryClient();
  const peutLiberer = usePermission("parts_sociales", "enregistrer_versement");

  const [activeTab, setActiveTab] = useState<Tab>("Avances");
  const [showLiberationForm, setShowLiberationForm] = useState(false);
  const [liberationForm, setLiberationForm] = useState<Partial<LiberationInput>>({
    dateVersement: new Date().toISOString().slice(0, 10),
  });

  const { data: membre, isLoading } = useGetMembreById(id, {
    query: { queryKey: getGetMembreByIdQueryKey(id), enabled: !!id },
  });
  const { data: historique } = useGetMembreHistorique(id, {
    query: { queryKey: getGetMembreHistoriqueQueryKey(id), enabled: !!id },
  });
  const { data: avancesData } = useGetAvances({ membre_id: id }, {
    query: { queryKey: getGetAvancesQueryKey({ membre_id: id }), enabled: !!id },
  });
  const { data: partsData, isLoading: partsLoading } = useGetPartsMembre(id, {
    query: { queryKey: getGetPartsMembreQueryKey(id), enabled: !!id && activeTab === "Parts sociales" },
  });
  const { data: scoreResume } = useGetScoringResume(id, {
    query: { queryKey: getGetScoringResumeQueryKey(id), enabled: !!id },
  });

  const liberationMut = useEnregistrerLiberation();
  const statutMut = useModifierStatutMembre({
    mutation: {
      onMutate: async ({ id: membreId, data }) => {
        await qc.cancelQueries({ queryKey: getGetMembreByIdQueryKey(membreId) });
        const prev = qc.getQueryData(getGetMembreByIdQueryKey(membreId));
        qc.setQueryData(getGetMembreByIdQueryKey(membreId), (old: unknown) =>
          old && typeof old === "object" ? { ...(old as object), statut: data.statut } : old,
        );
        return { prev };
      },
      onError: (_err, { id: membreId }, context) => {
        qc.setQueryData(getGetMembreByIdQueryKey(membreId), (context as { prev: unknown } | undefined)?.prev);
        toast({ title: "Erreur lors du changement de statut", variant: "destructive" });
      },
      onSettled: (_data, _err, { id: membreId }) => {
        void qc.invalidateQueries({ queryKey: getGetMembreByIdQueryKey(membreId) });
      },
    },
  });
  const peutModifier = usePermission("membres", "modifier");
  const avanceEnCours = avancesData?.avances?.find((a) => a.statut === "en_cours");

  function handleToggleStatut() {
    if (!membre) return;
    const nouveauStatut = membre.statut === "actif" ? "inactif" : "actif";
    statutMut.mutate({ id, data: { statut: nouveauStatut } }, {
      onSuccess: () => toast({ title: `Membre ${nouveauStatut === "actif" ? "réactivé" : "désactivé"} avec succès` }),
    });
  }

  if (!match) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!membre) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Membre introuvable</p>
        <button onClick={() => navigate("/membres")} className="mt-3 text-sm text-blue-500 hover:underline">
          ← Retour à la liste
        </button>
      </div>
    );
  }

  const soldeCredit = avanceEnCours ? avanceEnCours.soldeRestantFcfa : 0;

  async function handleLiberation(e: React.FormEvent) {
    e.preventDefault();
    if (!liberationForm.montantFcfa || !liberationForm.dateVersement) return;
    try {
      await liberationMut.mutateAsync({
        data: { ...liberationForm, membreId: id } as LiberationInput,
      });
      toast({ title: "Versement enregistré avec succès" });
      setShowLiberationForm(false);
      setLiberationForm({ dateVersement: new Date().toISOString().slice(0, 10) });
      void qc.invalidateQueries({ queryKey: getGetPartsMembreQueryKey(id) });
    } catch {
      toast({ title: "Erreur lors de l'enregistrement", variant: "destructive" });
    }
  }

  const pctLibere = partsData
    ? partsData.membre.totalSouscritFcfa > 0
      ? Math.round((partsData.membre.totalLibereFcfa / partsData.membre.totalSouscritFcfa) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Navigation */}
      <button
        onClick={() => navigate("/membres")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={15} />
        Retour à la liste
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-6">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
          style={{ backgroundColor: "#1a4731" }}
        >
          {membre.nom[0]}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{membre.nom} {membre.prenoms}</h1>
          <div className="mt-1 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-sm font-mono font-bold">
              {membre.codeMembre ?? "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Phone size={13} />{membre.telephone}</span>
            {membre.village && <span className="flex items-center gap-1"><MapPin size={13} />{membre.village}</span>}
            {membre.groupement && <span className="flex items-center gap-1"><Users size={13} />{membre.groupement}</span>}
            <span className="flex items-center gap-1"><Leaf size={13} />{parseFloat(membre.superficieHa).toFixed(2)} ha</span>
            <span className="flex items-center gap-1"><Calendar size={13} />Adhésion : {formaterDate(membre.dateAdhesion)}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              membre.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {membre.statut === "actif" ? "Actif" : "Inactif"}
          </span>
          {peutModifier && (
            <button
              onClick={handleToggleStatut}
              disabled={statutMut.isPending}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                membre.statut === "actif"
                  ? "bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600"
                  : "bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              {statutMut.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : membre.statut === "actif" ? (
                <UserX className="w-3 h-3" />
              ) : (
                <UserCheck className="w-3 h-3" />
              )}
              {membre.statut === "actif" ? "Désactiver" : "Réactiver"}
            </button>
          )}
          {soldeCredit > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
              <TrendingDown size={11} />
              {formaterFCFA(soldeCredit)} dû
            </span>
          )}
          {scoreResume && (() => {
            const resume = scoreResume as { niveau?: string; score_global?: string | number };
            const niv = resume.niveau ?? "non_classe";
            const n = NIVEAUX_SCORE[niv] ?? NIVEAUX_SCORE.non_classe!;
            return (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${n.bg} ${n.color} flex items-center gap-1`}>
                {n.emoji} {n.label} · {Math.round(Number(resume.score_global ?? 0))}/100
              </span>
            );
          })()}
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center gap-3 max-w-xs">
        <h2 className="font-semibold text-gray-900 text-sm w-full">QR Code membre</h2>
        <div className="p-3 bg-white border border-gray-100 rounded-lg">
          <QRCodeSVG value={membre.qrCodeToken} size={140} />
        </div>
        <p className="text-xs text-gray-400 font-mono text-center break-all">{membre.qrCodeToken}</p>
      </div>

      {/* Onglets */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-green-600 text-green-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Avances */}
        {activeTab === "Avances" && (
          <div className="divide-y divide-gray-50">
            {!historique?.avances || historique.avances.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune avance</p>
            ) : (
              historique.avances.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formaterFCFA(a.montantOctroyeFcfa)}</p>
                    <p className="text-xs text-gray-400">
                      {formaterDate(a.dateOctroi)}
                      {a.motif ? ` · ${a.motif}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.statut === "rembourse"
                          ? "bg-green-100 text-green-700"
                          : a.statut === "en_retard"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                    </span>
                    {a.statut !== "rembourse" && (
                      <p className="text-xs text-gray-500 mt-0.5">Solde : {formaterFCFA(a.soldeRestantFcfa)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Livraisons */}
        {activeTab === "Livraisons" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Poids (kg)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Prix/kg</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Montant brut</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Avance déduite</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Net payé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!historique?.livraisons || historique.livraisons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-8">Aucune livraison</td>
                  </tr>
                ) : (
                  historique.livraisons.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formaterDate(l.dateLivraison)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{Number(l.poidsKg).toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{l.prixUnitaireFcfa}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formaterFCFA(l.montantBrutFcfa)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">
                        {l.avanceDeduiteFcfa > 0 ? `-${formaterFCFA(l.avanceDeduiteFcfa)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{formaterFCFA(l.montantNetFcfa)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Parts sociales */}
        {activeTab === "Parts sociales" && (
          <div className="p-5 space-y-5">
            {partsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-green-600" />
              </div>
            ) : partsData ? (
              <>
                {/* Résumé */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Parts souscrites", value: partsData.membre.nbrePartsSouscrites, suffix: " parts" },
                    { label: "Montant souscrit", value: formaterFCFA(partsData.membre.totalSouscritFcfa), suffix: "" },
                    { label: "Total libéré", value: formaterFCFA(partsData.membre.totalLibereFcfa), suffix: "" },
                    { label: "Reste à libérer", value: formaterFCFA(partsData.membre.resteALibererFcfa), suffix: "" },
                  ].map((k) => (
                    <div key={k.label} className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">{k.label}</div>
                      <div className="font-semibold text-gray-900 text-sm">{k.value}{k.suffix}</div>
                    </div>
                  ))}
                </div>

                {/* Barre de progression */}
                {partsData.membre.totalSouscritFcfa > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progression libération</span>
                      <span>{pctLibere}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${pctLibere}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Valeur nominale : {formaterFCFA(partsData.config.valeurNominaleFcfa)} / part
                    </div>
                  </div>
                )}

                {/* Bouton nouveau versement */}
                {peutLiberer && partsData.membre.resteALibererFcfa > 0 && (
                  <div>
                    <button
                      onClick={() => setShowLiberationForm((v) => !v)}
                      className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700`}
                    >
                      <Coins className="w-4 h-4" />
                      Enregistrer un versement
                      {showLiberationForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showLiberationForm && (
                      <form onSubmit={handleLiberation} className="mt-3 bg-green-50 rounded-lg p-4 space-y-3 border border-green-200">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Montant FCFA *</label>
                            <input
                              type="number"
                              className={INPUT_CLS}
                              placeholder={`Max: ${formaterFCFA(partsData.membre.resteALibererFcfa)}`}
                              max={partsData.membre.resteALibererFcfa}
                              value={liberationForm.montantFcfa ?? ""}
                              onChange={(e) => setLiberationForm((f) => ({ ...f, montantFcfa: parseInt(e.target.value) }))}
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Date versement *</label>
                            <input
                              type="date"
                              className={INPUT_CLS}
                              value={liberationForm.dateVersement ?? ""}
                              onChange={(e) => setLiberationForm((f) => ({ ...f, dateVersement: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Code libération</label>
                            <input
                              className={INPUT_CLS}
                              placeholder="Optionnel"
                              value={liberationForm.codeLiberation ?? ""}
                              onChange={(e) => setLiberationForm((f) => ({ ...f, codeLiberation: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Mode versement</label>
                            <input
                              className={INPUT_CLS}
                              placeholder="Ex: espèces, banque…"
                              value={liberationForm.versement ?? ""}
                              onChange={(e) => setLiberationForm((f) => ({ ...f, versement: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3">
                          <button type="button" onClick={() => setShowLiberationForm(false)} className={`${BTN_CLS} bg-white text-gray-700 border border-gray-200 hover:bg-gray-50`}>
                            Annuler
                          </button>
                          <button type="submit" disabled={liberationMut.isPending} className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700 disabled:opacity-50`}>
                            {liberationMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            Enregistrer
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Historique des versements */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Historique des versements</h3>
                  {partsData.liberations.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Aucun versement enregistré</p>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                      {partsData.liberations.map((lib) => (
                        <div key={lib.id} className="flex items-center justify-between px-4 py-3 bg-white">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{formaterFCFA(lib.montantFcfa)}</div>
                            <div className="text-xs text-gray-500">
                              {formaterDate(lib.dateVersement)}
                              {lib.codeLiberation && ` · ${lib.codeLiberation}`}
                              {lib.versement && ` · ${lib.versement}`}
                            </div>
                          </div>
                          <Coins className="w-4 h-4 text-green-500" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <Coins className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Aucune souscription de parts sociales
              </div>
            )}
          </div>
        )}
        {/* Dons reçus */}
        {activeTab === "Dons reçus" && <DonsRecusMembre membreId={id} />}

        {/* Formations */}
        {activeTab === "Formations" && <FormationsMembre membreId={id} />}

        {/* Score */}
        {activeTab === "Score" && (
          <div className="p-5 space-y-5">
            {!scoreResume ? (
              <p className="text-center text-gray-400 text-sm py-8">Score non calculé pour ce membre.</p>
            ) : (() => {
              const r = scoreResume as {
                niveau?: string;
                score_global?: string | number;
                rang?: number | null;
                details?: Array<{ composante: string; valeur: number; score: number; poids: number }>;
                dernier_recalcul?: string | null;
              };
              const niv = r.niveau ?? "non_classe";
              const n = NIVEAUX_SCORE[niv] ?? NIVEAUX_SCORE.non_classe!;
              const score = Math.round(Number(r.score_global ?? 0));
              const details = r.details ?? [];
              const COMPOSANTE_LABELS: Record<string, string> = {
                livraisons:         "Régularité des livraisons",
                volume:             "Volume livré",
                qualite:            "Qualité du cacao",
                remboursement:      "Remboursement des avances",
                anciennete:         "Ancienneté",
                superficie:         "Superficie exploitée",
              };
              return (
                <>
                  {/* Résumé */}
                  <div className="flex items-center gap-4">
                    <div className="text-center flex-shrink-0">
                      <div
                        className="w-20 h-20 rounded-full flex flex-col items-center justify-center border-4"
                        style={{
                          borderColor: score >= 75 ? "#16a34a" : score >= 50 ? "#ca8a04" : score >= 30 ? "#ea580c" : "#9ca3af",
                        }}
                      >
                        <span className="text-2xl font-bold text-gray-900">{score}</span>
                        <span className="text-xs text-gray-400">/100</span>
                      </div>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${n.bg} ${n.color}`}>
                        {n.emoji} {n.label}
                      </span>
                      {r.rang != null && (
                        <p className="text-sm text-gray-500 mt-1">Rang #{r.rang} dans la coopérative</p>
                      )}
                      {r.dernier_recalcul && (
                        <p className="text-xs text-gray-400 mt-0.5">Calculé le {formaterDate(r.dernier_recalcul)}</p>
                      )}
                    </div>
                  </div>

                  {/* Détails des composantes */}
                  {details.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Détail des composantes</h3>
                      <div className="space-y-3">
                        {details.map((d) => {
                          const scoreComp = Math.round(d.score * d.poids);
                          const maxComp = Math.round(100 * d.poids);
                          const pct = maxComp > 0 ? Math.min(100, Math.round((scoreComp / maxComp) * 100)) : 0;
                          return (
                            <div key={d.composante}>
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>{COMPOSANTE_LABELS[d.composante] ?? d.composante}</span>
                                <span className="font-medium">{Math.round(d.score)}/100 · poids {Math.round(d.poids * 100)}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: pct >= 70 ? "#16a34a" : pct >= 40 ? "#ca8a04" : "#ef4444",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
