import { useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { useRoute, useLocation } from "wouter";
import {
  useGetMembreById,
  useGetMembreHistorique,
  useGetAvances,
  useGetPartsMembre,
  useEnregistrerLiberation,
  useGetScoringResume,
  useModifierStatutMembre,
  useListPaiements,
  getGetMembreByIdQueryKey,
  getGetMembreHistoriqueQueryKey,
  getGetAvancesQueryKey,
  getGetPartsMembreQueryKey,
  getGetScoringResumeQueryKey,
  getListPaiementsQueryKey,
  type LiberationInput,
  type PaiementListItem,
  ListPaiementsStatut,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, MapPin, Phone, Users, Leaf, Calendar, TrendingDown,
  Coins, Loader2, ChevronDown, ChevronUp, UserCheck, UserX, Gift,
  GraduationCap, Award, Download, Building2, User, Edit3, AlertTriangle,
  Satellite, CheckCircle2, XCircle, CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
const tokFn = () => localStorage.getItem("coop_token") ?? "";
const BASE_FICHE = import.meta.env.VITE_API_URL ?? "";

async function downloadPdf(path: string, filename: string) {
  const token = tokFn();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  if (blob.size === 0) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

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
      const r = await fetch(`${BASE_FICHE}/api/dons/membre/${membreId}`, {
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

// ── Interface parcelle GPS ────────────────────────────────────────────────────
interface ParcelleGps {
  id: number;
  codeParcelle: string;
  nomParcelle: string | null;
  superficieDeclareeHa: string | null;
  superficieCalculeeHa: string | null;
  eudrStatut: string | null;
  culturePrincipale: string | null;
  village: string | null;
}

const SEUIL_ALERTE_SUPERFICIE_PCT = 20;

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

const TABS = ["Avances", "Livraisons", "Impayées", "Parts sociales", "Score", "Dons reçus", "Formations", "Parcelles GPS"] as const;
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

  const impayeesParams = { statut: "en_attente" as ListPaiementsStatut, membre_id: id };
  const { data: paiementsImpayees = [], isLoading: impayeesLoading } = useListPaiements(impayeesParams, {
    query: { queryKey: getListPaiementsQueryKey(impayeesParams), enabled: !!id && activeTab === "Impayées" },
  });

  const { data: parcellesGps = [] } = useQuery<ParcelleGps[]>({
    queryKey: ["parcelles-membre-gps", id],
    queryFn: async () => {
      const r = await fetch(`${BASE_FICHE}/api/parcelles/membre/${id}`, {
        headers: { Authorization: `Bearer ${tokFn()}` },
      });
      if (!r.ok) return [];
      return r.json() as Promise<ParcelleGps[]>;
    },
    enabled: !!id,
  });

  const parcellesAvecGps = parcellesGps.filter((p) => p.superficieCalculeeHa !== null && p.superficieCalculeeHa !== undefined);
  const superficieGpsTotale = parcellesAvecGps.reduce((sum, p) => sum + parseFloat(p.superficieCalculeeHa!), 0);
  const superficieDeclareeNb = membre ? parseFloat(String(membre.superficieHa)) : 0;
  const diffSuperficiePct = superficieDeclareeNb > 0 && parcellesAvecGps.length > 0
    ? Math.abs(superficieGpsTotale - superficieDeclareeNb) / superficieDeclareeNb * 100
    : 0;
  const alerteSuperficieGps = parcellesAvecGps.length > 0 && diffSuperficiePct > SEUIL_ALERTE_SUPERFICIE_PCT;

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
        void qc.invalidateQueries({ queryKey: ["membres-list"] });
        void qc.invalidateQueries({ queryKey: ["membres-demandes"] });
      },
    },
  });
  const peutModifier = usePermission("membres", "modifier");
  const avanceEnCours = avancesData?.avances?.find((a) => a.statut === "en_cours");
  const { utilisateur } = useAuth();
  const peutTransferer = utilisateur?.role === "pca" || utilisateur?.role === "directeur" || utilisateur?.role === "responsable_tracabilite";

  // Modal édition infos membre
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [editForm, setEditForm] = useState<{
    nom: string; prenoms: string; telephone: string; village: string;
    groupement: string; superficieHa: string; sexe: string; numeroCni: string;
    carteProducteur: string;
    dateNaissance: string; dateAdhesion: string; typeFournisseur: string; nbrePartsSouscrites: string;
    superficieTotale: string; nombreParcelles: string;
  }>({ nom: "", prenoms: "", telephone: "", village: "", groupement: "", superficieHa: "", sexe: "", numeroCni: "", carteProducteur: "", dateNaissance: "", dateAdhesion: "", typeFournisseur: "", nbrePartsSouscrites: "", superficieTotale: "", nombreParcelles: "" });

  function openEditModal() {
    if (!membre) return;
    setEditForm({
      nom: membre.nom ?? "",
      prenoms: (membre.prenoms as string | null) ?? "",
      telephone: membre.telephone ?? "",
      village: (membre.village as string | null) ?? "",
      groupement: (membre.groupement as string | null) ?? "",
      superficieHa: membre.superficieHa ?? "",
      sexe: (membre.sexe as string | null) ?? "",
      numeroCni: (membre.numeroCni as string | null) ?? "",
      carteProducteur: (membre.carteProducteur as string | null) ?? "",
      dateNaissance: (membre.dateNaissance as string | null) ?? "",
      dateAdhesion: (membre.dateAdhesion as string | null) ?? "",
      typeFournisseur: (membre.typeFournisseur as string | null) ?? "",
      nbrePartsSouscrites: membre.nbrePartsSouscrites != null ? String(membre.nbrePartsSouscrites) : "",
      superficieTotale: (membre.superficieTotale as string | null) ?? "",
      nombreParcelles: (membre.nombreParcelles as number | null) != null ? String(membre.nombreParcelles) : "",
    });
    setShowEditModal(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditPending(true);
    try {
      const body: Record<string, string | number> = {};
      if (editForm.nom.trim())              body["nom"]               = editForm.nom.trim();
      if (editForm.prenoms.trim())          body["prenoms"]           = editForm.prenoms.trim();
      if (editForm.telephone.trim())        body["telephone"]         = editForm.telephone.trim();
      if (editForm.village.trim())          body["village"]           = editForm.village.trim();
      if (editForm.groupement.trim())       body["groupement"]        = editForm.groupement.trim();
      if (editForm.superficieHa.trim())     body["superficieHa"]      = editForm.superficieHa.trim();
      if (editForm.sexe)                    body["sexe"]              = editForm.sexe;
      if (editForm.numeroCni.trim())        body["numeroCni"]         = editForm.numeroCni.trim();
      if (editForm.carteProducteur.trim()) body["carteProducteur"]   = editForm.carteProducteur.trim();
      if (editForm.dateNaissance.trim())    body["dateNaissance"]     = editForm.dateNaissance.trim();
      if (editForm.dateAdhesion.trim())     body["dateAdhesion"]      = editForm.dateAdhesion.trim();
      if (editForm.typeFournisseur)         body["typeFournisseur"]   = editForm.typeFournisseur;
      if (editForm.nbrePartsSouscrites.trim()) body["nbrePartsSouscrites"] = parseFloat(editForm.nbrePartsSouscrites);
      if (editForm.superficieTotale.trim()) body["superficieTotale"] = editForm.superficieTotale.trim();
      if (editForm.nombreParcelles.trim())  body["nombreParcelles"]  = parseInt(editForm.nombreParcelles);
      const res = await fetch(`${BASE_FICHE}/api/membres/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokFn()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: (err as { erreur?: string }).erreur ?? "Erreur lors de la modification", variant: "destructive" });
        return;
      }
      toast({ title: "Informations mises à jour" });
      setShowEditModal(false);
      void qc.invalidateQueries({ queryKey: getGetMembreByIdQueryKey(id) });
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setEditPending(false);
    }
  }

  // Modal transfert rattachement
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferPending, setTransferPending] = useState(false);
  const [transferForm, setTransferForm] = useState<{ rattachementType: "delegue" | "base_centrale"; delegueId?: number }>({
    rattachementType: "delegue",
  });

  // Liste des délégués
  const { data: deleguesList = [] } = useQuery<Array<{ id: number; nom: string; prenoms: string; zoneNom: string | null; telephone: string | null }>>({
    queryKey: ["delegues-pour-fiche"],
    queryFn: async () => {
      const r = await fetch(`${BASE_FICHE}/api/membres/delegues-list`, { headers: { Authorization: `Bearer ${tokFn()}` } });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
  });

  async function handleTransfert(e: React.FormEvent) {
    e.preventDefault();
    if (!membre) return;
    if (transferForm.rattachementType === "delegue" && !transferForm.delegueId) return;
    setTransferPending(true);
    try {
      const res = await fetch(`${BASE_FICHE}/api/membres/${id}/rattachement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokFn()}` },
        body: JSON.stringify(transferForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: (err as { erreur?: string }).erreur ?? "Erreur lors du transfert", variant: "destructive" });
        return;
      }
      toast({ title: "Rattachement modifié avec succès" });
      setShowTransferModal(false);
      void qc.invalidateQueries({ queryKey: getGetMembreByIdQueryKey(id) });
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setTransferPending(false);
    }
  }

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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{membre.nom} {membre.prenoms}</h1>
            {peutModifier && (
              <button
                onClick={openEditModal}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-50 transition-colors"
              >
                <Edit3 size={11} />Modifier
              </button>
            )}
          </div>
          <div className="mt-1 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-sm font-mono font-bold">
              {membre.codeMembre ?? "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Phone size={13} />{membre.telephone}</span>
            {membre.village && <span className="flex items-center gap-1"><MapPin size={13} />{membre.village}</span>}
            {membre.groupement && <span className="flex items-center gap-1"><Users size={13} />{membre.groupement}</span>}
            <span className="flex items-center gap-1"><Leaf size={13} />{parseFloat(membre.superficieHa).toFixed(2)} ha déclarée</span>
            {parcellesAvecGps.length > 0 && (
              <span className={`flex items-center gap-1 font-medium ${alerteSuperficieGps ? "text-amber-600" : "text-green-600"}`}>
                <Satellite size={13} />
                {superficieGpsTotale.toFixed(2)} ha GPS
                {alerteSuperficieGps && (
                  <span title={`Écart de ${diffSuperficiePct.toFixed(0)}% avec la superficie déclarée`}>
                    <AlertTriangle size={12} className="text-amber-500" />
                  </span>
                )}
              </span>
            )}
            <span className="flex items-center gap-1"><Calendar size={13} />Adhésion : {formaterDate(membre.dateAdhesion)}</span>
            {(membre as unknown as Record<string, unknown>)["carteProducteur"] && (
              <span className="flex items-center gap-1">
                <CreditCard size={13} />
                Carte producteur : {String((membre as unknown as Record<string, unknown>)["carteProducteur"])}
              </span>
            )}
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
          {alerteSuperficieGps && (
            <button
              onClick={() => setActiveTab("Parcelles GPS")}
              className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1"
              title={`Écart de ${diffSuperficiePct.toFixed(0)}% entre superficie déclarée et GPS`}
            >
              <AlertTriangle size={11} />
              Écart superficie {diffSuperficiePct.toFixed(0)}%
            </button>
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

      {/* Rattachement */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 text-sm">Rattachement</h2>
          {peutTransferer && (
            <button
              onClick={() => {
                setTransferForm({
                  rattachementType: (membre.rattachementType as "delegue" | "base_centrale") ?? "delegue",
                  delegueId: membre.delegueId ?? undefined,
                });
                setShowTransferModal(true);
              }}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <Edit3 size={12} />
              Modifier
            </button>
          )}
        </div>

        {membre.rattachementType === "base_centrale" ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Base centrale</p>
              <p className="text-xs text-gray-500">Géré directement par la direction</p>
            </div>
          </div>
        ) : membre.delegueId ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-green-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {membre.delegueInfo
                  ? `${membre.delegueInfo.nom} ${membre.delegueInfo.prenoms}`
                  : `Délégué #${membre.delegueId}`}
              </p>
              {(membre.zoneNom ?? membre.delegueInfo?.zoneNom) && (
                <p className="text-xs text-gray-500">Zone : {membre.zoneNom ?? membre.delegueInfo?.zoneNom}</p>
              )}
              {membre.delegueInfo?.telephone && (
                <p className="text-xs text-gray-400">{membre.delegueInfo.telephone}</p>
              )}
              {membre.creeParDelegue && (
                <span className="inline-block mt-1 text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">Créé par ce délégué</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">Non assigné</p>
              <p className="text-xs text-gray-500">Ce membre n'a pas encore de rattachement</p>
            </div>
            {peutTransferer && (
              <button
                onClick={() => {
                  setTransferForm({ rattachementType: "delegue", delegueId: undefined });
                  setShowTransferModal(true);
                }}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100"
              >
                <Edit3 size={12} />
                Assigner
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Complétion fiche (2 groupes) ──────────────────────────────────────── */}
      {(() => {
        const m = membre as unknown as Record<string, unknown>;
        const ci = Number(m["completudeIdentite"] ?? m["completude_identite"] ?? 0);
        const ce = Number(m["completudeEudr"] ?? m["completude_eudr"] ?? 0);
        const mgr = Boolean(m["missionGpsRequise"] ?? m["mission_gps_requise"] ?? false);
        const colI = ci === 100 ? "bg-green-500" : ci >= 60 ? "bg-yellow-400" : "bg-red-400";
        const colE = ce === 100 ? "bg-green-500" : ce >= 60 ? "bg-blue-400" : "bg-gray-300";
        const campsA = [
          { label: "Nom", ok: !!membre.nom },
          { label: "Prénoms", ok: !!membre.prenoms },
          { label: "Téléphone", ok: !!membre.telephone },
          { label: "Village", ok: !!membre.village },
          { label: "Date de naissance", ok: !!(m["dateNaissance"] ?? m["date_naissance"]) },
          { label: "Sexe", ok: !!(m["sexe"]) },
          { label: "N° CNI", ok: !!(m["numeroCni"] ?? m["numero_cni"]) },
          { label: "Date d'adhésion", ok: !!(m["dateAdhesion"] ?? m["date_adhesion"]) },
          { label: "Type fournisseur", ok: !!(m["typeFournisseur"] ?? m["type_fournisseur"]) },
          { label: "Parts souscrites", ok: Number(m["nbrePartsSouscrites"] ?? m["nbre_parts_souscrites"] ?? 0) > 0 },
        ];
        const campsB = [
          { label: "Polygones GPS", ok: !!(m["gpsParcelles"] ?? m["gps_parcelles"]) },
          { label: "Superficie totale", ok: !!(m["superficieTotale"] ?? m["superficie_totale"]) },
          { label: "Nombre de parcelles", ok: !!(m["nombreParcelles"] ?? m["nombre_parcelles"]) },
        ];
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 text-sm">Complétion de la fiche</h2>
            {mgr && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Mission GPS requise</span> — Les données terrain (Groupe B) sont incomplètes. Une mission terrain doit être créée pour cartographier les parcelles.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Groupe A */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Groupe A — Identité</p>
                    <p className="text-[10px] text-gray-400">Requis pour activation</p>
                  </div>
                  <span className={`text-sm font-bold ${ci === 100 ? "text-green-600" : ci >= 60 ? "text-yellow-600" : "text-red-500"}`}>{ci}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${colI}`} style={{ width: `${ci}%` }} />
                </div>
                <div className="space-y-0.5">
                  {campsA.map((c) => (
                    <div key={c.label} className="flex items-center gap-1.5 text-xs">
                      {c.ok
                        ? <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                        : <XCircle size={11} className="text-red-400 shrink-0" />}
                      <span className={c.ok ? "text-gray-600" : "text-red-500"}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Groupe B */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Groupe B — EUDR / GPS</p>
                    <p className="text-[10px] text-gray-400">Requis pour conformité EUDR</p>
                  </div>
                  <span className={`text-sm font-bold ${ce === 100 ? "text-green-600" : ce >= 60 ? "text-blue-600" : "text-gray-400"}`}>{ce}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${colE}`} style={{ width: `${ce}%` }} />
                </div>
                <div className="space-y-0.5">
                  {campsB.map((c) => (
                    <div key={c.label} className="flex items-center gap-1.5 text-xs">
                      {c.ok
                        ? <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                        : <XCircle size={11} className="text-gray-300 shrink-0" />}
                      <span className={c.ok ? "text-gray-600" : "text-gray-400"}>{c.label}</span>
                    </div>
                  ))}
                </div>
                {ce === 100 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle2 size={13} className="text-green-500" />
                    <span className="text-xs text-green-700 font-medium">Conforme EUDR</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* QR Code */}
      {(() => {
        const portailUrl = `${window.location.origin}/portail/connexion?code=${encodeURIComponent(membre.codeMembre ?? "")}`;
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center gap-3 max-w-xs">
            <h2 className="font-semibold text-gray-900 text-sm w-full">QR Code membre</h2>
            <div className="p-3 bg-white border border-gray-100 rounded-lg">
              <QRCodeSVG value={portailUrl} size={140} />
            </div>
            <p className="text-xs text-gray-600 font-mono text-center font-semibold">{membre.codeMembre}</p>
            <p className="text-[10px] text-gray-400 text-center">Scanner pour ouvrir l'espace membre</p>
          </div>
        );
      })()}

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
                  <div className="flex items-center gap-2">
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
                    <button
                      title="Reçu d'avance"
                      onClick={() => void downloadPdf(`/api/rapports/recu/avance/${a.id}`, `recu_avance_${a.id}.pdf`)}
                      className="p-1 text-gray-400 hover:text-green-700 transition-colors"
                    >
                      <Download size={14} />
                    </button>
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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!historique?.livraisons || historique.livraisons.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-8">Aucune livraison</td>
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
                      <td className="px-4 py-3 text-center">
                        <button
                          title="Reçu livraison"
                          onClick={() => void downloadPdf(`/api/rapports/recu/livraison/${l.id}`, `recu_livraison_${l.id}.pdf`)}
                          className="p-1 text-gray-400 hover:text-green-700 transition-colors"
                        >
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Livraisons impayées */}
        {activeTab === "Impayées" && (
          <div className="overflow-x-auto">
            {impayeesLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
            ) : (paiementsImpayees as PaiementListItem[]).length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Aucune livraison impayée</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Date livraison</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Montant dû</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(paiementsImpayees as PaiementListItem[]).map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {p.dateLivraison ? formaterDate(p.dateLivraison) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-700">
                        {formaterFCFA(p.montantFcfa)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => navigate(`/reglements?paiementId=${p.id}`)}
                          className="text-xs font-medium text-white px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: "#1a4731" }}
                        >
                          Payer maintenant
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
                {/* Bouton état PDF */}
                <div className="flex justify-end">
                  <button
                    onClick={() => void downloadPdf(`/api/rapports/recu/parts/${id}`, `parts_sociales_${id}.pdf`)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                  >
                    <Download size={13} />
                    Télécharger l'état des parts
                  </button>
                </div>
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
                            <MoneyInput
                              className={INPUT_CLS}
                              value={String(liberationForm.montantFcfa ?? "")}
                              onChange={(raw) => setLiberationForm((f) => ({ ...f, montantFcfa: raw ? parseInt(raw) : 0 }))}
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

        {/* Parcelles GPS */}
        {activeTab === "Parcelles GPS" && (
          <div className="divide-y">
            {/* Résumé GPS */}
            <div className="px-5 py-4 bg-green-50">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-700">{parcellesGps.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">parcelle(s)</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-700">{parcellesAvecGps.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">avec GPS</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {parcellesAvecGps.length > 0 ? superficieGpsTotale.toFixed(2) : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">ha GPS total</p>
                </div>
              </div>
              {parcellesAvecGps.length > 0 && (
                <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                  alerteSuperficieGps
                    ? "bg-amber-100 text-amber-800"
                    : "bg-green-100 text-green-800"
                }`}>
                  {alerteSuperficieGps ? (
                    <AlertTriangle size={13} className="shrink-0" />
                  ) : (
                    <CheckCircle2 size={13} className="shrink-0" />
                  )}
                  <span>
                    Superficie déclarée : <strong>{superficieDeclareeNb.toFixed(2)} ha</strong>
                    {" · "}Superficie GPS : <strong>{superficieGpsTotale.toFixed(2)} ha</strong>
                    {" · "}Écart : <strong>{diffSuperficiePct.toFixed(1)}%</strong>
                    {alerteSuperficieGps && ` — dépasse le seuil de ${SEUIL_ALERTE_SUPERFICIE_PCT}%`}
                  </span>
                </div>
              )}
            </div>

            {/* Tableau des parcelles */}
            {parcellesGps.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Satellite className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucune parcelle enregistrée pour ce membre</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Code</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Village</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Culture</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Sup. déclarée</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Sup. GPS</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">Écart</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">EUDR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parcellesGps.map((p) => {
                      const dec = p.superficieDeclareeHa ? parseFloat(p.superficieDeclareeHa) : null;
                      const gps = p.superficieCalculeeHa ? parseFloat(p.superficieCalculeeHa) : null;
                      const ecart = dec && gps && dec > 0 ? Math.abs(gps - dec) / dec * 100 : null;
                      const ecartAlerte = ecart !== null && ecart > SEUIL_ALERTE_SUPERFICIE_PCT;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{p.codeParcelle}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{p.village ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{p.culturePrincipale ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-gray-600">
                            {dec !== null ? `${dec.toFixed(2)} ha` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-right font-medium text-green-700">
                            {gps !== null ? (
                              <span className="flex items-center justify-end gap-1">
                                <Satellite size={11} />
                                {gps.toFixed(2)} ha
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-center">
                            {ecart !== null ? (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                                ecartAlerte ? "bg-amber-100 text-amber-700" : "bg-green-50 text-green-700"
                              }`}>
                                {ecartAlerte ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                                {ecart.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {p.eudrStatut ? (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                p.eudrStatut === "conforme"
                                  ? "bg-green-100 text-green-700"
                                  : p.eudrStatut === "non_conforme"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}>
                                {p.eudrStatut === "conforme" ? (
                                  <CheckCircle2 size={10} />
                                ) : p.eudrStatut === "non_conforme" ? (
                                  <XCircle size={10} />
                                ) : null}
                                {p.eudrStatut === "conforme" ? "Conforme" : p.eudrStatut === "non_conforme" ? "Non conforme" : "Non vérifié"}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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

      {/* Modal transfert rattachement */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Modifier le rattachement</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleTransfert} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Type de rattachement</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="tr_type" value="delegue"
                      checked={transferForm.rattachementType === "delegue"}
                      onChange={() => setTransferForm({ rattachementType: "delegue", delegueId: undefined })}
                      className="accent-green-700"
                    />
                    <span className="text-sm text-gray-700">Délégué de localité</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="tr_type" value="base_centrale"
                      checked={transferForm.rattachementType === "base_centrale"}
                      onChange={() => setTransferForm({ rattachementType: "base_centrale", delegueId: undefined })}
                      className="accent-green-700"
                    />
                    <span className="text-sm text-gray-700">Base centrale</span>
                  </label>
                </div>
              </div>

              {transferForm.rattachementType === "delegue" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Délégué responsable *</label>
                  <select
                    value={transferForm.delegueId ?? ""}
                    onChange={(e) => setTransferForm({ ...transferForm, delegueId: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Sélectionner un délégué…</option>
                    {deleguesList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom} {d.prenoms}{d.zoneNom ? ` — ${d.zoneNom}` : ""}
                      </option>
                    ))}
                  </select>
                  {transferForm.delegueId && (() => {
                    const d = deleguesList.find((d) => d.id === transferForm.delegueId);
                    return d ? (
                      <div className="mt-2 bg-green-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                        <span className="font-medium text-gray-800">{d.nom} {d.prenoms}</span>
                        {d.zoneNom && <span className="ml-2 text-gray-500">Zone : {d.zoneNom}</span>}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {transferForm.rattachementType === "base_centrale" && (
                <div className="bg-purple-50 rounded-lg px-3 py-2.5 text-xs text-purple-700">
                  <Building2 size={12} className="inline mr-1" />
                  Ce membre sera transféré vers la direction. Un SMS sera envoyé à l'ancien délégué.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={transferPending || (transferForm.rattachementType === "delegue" && !transferForm.delegueId)}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  {transferPending ? "Transfert en cours…" : "Confirmer le transfert"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal édition infos membre */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Modifier les informations</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleEdit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                  <input
                    required
                    value={editForm.nom}
                    onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prénoms *</label>
                  <input
                    required
                    value={editForm.prenoms}
                    onChange={e => setEditForm(f => ({ ...f, prenoms: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone *</label>
                  <input
                    required
                    value={editForm.telephone}
                    onChange={e => setEditForm(f => ({ ...f, telephone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Village</label>
                  <input
                    value={editForm.village}
                    onChange={e => setEditForm(f => ({ ...f, village: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Groupement</label>
                  <input
                    value={editForm.groupement}
                    onChange={e => setEditForm(f => ({ ...f, groupement: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Superficie déclarée (ha)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.superficieHa}
                    onChange={e => setEditForm(f => ({ ...f, superficieHa: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sexe</label>
                  <select
                    value={editForm.sexe}
                    onChange={e => setEditForm(f => ({ ...f, sexe: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  >
                    <option value="">— Non renseigné —</option>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° CNI / Identité</label>
                  <input
                    value={editForm.numeroCni}
                    onChange={e => setEditForm(f => ({ ...f, numeroCni: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° Carte producteur</label>
                  <input
                    value={editForm.carteProducteur}
                    onChange={e => setEditForm(f => ({ ...f, carteProducteur: e.target.value }))}
                    placeholder="Ex: CI-2024-00123"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date de naissance</label>
                  <input
                    type="date"
                    value={editForm.dateNaissance}
                    onChange={e => setEditForm(f => ({ ...f, dateNaissance: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date d'adhésion</label>
                  <input
                    type="date"
                    value={editForm.dateAdhesion}
                    onChange={e => setEditForm(f => ({ ...f, dateAdhesion: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type fournisseur</label>
                  <select
                    value={editForm.typeFournisseur}
                    onChange={e => setEditForm(f => ({ ...f, typeFournisseur: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  >
                    <option value="">— Non renseigné —</option>
                    <option value="membre">Membre</option>
                    <option value="pisteur">Pisteur</option>
                    <option value="externe">Externe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Parts souscrites</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.nbrePartsSouscrites}
                    onChange={e => setEditForm(f => ({ ...f, nbrePartsSouscrites: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>

              {/* Groupe B — EUDR / GPS */}
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50 space-y-3">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Groupe B — EUDR / GPS</p>
                <p className="text-xs text-amber-700">Les polygones GPS sont collectés par les agents terrain. Superficie totale et nombre de parcelles peuvent être saisis manuellement.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Superficie totale (ha)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.superficieTotale}
                      onChange={e => setEditForm(f => ({ ...f, superficieTotale: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de parcelles</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editForm.nombreParcelles}
                      onChange={e => setEditForm(f => ({ ...f, nombreParcelles: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={editPending}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  {editPending ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
