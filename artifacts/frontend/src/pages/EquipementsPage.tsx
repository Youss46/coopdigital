import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  useGetCategoriesEquipements, getGetCategoriesEquipementsQueryKey,
  useGetEquipements, getGetEquipementsQueryKey,
  usePostEquipement, usePutEquipement, useDeleteEquipement,
  useGetEquipementsAlertes, getGetEquipementsAlertesQueryKey,
  useGetEquipementsAmortis,
  useGetRapportInventaireEquipements, getGetRapportInventaireEquipementsQueryKey,
  usePostGenererDotations,
  useGetTableauAmortissement,
  useGetMaintenancesEquipement, getGetMaintenancesEquipementQueryKey,
  usePostMaintenanceEquipement,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Package, AlertTriangle, PlusCircle, Edit2, Trash2,
  Wrench, BarChart3, RefreshCw, ChevronDown, ChevronUp,
  TrendingDown, CheckCircle, FileText,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return "0";
  return n.toLocaleString("fr-FR");
}

function pct(vnc: unknown, brut: unknown): number {
  const v = Number(vnc ?? 0);
  const b = Number(brut ?? 1);
  if (b === 0) return 0;
  return (v / b) * 100;
}

function vncColor(vncPct: number): string {
  if (vncPct > 50) return "text-green-600";
  if (vncPct >= 20) return "text-amber-600";
  return "text-red-600";
}

function vncBg(vncPct: number): string {
  if (vncPct > 50) return "bg-green-100 text-green-800";
  if (vncPct >= 20) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

type EquipRow = {
  id: number;
  designation: string;
  categorie_libelle?: string | null;
  marque?: string | null;
  numero_serie?: string | null;
  date_acquisition: string;
  valeur_acquisition_fcfa: string;
  valeur_residuelle_fcfa: string;
  valeur_nette_comptable_fcfa: string;
  cumul_amortissement_fcfa: string;
  statut: string;
  affecte_a?: string | null;
  duree_amortissement_ans: number;
  methode_amortissement: string;
  date_mise_service?: string | null;
  garantie_expiration?: string | null;
  categorie_id: number;
  modele?: string | null;
  affecte_user_id?: number | null;
};

// ─── Formulaire équipement ────────────────────────────────────────────────────

type EquipForm = {
  categorie_id: string;
  designation: string;
  marque: string;
  modele: string;
  numero_serie: string;
  date_acquisition: string;
  valeur_acquisition_fcfa: string;
  valeur_residuelle_fcfa: string;
  duree_amortissement_ans: string;
  methode_amortissement: string;
  affecte_a: string;
  date_mise_service: string;
  garantie_expiration: string;
  statut: string;
};

const EMPTY_FORM: EquipForm = {
  categorie_id: "",
  designation: "",
  marque: "",
  modele: "",
  numero_serie: "",
  date_acquisition: "",
  valeur_acquisition_fcfa: "",
  valeur_residuelle_fcfa: "0",
  duree_amortissement_ans: "",
  methode_amortissement: "lineaire",
  affecte_a: "",
  date_mise_service: "",
  garantie_expiration: "",
  statut: "actif",
};

// ─── Onglet Inventaire ────────────────────────────────────────────────────────

function OngletInventaire() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filtreCategorie, setFiltreCategorie] = useState<string>("tous");
  const [filtreStatut, setFiltreStatut] = useState<string>("tous");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EquipForm>(EMPTY_FORM);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  const { data: categories = [] } = useGetCategoriesEquipements();
  const { data: equipements = [], isLoading } = useGetEquipements({
    categorie_id: filtreCategorie !== "tous" ? Number(filtreCategorie) : undefined,
    statut: filtreStatut !== "tous" ? filtreStatut : undefined,
  });

  const postMut = usePostEquipement({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetEquipementsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRapportInventaireEquipementsQueryKey() });
        toast({ title: "Équipement créé" });
        setShowForm(false);
        setForm(EMPTY_FORM);
      },
    },
  });

  const putMut = usePutEquipement({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetEquipementsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRapportInventaireEquipementsQueryKey() });
        toast({ title: "Équipement mis à jour" });
        setShowForm(false);
        setEditId(null);
        setForm(EMPTY_FORM);
      },
    },
  });

  const delMut = useDeleteEquipement({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetEquipementsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRapportInventaireEquipementsQueryKey() });
        toast({ title: "Équipement supprimé" });
        setConfirmDel(null);
      },
    },
  });

  const rows = (equipements as EquipRow[]).filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.designation?.toLowerCase().includes(q) ||
      e.marque?.toLowerCase().includes(q) ||
      e.numero_serie?.toLowerCase().includes(q) ||
      e.affecte_a?.toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(e: EquipRow) {
    setEditId(e.id);
    setForm({
      categorie_id: String(e.categorie_id),
      designation: e.designation,
      marque: e.marque ?? "",
      modele: e.modele ?? "",
      numero_serie: e.numero_serie ?? "",
      date_acquisition: e.date_acquisition ?? "",
      valeur_acquisition_fcfa: e.valeur_acquisition_fcfa ?? "",
      valeur_residuelle_fcfa: e.valeur_residuelle_fcfa ?? "0",
      duree_amortissement_ans: String(e.duree_amortissement_ans),
      methode_amortissement: e.methode_amortissement ?? "lineaire",
      affecte_a: e.affecte_a ?? "",
      date_mise_service: e.date_mise_service ?? "",
      garantie_expiration: e.garantie_expiration ?? "",
      statut: e.statut ?? "actif",
    });
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = {
      categorie_id: Number(form.categorie_id),
      designation: form.designation,
      marque: form.marque || undefined,
      modele: form.modele || undefined,
      numero_serie: form.numero_serie || undefined,
      date_acquisition: form.date_acquisition,
      valeur_acquisition_fcfa: Number(form.valeur_acquisition_fcfa),
      valeur_residuelle_fcfa: Number(form.valeur_residuelle_fcfa) || 0,
      duree_amortissement_ans: Number(form.duree_amortissement_ans),
      methode_amortissement: form.methode_amortissement as "lineaire" | "degressif",
      affecte_a: form.affecte_a || undefined,
      date_mise_service: form.date_mise_service || undefined,
      garantie_expiration: form.garantie_expiration || undefined,
      statut: form.statut as "actif" | "hors_service" | "cede" | "vole",
    };
    if (editId) {
      putMut.mutate({ id: editId, data: payload });
    } else {
      postMut.mutate({ data: payload });
    }
  }

  const statutLabels: Record<string, string> = {
    actif: "Actif", hors_service: "Hors service", cede: "Cédé", vole: "Volé",
  };

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52"
          />
          <Select value={filtreCategorie} onValueChange={setFiltreCategorie}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Toutes catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Toutes catégories</SelectItem>
              {(categories as { id: number; libelle: string }[]).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.libelle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtreStatut} onValueChange={setFiltreStatut}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tous statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous statuts</SelectItem>
              <SelectItem value="actif">Actif</SelectItem>
              <SelectItem value="hors_service">Hors service</SelectItem>
              <SelectItem value="cede">Cédé</SelectItem>
              <SelectItem value="vole">Volé</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate} className="bg-green-700 hover:bg-green-800 text-white">
          <PlusCircle className="w-4 h-4 mr-2" />
          Ajouter un équipement
        </Button>
      </div>

      {/* Tableau */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Désignation</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Catégorie</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Date acq.</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Valeur acq.</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Cumul amort.</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">VNC</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Statut</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Affecté à</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Chargement…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Aucun équipement</td></tr>
            )}
            {rows.map((e) => {
              const vPct = pct(e.valeur_nette_comptable_fcfa, e.valeur_acquisition_fcfa);
              return (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    <div>{e.designation}</div>
                    {e.marque && <div className="text-xs text-gray-500">{e.marque}{e.numero_serie ? ` — ${e.numero_serie}` : ""}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{e.categorie_libelle ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{e.date_acquisition}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmt(e.valeur_acquisition_fcfa)} F</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-red-600">{fmt(e.cumul_amortissement_fcfa)} F</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-mono text-xs font-semibold ${vncColor(vPct)}`}>
                      {fmt(e.valeur_nette_comptable_fcfa)} F
                    </span>
                    <div>
                      <Badge className={`text-xs ${vncBg(vPct)}`}>{vPct.toFixed(0)}%</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className="text-xs">
                      {statutLabels[e.statut] ?? e.statut}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{e.affecte_a ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => setConfirmDel(e.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Formulaire */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifier l'équipement" : "Ajouter un équipement"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Désignation *</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Ex : Camion benne ISUZU" />
            </div>
            <div>
              <Label>Catégorie *</Label>
              <Select value={form.categorie_id} onValueChange={(v) => {
                const cat = (categories as { id: number; libelle: string; duree_amortissement_ans: number; methode_amortissement: string }[]).find((c) => String(c.id) === v);
                setForm({ ...form, categorie_id: v, duree_amortissement_ans: cat ? String(cat.duree_amortissement_ans) : form.duree_amortissement_ans, methode_amortissement: cat ? cat.methode_amortissement : form.methode_amortissement });
              }}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {(categories as { id: number; libelle: string }[]).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marque</Label>
              <Input value={form.marque} onChange={(e) => setForm({ ...form, marque: e.target.value })} placeholder="Ex : ISUZU" />
            </div>
            <div>
              <Label>Modèle</Label>
              <Input value={form.modele} onChange={(e) => setForm({ ...form, modele: e.target.value })} />
            </div>
            <div>
              <Label>N° de série</Label>
              <Input value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} />
            </div>
            <div>
              <Label>Date d'acquisition *</Label>
              <Input type="date" value={form.date_acquisition} onChange={(e) => setForm({ ...form, date_acquisition: e.target.value })} />
            </div>
            <div>
              <Label>Date de mise en service</Label>
              <Input type="date" value={form.date_mise_service} onChange={(e) => setForm({ ...form, date_mise_service: e.target.value })} />
            </div>
            <div>
              <Label>Valeur d'acquisition (FCFA) *</Label>
              <Input type="number" value={form.valeur_acquisition_fcfa} onChange={(e) => setForm({ ...form, valeur_acquisition_fcfa: e.target.value })} />
            </div>
            <div>
              <Label>Valeur résiduelle (FCFA)</Label>
              <Input type="number" value={form.valeur_residuelle_fcfa} onChange={(e) => setForm({ ...form, valeur_residuelle_fcfa: e.target.value })} />
            </div>
            <div>
              <Label>Durée amortissement (ans) *</Label>
              <Input type="number" value={form.duree_amortissement_ans} onChange={(e) => setForm({ ...form, duree_amortissement_ans: e.target.value })} />
            </div>
            <div>
              <Label>Méthode d'amortissement</Label>
              <Select value={form.methode_amortissement} onValueChange={(v) => setForm({ ...form, methode_amortissement: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lineaire">Linéaire</SelectItem>
                  <SelectItem value="degressif">Dégressif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Affecté à</Label>
              <Input value={form.affecte_a} onChange={(e) => setForm({ ...form, affecte_a: e.target.value })} placeholder="Site ou agent" />
            </div>
            <div>
              <Label>Expiration garantie</Label>
              <Input type="date" value={form.garantie_expiration} onChange={(e) => setForm({ ...form, garantie_expiration: e.target.value })} />
            </div>
            {editId && (
              <div>
                <Label>Statut</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="hors_service">Hors service</SelectItem>
                    <SelectItem value="cede">Cédé</SelectItem>
                    <SelectItem value="vole">Volé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); }}>Annuler</Button>
            <Button
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={!form.designation || !form.categorie_id || !form.date_acquisition || !form.valeur_acquisition_fcfa || !form.duree_amortissement_ans || postMut.isPending || putMut.isPending}
              onClick={handleSubmit}
            >
              {postMut.isPending || putMut.isPending ? "Enregistrement…" : editId ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm suppression */}
      <Dialog open={confirmDel !== null} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Annuler</Button>
            <Button variant="destructive" disabled={delMut.isPending} onClick={() => { if (confirmDel) delMut.mutate({ id: confirmDel }); }}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onglet Amortissements ────────────────────────────────────────────────────

function OngletAmortissements() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [showTableau, setShowTableau] = useState(false);

  const { data: equipements = [] } = useGetEquipements({});
  const { data: tableau, isLoading: loadTableau } = useGetTableauAmortissement(
    selectedId ?? 0,
    { query: { enabled: !!selectedId && showTableau, queryKey: ["tableau-amort", selectedId] } }
  );

  const { data: rapport } = useGetRapportInventaireEquipements();
  const r = rapport as { vnc_totale?: number; cumul_amortissements?: number; valeur_brute_totale?: number } | undefined;

  const dotMut = usePostGenererDotations({
    mutation: {
      onSuccess: (data) => {
        const d = data as { nb_dotations?: number };
        qc.invalidateQueries({ queryKey: getGetEquipementsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRapportInventaireEquipementsQueryKey() });
        toast({ title: `${d.nb_dotations ?? 0} dotation(s) générée(s) pour ${String(mois).padStart(2, "0")}/${annee}` });
      },
    },
  });

  const rows = (tableau as { lignes?: unknown[] } | null)?.lignes as Array<{
    periode: string; dotation_fcfa: number; cumul_fcfa: number; vnc_fcfa: number;
  }> | undefined;

  const moisOptions = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Valeur brute du parc</div>
            <div className="text-2xl font-bold text-gray-800">{fmt(r?.valeur_brute_totale)} F</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Cumul amortissements</div>
            <div className="text-2xl font-bold text-red-600">{fmt(r?.cumul_amortissements)} F</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">VNC totale du parc</div>
            <div className="text-2xl font-bold text-green-700">{fmt(r?.vnc_totale)} F</div>
          </CardContent>
        </Card>
      </div>

      {/* Génération dotations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Générer les dotations mensuelles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label>Mois</Label>
              <Select value={String(mois)} onValueChange={(v) => setMois(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {moisOptions.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Année</Label>
              <Input type="number" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="w-28" />
            </div>
            <Button
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={dotMut.isPending}
              onClick={() => dotMut.mutate({ data: { mois, annee } })}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${dotMut.isPending ? "animate-spin" : ""}`} />
              Générer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau d'amortissement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            Tableau d'amortissement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Sélectionner un équipement</Label>
              <Select value={selectedId ? String(selectedId) : ""} onValueChange={(v) => { setSelectedId(Number(v)); setShowTableau(false); }}>
                <SelectTrigger><SelectValue placeholder="Choisir un équipement…" /></SelectTrigger>
                <SelectContent>
                  {(equipements as EquipRow[]).map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.designation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={!selectedId} onClick={() => setShowTableau(true)}>
              {showTableau ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              Afficher
            </Button>
          </div>

          {showTableau && selectedId && (
            loadTableau ? (
              <div className="text-center text-gray-400 py-4">Chargement…</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Période</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Dotation</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Cumul</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">VNC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(rows ?? []).map((l, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono text-xs">{l.periode}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{fmt(l.dotation_fcfa)} F</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-red-600">{fmt(l.cumul_fcfa)} F</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-green-700 font-semibold">{fmt(l.vnc_fcfa)} F</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Onglet Maintenance ───────────────────────────────────────────────────────

type MaintForm = {
  type: string;
  date_maintenance: string;
  description: string;
  cout_fcfa: string;
  prestataire: string;
  prochaine_maintenance: string;
};

const EMPTY_MAINT: MaintForm = {
  type: "preventive",
  date_maintenance: new Date().toISOString().slice(0, 10),
  description: "",
  cout_fcfa: "",
  prestataire: "",
  prochaine_maintenance: "",
};

function OngletMaintenance() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MaintForm>(EMPTY_MAINT);

  const { data: equipements = [] } = useGetEquipements({ statut: "actif" });
  const { data: alertes } = useGetEquipementsAlertes();
  const al = alertes as { maintenances_depassees?: { id: number; designation: string }[]; garanties_expirees?: { id: number; designation: string; garantie_expiration?: string }[] } | undefined;

  const { data: maintenances = [], isLoading } = useGetMaintenancesEquipement(
    selectedId ?? 0,
    { query: { enabled: !!selectedId, queryKey: getGetMaintenancesEquipementQueryKey(selectedId ?? 0) } }
  );

  const postMut = usePostMaintenanceEquipement({
    mutation: {
      onSuccess: () => {
        if (selectedId) qc.invalidateQueries({ queryKey: getGetMaintenancesEquipementQueryKey(selectedId) });
        qc.invalidateQueries({ queryKey: getGetEquipementsAlertesQueryKey() });
        toast({ title: "Maintenance enregistrée" });
        setShowForm(false);
        setForm(EMPTY_MAINT);
      },
    },
  });

  const typeLabels: Record<string, string> = {
    preventive: "Préventive", corrective: "Corrective", revision: "Révision",
  };

  return (
    <div className="space-y-4">
      {/* Alertes maintenance */}
      {((al?.maintenances_depassees?.length ?? 0) > 0 || (al?.garanties_expirees?.length ?? 0) > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Alertes ({(al?.maintenances_depassees?.length ?? 0) + (al?.garanties_expirees?.length ?? 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {al?.maintenances_depassees?.map((e) => (
              <div key={e.id} className="text-xs text-amber-700">
                🔧 {e.designation} — maintenance dépassée
              </div>
            ))}
            {al?.garanties_expirees?.map((e) => (
              <div key={e.id} className="text-xs text-amber-700">
                ⚠️ {e.designation} — garantie expirée
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sélecteur équipement + bouton */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex-1 min-w-60">
          <Label>Équipement</Label>
          <Select value={selectedId ? String(selectedId) : ""} onValueChange={(v) => setSelectedId(Number(v))}>
            <SelectTrigger><SelectValue placeholder="Choisir un équipement…" /></SelectTrigger>
            <SelectContent>
              {(equipements as EquipRow[]).map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.designation}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="bg-green-700 hover:bg-green-800 text-white"
          disabled={!selectedId}
          onClick={() => setShowForm(true)}
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Enregistrer maintenance
        </Button>
      </div>

      {/* Historique */}
      {selectedId && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Description</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Coût</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Prestataire</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Prochaine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Chargement…</td></tr>
              )}
              {!isLoading && (maintenances as unknown[]).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Aucune maintenance enregistrée</td></tr>
              )}
              {(maintenances as Array<{
                id: number; type: string; date_maintenance: string;
                description?: string | null; cout_fcfa?: string | null;
                prestataire?: string | null; prochaine_maintenance?: string | null;
              }>).map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{m.date_maintenance}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">{typeLabels[m.type] ?? m.type}</Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs max-w-xs truncate">{m.description ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{m.cout_fcfa ? `${fmt(m.cout_fcfa)} F` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{m.prestataire ?? "—"}</td>
                  <td className="px-3 py-2 text-xs font-mono">{m.prochaine_maintenance ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Formulaire maintenance */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setForm(EMPTY_MAINT); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enregistrer une maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventive">Préventive</SelectItem>
                    <SelectItem value="corrective">Corrective</SelectItem>
                    <SelectItem value="revision">Révision</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date_maintenance} onChange={(e) => setForm({ ...form, date_maintenance: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Détail de l'intervention" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Coût (FCFA)</Label>
                <Input type="number" value={form.cout_fcfa} onChange={(e) => setForm({ ...form, cout_fcfa: e.target.value })} />
              </div>
              <div>
                <Label>Prestataire</Label>
                <Input value={form.prestataire} onChange={(e) => setForm({ ...form, prestataire: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Prochaine maintenance prévue</Label>
              <Input type="date" value={form.prochaine_maintenance} onChange={(e) => setForm({ ...form, prochaine_maintenance: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_MAINT); }}>Annuler</Button>
            <Button
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={!form.type || !form.date_maintenance || postMut.isPending || !selectedId}
              onClick={() => {
                if (!selectedId) return;
                postMut.mutate({
                  id: selectedId,
                  data: {
                    type: form.type as "preventive" | "corrective" | "revision",
                    date_maintenance: form.date_maintenance,
                    description: form.description || undefined,
                    cout_fcfa: form.cout_fcfa ? Number(form.cout_fcfa) : undefined,
                    prestataire: form.prestataire || undefined,
                    prochaine_maintenance: form.prochaine_maintenance || undefined,
                  },
                });
              }}
            >
              {postMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onglet Rapport inventaire OHADA ─────────────────────────────────────────

function OngletRapport() {
  const { data: rapport, isLoading } = useGetRapportInventaireEquipements();
  const r = rapport as {
    valeur_brute_totale?: number;
    cumul_amortissements?: number;
    vnc_totale?: number;
    par_categorie?: Array<{
      categorie: string;
      valeur_brute: number;
      cumul_amortissement: number;
      vnc: number;
      nb_equipements: number;
    }>;
  } | undefined;

  if (isLoading) return <div className="text-center py-8 text-gray-400">Chargement…</div>;

  const lignes = r?.par_categorie ?? [];

  return (
    <div className="space-y-4">
      {/* KPI summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Valeur brute totale</div>
            <div className="text-2xl font-bold text-gray-800">{fmt(r?.valeur_brute_totale)} F</div>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Cumul amortissements</div>
            <div className="text-2xl font-bold text-red-600">{fmt(r?.cumul_amortissements)} F</div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">VNC totale (valeur comptable)</div>
            <div className="text-2xl font-bold text-green-700">{fmt(r?.vnc_totale)} F</div>
          </CardContent>
        </Card>
      </div>

      {/* Tableau OHADA */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            État des immobilisations — Bilan OHADA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Catégorie</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Nb équip.</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Brut</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Amort. cumulé</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">VNC</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">% amorti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Aucun équipement enregistré</td></tr>
                )}
                {lignes.map((l, i) => {
                  const amortPct = l.valeur_brute > 0 ? (l.cumul_amortissement / l.valeur_brute) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{l.categorie}</td>
                      <td className="px-4 py-2 text-center">{l.nb_equipements}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{fmt(l.valeur_brute)} F</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-red-600">{fmt(l.cumul_amortissement)} F</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-green-700 font-semibold">{fmt(l.vnc)} F</td>
                      <td className="px-4 py-2 text-right">
                        <Badge className={`text-xs ${vncBg(100 - amortPct)}`}>{amortPct.toFixed(0)}%</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {lignes.length > 0 && (
                <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 font-bold text-gray-800">TOTAL</td>
                    <td className="px-4 py-3 text-center font-bold">{lignes.reduce((s, l) => s + l.nb_equipements, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-xs">{fmt(r?.valeur_brute_totale)} F</td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-xs text-red-600">{fmt(r?.cumul_amortissements)} F</td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-xs text-green-700">{fmt(r?.vnc_totale)} F</td>
                    <td className="px-4 py-3 text-right">
                      {r?.valeur_brute_totale && r.valeur_brute_totale > 0
                        ? <Badge className="text-xs bg-gray-200 text-gray-700">{(((r.cumul_amortissements ?? 0) / r.valeur_brute_totale) * 100).toFixed(0)}%</Badge>
                        : "—"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">Conforme au plan comptable OHADA — Annexe au bilan (état des immobilisations)</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function EquipementsPage() {
  const { data: alertes } = useGetEquipementsAlertes();
  const al = alertes as { maintenances_depassees?: unknown[]; garanties_expirees?: unknown[]; totalement_amortis?: unknown[] } | undefined;
  const nbAlertes = (al?.maintenances_depassees?.length ?? 0) + (al?.garanties_expirees?.length ?? 0);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* En-tête */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-green-700" />
              Équipements & Immobilisations
            </h1>
            <p className="text-sm text-gray-500 mt-1">Gestion des équipements, amortissements et maintenances — OHADA</p>
          </div>
          {nbAlertes > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-700 font-medium">{nbAlertes} alerte{nbAlertes > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Onglets */}
        <Tabs defaultValue="inventaire">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="inventaire" className="flex items-center gap-1.5">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Inventaire</span>
            </TabsTrigger>
            <TabsTrigger value="amortissements" className="flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4" />
              <span className="hidden sm:inline">Amortissements</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-1.5 relative">
              <Wrench className="w-4 h-4" />
              <span className="hidden sm:inline">Maintenance</span>
              {nbAlertes > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center leading-none">
                  {nbAlertes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="rapport" className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Rapport OHADA</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventaire" className="mt-4">
            <OngletInventaire />
          </TabsContent>
          <TabsContent value="amortissements" className="mt-4">
            <OngletAmortissements />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <OngletMaintenance />
          </TabsContent>
          <TabsContent value="rapport" className="mt-4">
            <OngletRapport />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
