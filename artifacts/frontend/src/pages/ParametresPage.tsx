import { useState, useRef, useCallback } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetConfig,
  useUpdateConfig,
  useUploadLogo,
  useGetDocumentsOfficiels,
  useCreateDocumentOfficiel,
  useDeleteDocumentOfficiel,
  getGetConfigQueryKey,
  getGetDocumentsOfficielsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Save,
  Building2,
  FileText,
  Settings2,
  FolderOpen,
  Trash2,
  Plus,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  FileDown,
} from "lucide-react";

// ── Composant aperçu en-tête PDF ──────────────────────────────────────────────

interface PdfHeaderPreviewProps {
  logoUrl: string | null | undefined;
  nomComplet: string;
  slogan: string;
  adresse: string;
  ville: string;
  telephone: string;
  email: string;
  numeroAgrement: string;
  couleurPrimaire: string;
  piedDePagePdf: string;
  nomCompletFallback: string;
  titreDocument?: string;
}

function PdfHeaderPreview({
  logoUrl,
  nomComplet,
  slogan,
  adresse,
  ville,
  telephone,
  email,
  numeroAgrement,
  couleurPrimaire,
  piedDePagePdf,
  nomCompletFallback,
  titreDocument = "RAPPORT MENSUEL",
}: PdfHeaderPreviewProps) {
  const couleur = couleurPrimaire || "#1a4731";
  const infoLines: string[] = [];
  if (adresse) infoLines.push(adresse);
  if (ville) infoLines.push(ville);
  if (telephone) infoLines.push(`Tél : ${telephone}`);
  if (email) infoLines.push(email);

  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const piedTexte = piedDePagePdf || `${nomComplet || "CoopDigital"} — Document confidentiel`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800">Aperçu en-tête PDF</h2>
        <span className="text-xs text-gray-400 italic">Mise à jour en temps réel</span>
      </div>

      {/* Simulation A4 */}
      <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>

        {/* Barre colorée top */}
        <div style={{ height: 4, backgroundColor: couleur }} />

        {/* En-tête */}
        <div className="flex items-start gap-3 px-6 pt-3 pb-2">
          {/* Logo */}
          <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center overflow-hidden rounded">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full border-2 border-dashed rounded flex items-center justify-center" style={{ borderColor: couleur }}>
                <ImageIcon className="w-5 h-5" style={{ color: couleur, opacity: 0.4 }} />
              </div>
            )}
          </div>

          {/* Infos coopérative */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-bold text-sm leading-tight" style={{ color: couleur }}>
              {nomComplet || nomCompletFallback}
            </p>
            {slogan && (
              <p className="text-xs italic mt-0.5" style={{ color: "#666" }}>{slogan}</p>
            )}
            <div className="mt-1 space-y-0.5">
              {infoLines.map((line, i) => (
                <p key={i} className="text-xs" style={{ color: "#444" }}>{line}</p>
              ))}
              {numeroAgrement && (
                <p className="text-xs italic" style={{ color: "#777" }}>Agrément N° {numeroAgrement}</p>
              )}
            </div>
          </div>

          {/* Boîte document */}
          <div className="flex-shrink-0 w-28 self-start">
            <div className="px-2 py-2 text-center" style={{ backgroundColor: couleur }}>
              <p className="text-xs font-bold text-white leading-tight">{titreDocument}</p>
            </div>
            <p className="text-center text-xs mt-1.5" style={{ color: "#888" }}>Généré le {today}</p>
          </div>
        </div>

        {/* Ligne séparatrice */}
        <div className="mx-6 mb-2" style={{ height: 1, backgroundColor: couleur }} />

        {/* Corps simulé */}
        <div className="px-6 py-3 space-y-1.5">
          {[70, 55, 85, 40].map((w, i) => (
            <div key={i} className="h-2 rounded-full bg-gray-100" style={{ width: `${w}%` }} />
          ))}
        </div>

        {/* Séparatrice pied */}
        <div className="mx-6 mt-1" style={{ height: 0.5, backgroundColor: "#ddd" }} />

        {/* Pied de page */}
        <div className="flex items-center justify-between px-6 py-2">
          <p className="text-xs truncate max-w-xs" style={{ color: "#888", fontSize: 9 }}>{piedTexte}</p>
          <p className="text-xs font-bold flex-shrink-0 ml-2" style={{ color: couleur, fontSize: 9 }}>Page 1 / 1</p>
        </div>
      </div>
    </div>
  );
}

const MONTHS = [
  { value: "1", label: "Janvier" },
  { value: "2", label: "Février" },
  { value: "3", label: "Mars" },
  { value: "4", label: "Avril" },
  { value: "5", label: "Mai" },
  { value: "6", label: "Juin" },
  { value: "7", label: "Juillet" },
  { value: "8", label: "Août" },
  { value: "9", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
];

const PRODUITS = ["Cacao", "Café", "Hévéa", "Mixte"];

const DOCUMENT_TYPES: Record<string, string> = {
  statuts: "Statuts",
  reglement_interieur: "Règlement intérieur",
  agrement: "Agrément",
  certification: "Certification",
  contrat_exportateur: "Contrat exportateur",
  autre: "Autre",
};

function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ dateStr }: { dateStr: string | null | undefined }) {
  if (!dateStr) return <span className="text-gray-400 text-sm">—</span>;
  const days = daysUntilExpiry(dateStr);
  if (days === null) return null;
  if (days < 0) return <Badge variant="destructive">Expiré</Badge>;
  if (days < 60) return <Badge variant="destructive">{days}j</Badge>;
  return <span className="text-sm text-gray-600">{new Date(dateStr).toLocaleDateString("fr-FR")}</span>;
}

export default function ParametresPage() {
  const { utilisateur } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  async function handleDownloadPdf() {
    setIsDownloadingPdf(true);
    try {
      const BASE = import.meta.env.VITE_API_URL ?? "";
      const token = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/config/export-pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur serveur");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "parametres_coop.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erreur lors du téléchargement PDF", variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const { data: config, isLoading: configLoading } = useGetConfig({
    query: { queryKey: getGetConfigQueryKey() },
  });
  const { data: docsData, isLoading: docsLoading } = useGetDocumentsOfficiels({
    query: { queryKey: getGetDocumentsOfficielsQueryKey() },
  });

  const updateConfig = useUpdateConfig({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetConfigQueryKey() });
        toast({ title: "Configuration sauvegardée" });
      },
      onError: () => toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" }),
    },
  });

  const uploadLogoMut = useUploadLogo({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetConfigQueryKey() });
        toast({ title: "Logo mis à jour" });
      },
      onError: () => toast({ title: "Erreur upload logo", variant: "destructive" }),
    },
  });

  const createDoc = useCreateDocumentOfficiel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetDocumentsOfficielsQueryKey() });
        toast({ title: "Document ajouté" });
      },
      onError: () => toast({ title: "Erreur lors de l'ajout", variant: "destructive" }),
    },
  });

  const deleteDoc = useDeleteDocumentOfficiel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetDocumentsOfficielsQueryKey() });
        toast({ title: "Document supprimé" });
      },
      onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
    },
  });

  const canEdit = ["pca", "directeur"].includes(utilisateur?.role ?? "");

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  if (config && !initialized) {
    const c = config as Record<string, string | null | undefined>;
    const init: Record<string, string> = {};
    const fields = [
      "nom_complet","nom_abrege","slogan","adresse","ville","region","pays",
      "telephone","telephone2","email","site_web","boite_postale",
      "numero_agrement","date_agrement","autorite_agrement","forme_juridique",
      "numero_rccm","numero_contribuable","date_creation","banque_principale",
      "numero_compte_bancaire","iban","swift","devise","produit_principal",
      "zone_collecte","superficie_totale_ha","valeur_nominale_part_fcfa",
      "nbre_parts_min","cotisation_annuelle_fcfa","quorum_ag_pct",
      "couleur_primaire","couleur_secondaire","pied_de_page_pdf",
    ];
    for (const f of fields) init[f] = c[f] != null ? String(c[f]) : "";
    init["exercice_fiscal_debut_mois"] = c["exercice_fiscal_debut_mois"] != null ? String(c["exercice_fiscal_debut_mois"]) : "1";
    setForm(init);
    setInitialized(true);
  }

  const v = (key: string, fallback = "") => form[key] ?? fallback;

  function buildPayload() {
    return {
      nom_complet:                v("nom_complet") || undefined,
      nom_abrege:                 v("nom_abrege") || undefined,
      slogan:                     v("slogan") || undefined,
      adresse:                    v("adresse") || undefined,
      ville:                      v("ville") || undefined,
      region:                     v("region") || undefined,
      pays:                       v("pays") || undefined,
      telephone:                  v("telephone") || undefined,
      telephone2:                 v("telephone2") || undefined,
      email:                      v("email") || undefined,
      site_web:                   v("site_web") || undefined,
      boite_postale:              v("boite_postale") || undefined,
      numero_agrement:            v("numero_agrement") || undefined,
      date_agrement:              v("date_agrement") || undefined,
      autorite_agrement:          v("autorite_agrement") || undefined,
      forme_juridique:            v("forme_juridique") || undefined,
      numero_rccm:                v("numero_rccm") || undefined,
      numero_contribuable:        v("numero_contribuable") || undefined,
      date_creation:              v("date_creation") || undefined,
      banque_principale:          v("banque_principale") || undefined,
      numero_compte_bancaire:     v("numero_compte_bancaire") || undefined,
      iban:                       v("iban") || undefined,
      swift:                      v("swift") || undefined,
      devise:                     v("devise") || undefined,
      exercice_fiscal_debut_mois: v("exercice_fiscal_debut_mois") ? parseInt(v("exercice_fiscal_debut_mois")) : undefined,
      produit_principal:          v("produit_principal") || undefined,
      zone_collecte:              v("zone_collecte") || undefined,
      superficie_totale_ha:       v("superficie_totale_ha") ? parseFloat(v("superficie_totale_ha")) : undefined,
      valeur_nominale_part_fcfa:  v("valeur_nominale_part_fcfa") ? parseFloat(v("valeur_nominale_part_fcfa")) : undefined,
      nbre_parts_min:             v("nbre_parts_min") ? parseInt(v("nbre_parts_min")) : undefined,
      cotisation_annuelle_fcfa:   v("cotisation_annuelle_fcfa") ? parseFloat(v("cotisation_annuelle_fcfa")) : undefined,
      quorum_ag_pct:              v("quorum_ag_pct") ? parseFloat(v("quorum_ag_pct")) : undefined,
      couleur_primaire:           v("couleur_primaire") || undefined,
      couleur_secondaire:         v("couleur_secondaire") || undefined,
      pied_de_page_pdf:           v("pied_de_page_pdf") || undefined,
    };
  }

  function handleSave() {
    updateConfig.mutate({ data: buildPayload() });
  }

  // ── Logo upload ────────────────────────────────────────────────────────────
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  async function handleLogoFile(file: File) {
    setIsUploadingLogo(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      uploadLogoMut.mutate(
        { data: { data_url: dataUrl, content_type: file.type } },
        { onSettled: () => setIsUploadingLogo(false) },
      );
    } catch {
      toast({ title: "Erreur lors de la lecture du fichier", variant: "destructive" });
      setIsUploadingLogo(false);
    }
  }

  // ── Add document dialog ────────────────────────────────────────────────────
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [docForm, setDocForm] = useState({ type: "statuts", libelle: "", fichier_url: "", date_document: "", date_expiration: "" });
  const [docFileUploading, setDocFileUploading] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);

  async function handleDocFileSelect(file: File) {
    const MAX_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast({ title: "Fichier trop volumineux (max 8 Mo)", variant: "destructive" });
      return;
    }
    setDocFileUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setDocForm((p) => ({ ...p, fichier_url: dataUrl, libelle: p.libelle || file.name }));
      toast({ title: "Fichier sélectionné" });
    } catch {
      toast({ title: "Erreur lecture fichier", variant: "destructive" });
    } finally {
      setDocFileUploading(false);
    }
  }

  function openDocument(fichierUrl: string, libelle: string) {
    if (fichierUrl.startsWith("data:")) {
      const [header, b64] = fichierUrl.split(",");
      const mime = header.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
      const binary = atob(b64 ?? "");
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = libelle;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      window.open(fichierUrl, "_blank", "noopener,noreferrer");
    }
  }

  function handleSaveDoc() {
    createDoc.mutate(
      {
        data: {
          type: docForm.type as "statuts" | "reglement_interieur" | "agrement" | "certification" | "contrat_exportateur" | "autre",
          libelle: docForm.libelle,
          fichier_url: docForm.fichier_url,
          date_document: docForm.date_document || undefined,
          date_expiration: docForm.date_expiration || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowDocDialog(false);
          setDocForm({ type: "statuts", libelle: "", fichier_url: "", date_document: "", date_expiration: "" });
        },
      },
    );
  }

  const documents = (docsData as { documents: Array<{ id: number; type: string; libelle: string; fichier_url: string; date_document: string | null; date_expiration: string | null; created_at: string }> })?.documents ?? [];

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-700" />
      </div>
    );
  }

  const logoUrl = (config as Record<string, string | null | undefined>)?.logo_url;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
          <p className="text-gray-500 text-sm mt-1">Configuration de la coopérative</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void handleDownloadPdf()}
            disabled={isDownloadingPdf || !config}
          >
            {isDownloadingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Exporter PDF
          </Button>
          {canEdit && (
            <Button
              onClick={handleSave}
              disabled={updateConfig.isPending}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              {updateConfig.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Enregistrer
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="identite">
        <TabsList className="mb-6 flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="identite" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Identité & coordonnées
          </TabsTrigger>
          <TabsTrigger value="juridique" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Juridique & financier
          </TabsTrigger>
          <TabsTrigger value="operationnel" className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Paramètres opérationnels
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Documents officiels
          </TabsTrigger>
        </TabsList>

        {/* ── Onglet 1 : Identité ─────────────────────────────────────── */}
        <TabsContent value="identite" className="space-y-6">
          {/* Logo */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Logo
            </h2>
            <div className="flex items-center gap-6">
              <div
                className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden cursor-pointer hover:border-green-500 transition-colors"
                onClick={() => canEdit && fileInputRef.current?.click()}
              >
                {isUploadingLogo ? (
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Upload className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingLogo}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Changer le logo
                  </Button>
                )}
                <p className="text-xs text-gray-500 mt-2">PNG ou JPG uniquement · max 2 Mo</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
                />
              </div>
            </div>
          </div>

          {/* Identité */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Identité</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Nom complet</Label>
                <Input disabled={!canEdit} value={v("nom_complet")} onChange={(e) => set("nom_complet", e.target.value)} placeholder="Ex : Coopérative des Producteurs de Cacao de Daloa" />
              </div>
              <div>
                <Label>Nom abrégé</Label>
                <Input disabled={!canEdit} value={v("nom_abrege")} onChange={(e) => set("nom_abrege", e.target.value)} placeholder="Ex : CPCD" />
              </div>
              <div>
                <Label>Slogan</Label>
                <Input disabled={!canEdit} value={v("slogan")} onChange={(e) => set("slogan", e.target.value)} placeholder="Ex : Ensemble vers l'excellence" />
              </div>
            </div>
          </div>

          {/* Coordonnées */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Coordonnées</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Adresse</Label>
                <Input disabled={!canEdit} value={v("adresse")} onChange={(e) => set("adresse", e.target.value)} placeholder="Rue, quartier, BP..." />
              </div>
              <div>
                <Label>Ville</Label>
                <Input disabled={!canEdit} value={v("ville")} onChange={(e) => set("ville", e.target.value)} placeholder="Daloa" />
              </div>
              <div>
                <Label>Région</Label>
                <Input disabled={!canEdit} value={v("region")} onChange={(e) => set("region", e.target.value)} placeholder="Haut-Sassandra" />
              </div>
              <div>
                <Label>Téléphone principal</Label>
                <Input disabled={!canEdit} value={v("telephone")} onChange={(e) => set("telephone", e.target.value)} placeholder="+225 07 00 00 00 00" />
              </div>
              <div>
                <Label>Téléphone secondaire</Label>
                <Input disabled={!canEdit} value={v("telephone2")} onChange={(e) => set("telephone2", e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" disabled={!canEdit} value={v("email")} onChange={(e) => set("email", e.target.value)} placeholder="contact@coop.ci" />
              </div>
              <div>
                <Label>Site web</Label>
                <Input disabled={!canEdit} value={v("site_web")} onChange={(e) => set("site_web", e.target.value)} placeholder="https://www.coop.ci" />
              </div>
              <div>
                <Label>Boîte postale</Label>
                <Input disabled={!canEdit} value={v("boite_postale")} onChange={(e) => set("boite_postale", e.target.value)} placeholder="BP 1234" />
              </div>
            </div>
          </div>

          {/* Aperçu en-tête PDF */}
          <PdfHeaderPreview
            logoUrl={logoUrl}
            nomComplet={v("nom_complet")}
            slogan={v("slogan")}
            adresse={v("adresse")}
            ville={v("ville")}
            telephone={v("telephone")}
            email={v("email")}
            numeroAgrement={v("numero_agrement")}
            couleurPrimaire={v("couleur_primaire") || "#1a4731"}
            piedDePagePdf={v("pied_de_page_pdf")}
            nomCompletFallback={v("nom_complet") || "CoopDigital"}
          />
        </TabsContent>

        {/* ── Onglet 2 : Juridique ────────────────────────────────────── */}
        <TabsContent value="juridique" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Informations juridiques</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Numéro d'agrément</Label>
                <Input disabled={!canEdit} value={v("numero_agrement")} onChange={(e) => set("numero_agrement", e.target.value)} />
              </div>
              <div>
                <Label>Date d'agrément</Label>
                <Input type="date" disabled={!canEdit} value={v("date_agrement")} onChange={(e) => set("date_agrement", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Autorité d'agrément</Label>
                <Input disabled={!canEdit} value={v("autorite_agrement")} onChange={(e) => set("autorite_agrement", e.target.value)} placeholder="Ex : Ministère de l'Agriculture" />
              </div>
              <div>
                <Label>Forme juridique</Label>
                <Input disabled={!canEdit} value={v("forme_juridique")} onChange={(e) => set("forme_juridique", e.target.value)} />
              </div>
              <div>
                <Label>Date de création</Label>
                <Input type="date" disabled={!canEdit} value={v("date_creation")} onChange={(e) => set("date_creation", e.target.value)} />
              </div>
              <div>
                <Label>Numéro RCCM</Label>
                <Input disabled={!canEdit} value={v("numero_rccm")} onChange={(e) => set("numero_rccm", e.target.value)} />
              </div>
              <div>
                <Label>Numéro contribuable</Label>
                <Input disabled={!canEdit} value={v("numero_contribuable")} onChange={(e) => set("numero_contribuable", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Informations bancaires</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Banque principale</Label>
                <Input disabled={!canEdit} value={v("banque_principale")} onChange={(e) => set("banque_principale", e.target.value)} placeholder="Ex : SGBCI" />
              </div>
              <div>
                <Label>Numéro de compte</Label>
                <Input disabled={!canEdit} value={v("numero_compte_bancaire")} onChange={(e) => set("numero_compte_bancaire", e.target.value)} />
              </div>
              <div>
                <Label>IBAN</Label>
                <Input disabled={!canEdit} value={v("iban")} onChange={(e) => set("iban", e.target.value)} />
              </div>
              <div>
                <Label>SWIFT / BIC</Label>
                <Input disabled={!canEdit} value={v("swift")} onChange={(e) => set("swift", e.target.value)} />
              </div>
              <div>
                <Label>Début exercice fiscal (mois)</Label>
                <Select
                  disabled={!canEdit}
                  value={v("exercice_fiscal_debut_mois", "1")}
                  onValueChange={(val) => set("exercice_fiscal_debut_mois", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mois" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Onglet 3 : Opérationnel ─────────────────────────────────── */}
        <TabsContent value="operationnel" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Production</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Produit principal</Label>
                <Select
                  disabled={!canEdit}
                  value={v("produit_principal", "Cacao")}
                  onValueChange={(val) => set("produit_principal", val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUITS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zone de collecte</Label>
                <Input disabled={!canEdit} value={v("zone_collecte")} onChange={(e) => set("zone_collecte", e.target.value)} placeholder="Ex : Daloa, Issia, Vavoua" />
              </div>
              <div>
                <Label>Superficie totale (ha)</Label>
                <Input type="number" disabled={!canEdit} value={v("superficie_totale_ha")} onChange={(e) => set("superficie_totale_ha", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Parts sociales & cotisations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Valeur nominale d'une part (FCFA)</Label>
                <MoneyInput value={v("valeur_nominale_part_fcfa")} onChange={(raw) => set("valeur_nominale_part_fcfa", raw)} />
              </div>
              <div>
                <Label>Nombre de parts minimum</Label>
                <Input type="number" disabled={!canEdit} value={v("nbre_parts_min")} onChange={(e) => set("nbre_parts_min", e.target.value)} />
              </div>
              <div>
                <Label>Cotisation annuelle (FCFA)</Label>
                <MoneyInput value={v("cotisation_annuelle_fcfa")} onChange={(raw) => set("cotisation_annuelle_fcfa", raw)} />
              </div>
              <div>
                <Label>Quorum AG requis (%)</Label>
                <Input type="number" disabled={!canEdit} value={v("quorum_ag_pct")} onChange={(e) => set("quorum_ag_pct", e.target.value)} min={0} max={100} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Apparence PDF</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Couleur primaire</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="color"
                    disabled={!canEdit}
                    value={v("couleur_primaire", "#1a4731")}
                    onChange={(e) => set("couleur_primaire", e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                  />
                  <Input
                    disabled={!canEdit}
                    value={v("couleur_primaire", "#1a4731")}
                    onChange={(e) => set("couleur_primaire", e.target.value)}
                    className="w-32 font-mono text-sm"
                    placeholder="#1a4731"
                  />
                  <div className="w-8 h-8 rounded" style={{ backgroundColor: v("couleur_primaire", "#1a4731") }} />
                </div>
              </div>
              <div>
                <Label>Couleur secondaire</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="color"
                    disabled={!canEdit}
                    value={v("couleur_secondaire", "#c4962a")}
                    onChange={(e) => set("couleur_secondaire", e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                  />
                  <Input
                    disabled={!canEdit}
                    value={v("couleur_secondaire", "#c4962a")}
                    onChange={(e) => set("couleur_secondaire", e.target.value)}
                    className="w-32 font-mono text-sm"
                    placeholder="#c4962a"
                  />
                  <div className="w-8 h-8 rounded" style={{ backgroundColor: v("couleur_secondaire", "#c4962a") }} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>Pied de page PDF</Label>
                <Textarea
                  disabled={!canEdit}
                  value={v("pied_de_page_pdf")}
                  onChange={(e) => set("pied_de_page_pdf", e.target.value)}
                  placeholder="Ex : CPCD — Agrément N° 123 du 01/01/2010 — Tous droits réservés"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <PdfHeaderPreview
            logoUrl={logoUrl}
            nomComplet={v("nom_complet")}
            slogan={v("slogan")}
            adresse={v("adresse")}
            ville={v("ville")}
            telephone={v("telephone")}
            email={v("email")}
            numeroAgrement={v("numero_agrement")}
            couleurPrimaire={v("couleur_primaire") || "#1a4731"}
            piedDePagePdf={v("pied_de_page_pdf")}
            nomCompletFallback={v("nom_complet") || "CoopDigital"}
            titreDocument="FICHE MEMBRE"
          />
        </TabsContent>

        {/* ── Onglet 4 : Documents ─────────────────────────────────────── */}
        <TabsContent value="documents" className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Documents officiels</h2>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => setShowDocDialog(true)}
                  className="bg-green-700 hover:bg-green-800 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un document
                </Button>
              )}
            </div>

            {docsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Aucun document officiel enregistré</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const days = daysUntilExpiry(doc.date_expiration);
                      const isExpiringSoon = days !== null && days < 60;
                      return (
                        <TableRow key={doc.id} className={isExpiringSoon ? "bg-red-50" : ""}>
                          <TableCell className="font-medium">
                            {DOCUMENT_TYPES[doc.type] ?? doc.type}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isExpiringSoon && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                              <span>{doc.libelle}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {doc.date_document ? new Date(doc.date_document).toLocaleDateString("fr-FR") : "—"}
                          </TableCell>
                          <TableCell>
                            <ExpiryBadge dateStr={doc.date_expiration} />
                          </TableCell>
                          <TableCell>
                            {days === null ? (
                              <Badge variant="secondary">Sans expiration</Badge>
                            ) : days < 0 ? (
                              <Badge variant="destructive">Expiré</Badge>
                            ) : days < 60 ? (
                              <Badge variant="destructive">Expire bientôt</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-700 border-green-700">Valide</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openDocument(doc.fichier_url, doc.libelle)}
                                className="p-1 text-gray-500 hover:text-green-700 transition-colors"
                                title="Ouvrir / Télécharger"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => setDeleteDocId(doc.id)}
                                  className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog ajout document ──────────────────────────────────────── */}
      <Dialog open={showDocDialog} onOpenChange={setShowDocDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un document officiel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Type de document</Label>
              <Select value={docForm.type} onValueChange={(v) => setDocForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPES).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Libellé</Label>
              <Input
                value={docForm.libelle}
                onChange={(e) => setDocForm((p) => ({ ...p, libelle: e.target.value }))}
                placeholder="Ex : Statuts révisés 2022"
              />
            </div>
            <div>
              <Label>Fichier</Label>
              {docForm.fichier_url ? (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <FileText className="w-4 h-4" />
                  <span>Fichier prêt</span>
                  <button onClick={() => setDocForm((p) => ({ ...p, fichier_url: "" }))} className="text-gray-400 hover:text-red-500">
                    ×
                  </button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-green-500 transition-colors"
                  onClick={() => docFileRef.current?.click()}
                >
                  {docFileUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                      <p className="text-sm text-gray-500">Cliquer pour sélectionner un fichier</p>
                    </>
                  )}
                  <input
                    ref={docFileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleDocFileSelect(e.target.files[0])}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date du document</Label>
                <Input
                  type="date"
                  value={docForm.date_document}
                  onChange={(e) => setDocForm((p) => ({ ...p, date_document: e.target.value }))}
                />
              </div>
              <div>
                <Label>Date d'expiration</Label>
                <Input
                  type="date"
                  value={docForm.date_expiration}
                  onChange={(e) => setDocForm((p) => ({ ...p, date_expiration: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocDialog(false)}>Annuler</Button>
            <Button
              onClick={handleSaveDoc}
              disabled={!docForm.libelle || !docForm.fichier_url || createDoc.isPending}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm suppression document ──────────────────────────────── */}
      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteDocId) {
                  deleteDoc.mutate({ id: deleteDocId }, { onSuccess: () => setDeleteDocId(null) });
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
