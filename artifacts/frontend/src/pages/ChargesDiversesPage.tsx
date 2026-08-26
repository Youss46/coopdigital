import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, CheckCircle2, Filter, BarChart3,
  TrendingDown, FileText, Loader2,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "coop_token";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Charge {
  id: number;
  date_charge: string;
  libelle: string;
  description: string | null;
  montant_fcfa: number;
  ppsi_taux_pct: number | null;
  retenue_ppsi_fcfa: number;
  montant_net_fcfa: number | null;
  categorie: string;
  compte_debit: string;
  compte_credit: string;
  mode_paiement: string;
  tiers: string | null;
  reference_piece: string | null;
  statut: string;
  created_at: string;
}

interface Stats {
  total_fcfa: number;
  nb_charges: number;
  par_categorie: Array<{ categorie: string; total: number; nb: number }>;
}

// ── Référentiels ──────────────────────────────────────────────────────────────
const CATEGORIES: Array<{ value: string; label: string; compte: string }> = [
  { value: "loyer",           label: "Loyer et charges locatives",  compte: "622"  },
  { value: "eau_electricite", label: "Eau et électricité",           compte: "605"  },
  { value: "fournitures",     label: "Fournitures de bureau",        compte: "604"  },
  { value: "communication",   label: "Téléphone et communication",   compte: "628"  },
  { value: "deplacement",     label: "Déplacements et transport",    compte: "618"  },
  { value: "reception",       label: "Réceptions et hébergement",    compte: "627"  },
  { value: "entretien",       label: "Entretien et réparations",     compte: "624"  },
  { value: "honoraires",      label: "Honoraires et consultants",    compte: "632"  },
  { value: "ppsi",            label: "Prestation informelle — PPSSI", compte: "632"  },
  { value: "publicite",       label: "Publicité et marketing",       compte: "627"  },
  { value: "autre",           label: "Autres charges",               compte: "658"  },
];

const MODES_PAIEMENT = [
  { value: "especes",       label: "Espèces" },
  { value: "cheque",        label: "Chèque" },
  { value: "virement",      label: "Virement bancaire" },
  { value: "mobile_money",  label: "Mobile Money" },
];

const COMPTES_CREDIT = [
  { value: "571", label: "571 — Caisse" },
  { value: "521", label: "521 — Banque" },
  { value: "401", label: "401 — Fournisseurs" },
];

const EMPTY_FORM = {
  date_charge:     new Date().toISOString().split("T")[0]!,
  libelle:         "",
  description:     "",
  montant_fcfa:    "",
  categorie:       "autre",
  compte_debit:    "6580",
  compte_credit:   "571",
  mode_paiement:   "especes",
  tiers:           "",
  reference_piece: "",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtFcfa(n: number) {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

const STATUT_BADGE: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  valide:    "bg-green-100 text-green-800",
};

// ── Composant principal ───────────────────────────────────────────────────────
export default function ChargesDiversesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filtres
  const [filtreStatut,    setFiltreStatut]    = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [filtreDebut,     setFiltreDebut]     = useState("");
  const [filtreFin,       setFiltreFin]       = useState("");

  // Modale
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<Charge | null>(null);
  const [form,         setForm]         = useState({ ...EMPTY_FORM });
  const [showStats,    setShowStats]    = useState(false);

  // Sync compte débit quand catégorie change
  useEffect(() => {
    const cat = CATEGORIES.find(c => c.value === form.categorie);
    if (cat && !editTarget) setForm(f => ({ ...f, compte_debit: cat.compte }));
  }, [form.categorie, editTarget]);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const qs = new URLSearchParams();
  if (filtreStatut)    qs.set("statut",    filtreStatut);
  if (filtreCategorie) qs.set("categorie", filtreCategorie);
  if (filtreDebut)     qs.set("date_debut", filtreDebut);
  if (filtreFin)       qs.set("date_fin",   filtreFin);

  const { data: charges = [], isLoading } = useQuery<Charge[]>({
    queryKey: ["charges-diverses", filtreStatut, filtreCategorie, filtreDebut, filtreFin],
    queryFn:  () => apiFetch<Charge[]>(`/charges-diverses?${qs}`),
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["charges-diverses-stats", filtreDebut, filtreFin],
    queryFn:  () => apiFetch<Stats>(`/charges-diverses/stats${filtreDebut || filtreFin ? `?date_debut=${filtreDebut}&date_fin=${filtreFin}` : ""}`),
    enabled:  showStats,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["charges-diverses"] }); };

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      apiFetch("/charges-diverses", { method: "POST", body: JSON.stringify({
        date_charge:     data.date_charge,
        libelle:         data.libelle,
        description:     data.description || null,
        montant_fcfa:    parseFloat(data.montant_fcfa),
        categorie:       data.categorie,
        compte_debit:    data.compte_debit,
        compte_credit:   data.compte_credit,
        mode_paiement:   data.mode_paiement,
        tiers:           data.tiers || null,
        reference_piece: data.reference_piece || null,
      }) }),
    onSuccess: () => { toast({ title: "Charge enregistrée" }); setShowForm(false); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM & { id: number }) =>
      apiFetch(`/charges-diverses/${data.id}`, { method: "PUT", body: JSON.stringify({
        date_charge:     data.date_charge,
        libelle:         data.libelle,
        description:     data.description || null,
        montant_fcfa:    parseFloat(data.montant_fcfa),
        categorie:       data.categorie,
        compte_debit:    data.compte_debit,
        compte_credit:   data.compte_credit,
        mode_paiement:   data.mode_paiement,
        tiers:           data.tiers || null,
        reference_piece: data.reference_piece || null,
      }) }),
    onSuccess: () => { toast({ title: "Charge mise à jour" }); setShowForm(false); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const validerMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/charges-diverses/${id}/valider`, { method: "PUT" }),
    onSuccess: () => { toast({ title: "Charge validée ✓", description: "L'écriture comptable a été générée." }); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/charges-diverses/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Charge supprimée" }); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }, []);

  const openEdit = useCallback((c: Charge) => {
    setEditTarget(c);
    setForm({
      date_charge:     c.date_charge,
      libelle:         c.libelle,
      description:     c.description ?? "",
      montant_fcfa:    String(c.montant_fcfa),
      categorie:       c.categorie,
      compte_debit:    c.compte_debit,
      compte_credit:   c.compte_credit,
      mode_paiement:   c.mode_paiement,
      tiers:           c.tiers ?? "",
      reference_piece: c.reference_piece ?? "",
    });
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.libelle || !form.montant_fcfa || !form.date_charge) {
      toast({ title: "Champs requis", description: "Libellé, montant et date sont obligatoires.", variant: "destructive" });
      return;
    }
    if (editTarget) {
      updateMut.mutate({ ...form, id: editTarget.id });
    } else {
      createMut.mutate(form);
    }
  }, [form, editTarget, createMut, updateMut, toast]);

  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;
  const isSubmitting = createMut.isPending || updateMut.isPending;

  // ── Rendu ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-red-500" />
            Charges diverses
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Enregistrement et suivi des dépenses de fonctionnement de la coopérative
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowStats(s => !s)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {showStats ? "Masquer stats" : "Statistiques"}
          </Button>
          <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" /> Nouvelle charge
          </Button>
        </div>
      </div>

      {/* Stats */}
      {showStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">Total validé</p>
              <p className="text-xl font-bold text-red-600">{fmtFcfa(stats.total_fcfa)}</p>
              <p className="text-xs text-gray-400">{stats.nb_charges} charge{stats.nb_charges > 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          {stats.par_categorie.slice(0, 3).map(r => (
            <Card key={r.categorie}>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 truncate">{catLabel(r.categorie)}</p>
                <p className="text-lg font-bold text-gray-800">{fmtFcfa(r.total)}</p>
                <p className="text-xs text-gray-400">{r.nb} charge{r.nb > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Statut</Label>
              <Select value={filtreStatut || "all"} onValueChange={v => setFiltreStatut(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="valide">Validé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Catégorie</Label>
              <Select value={filtreCategorie || "all"} onValueChange={v => setFiltreCategorie(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Du</Label>
              <Input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Au</Label>
              <Input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Charges enregistrées
            {charges.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{charges.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TrendingDown className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p>Aucune charge enregistrée</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Ajouter une charge
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Tiers / Fournisseur</TableHead>
                   <TableHead className="text-right">Montant brut</TableHead>
                   <TableHead className="text-right">Net prestataire</TableHead>
                  <TableHead>Compte (D/C)</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm text-gray-600 whitespace-nowrap">{fmt(c.date_charge)}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{c.libelle}</p>
                      {c.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{c.description}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{catLabel(c.categorie)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{c.tiers ?? "—"}</TableCell>
                     <TableCell className="text-right font-semibold text-sm">
                      {fmtFcfa(c.montant_fcfa)}
                    </TableCell>
                     <TableCell className="text-right text-sm">
                       {c.categorie === "ppsi" ? (
                         <div>
                           <span className="font-semibold">{fmtFcfa(c.montant_net_fcfa ?? c.montant_fcfa - c.retenue_ppsi_fcfa)}</span>
                           <p className="text-xs text-amber-700">Retenue {fmtFcfa(c.retenue_ppsi_fcfa)}</p>
                         </div>
                       ) : "—"}
                     </TableCell>
                    <TableCell className="text-xs text-gray-500 font-mono">{c.compte_debit} / {c.compte_credit}</TableCell>
                    <TableCell>
                      <Badge className={STATUT_BADGE[c.statut] ?? "bg-gray-100 text-gray-600"}>
                        {c.statut === "valide" ? "✓ Validé" : "Brouillon"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {c.statut === "brouillon" && (
                          <>
                            <Button
                              variant="ghost" size="icon"
                              title="Valider et générer l'écriture comptable"
                              onClick={() => validerMut.mutate(c.id)}
                              disabled={validerMut.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => { if (confirm("Supprimer cette charge ?")) deleteMut.mutate(c.id); }}
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modale création/édition */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Modifier la charge" : "Nouvelle charge diverse"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date_charge} onChange={e => setForm(f => ({ ...f, date_charge: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Montant (FCFA) *</Label>
                <NumericInput decimal={false} min="0" step="1" placeholder="Ex: 50000" value={form.montant_fcfa} onChange={v => setForm(f => ({ ...f, montant_fcfa: v }))} />
                {form.categorie === "ppsi" && parseFloat(form.montant_fcfa) > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Retenue PPSSI estimée (2 %) : {fmtFcfa(parseFloat(form.montant_fcfa) * 0.02)} · Net prestataire : {fmtFcfa(parseFloat(form.montant_fcfa) * 0.98)}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Libellé *</Label>
              <Input placeholder="Description courte de la dépense" value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Description (facultatif)</Label>
              <Textarea placeholder="Détails, contexte…" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Catégorie *</Label>
                <Select value={form.categorie} onValueChange={v => setForm(f => ({ ...f, categorie: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Mode de paiement</Label>
                <Select value={form.mode_paiement} onValueChange={v => setForm(f => ({ ...f, mode_paiement: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES_PAIEMENT.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Compte débit (OHADA)</Label>
                <Input placeholder="Ex: 6132" value={form.compte_debit} onChange={e => setForm(f => ({ ...f, compte_debit: e.target.value }))} />
                <p className="text-xs text-gray-400">Auto-rempli selon catégorie</p>
              </div>
              <div className="space-y-1">
                <Label>Compte crédit</Label>
                <Select value={form.compte_credit} onValueChange={v => setForm(f => ({ ...f, compte_credit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPTES_CREDIT.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tiers / Fournisseur{form.categorie === "ppsi" ? " *" : ""}</Label>
                <Input placeholder="Nom du prestataire" value={form.tiers} onChange={e => setForm(f => ({ ...f, tiers: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>N° pièce / référence</Label>
                <Input placeholder="Facture, reçu…" value={form.reference_piece} onChange={e => setForm(f => ({ ...f, reference_piece: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editTarget ? "Mettre à jour" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
