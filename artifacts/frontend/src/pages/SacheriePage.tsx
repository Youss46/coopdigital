import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Edit3,
  History,
  PackageOpen,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const token = () => localStorage.getItem("coop_token") ?? "";
const headers = () => ({
  Authorization: `Bearer ${token()}`,
  "Content-Type": "application/json",
});

type SacType = {
  id: number;
  nom: string;
  description?: string | null;
  stockMinimum: number;
  stockDisponible: number;
  actif: boolean;
  enAlerte: boolean;
};
type Delegate = {
  id: number;
  numeroMembre?: string | null;
  nom: string;
  prenoms?: string | null;
  village?: string | null;
  statut?: string | null;
  sacsDetenus: number;
};
type Movement = {
  id: number;
  typeSacId: number;
  typeSacNom?: string | null;
  type: "entree" | "attribution" | "retour" | "perte" | "ajustement";
  sens?: "plus" | "moins" | null;
  quantite: number;
  membreId?: number | null;
  membreNom?: string | null;
  membrePrenoms?: string | null;
  campagneId?: number | null;
  campagneLibelle?: string | null;
  motif?: string | null;
  reference: string;
  createdAt: string;
};
type Campaign = { id: number; libelle: string; statut?: string };
type Resume = {
  stockDisponible: number;
  sacsDetenus: number;
  typesActifs: number;
  membresDelegues: number;
  alertes: number;
};
type Tab = "pilotage" | "types" | "membres" | "historique";
type MovementType = Movement["type"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.erreur ?? "Une erreur est survenue");
  return body as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fullName(member?: Pick<Delegate, "nom" | "prenoms"> | null) {
  if (!member) return "Stock central";
  return [member.nom, member.prenoms].filter(Boolean).join(" ");
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function MemberSelector({
  members,
  value,
  onChange,
  required,
  allowCentral,
  testId,
}: {
  members: Delegate[];
  value: string;
  onChange: (value: string) => void;
  required: boolean;
  allowCentral: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedMember = members.find((member) => String(member.id) === value);
  const normalizedQuery = normalizeSearchText(query);
  const filteredMembers = useMemo(() => {
    if (!normalizedQuery) return members;
    return members.filter((member) => normalizeSearchText([
      fullName(member),
      member.numeroMembre ?? "",
      member.village ?? "",
    ].join(" ")).includes(normalizedQuery));
  }, [members, normalizedQuery]);

  function selectMember(memberId: string) {
    onChange(memberId);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="sacherie-member-picker">
      <div className={`sacherie-member-picker-control${open ? " is-open" : ""}`}>
        <Search size={15} aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={`${testId}-options`}
          aria-autocomplete="list"
          value={open ? query : selectedMember ? fullName(selectedMember) : ""}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={selectedMember ? fullName(selectedMember) : allowCentral ? "Rechercher ou choisir Stock central" : "Rechercher un membre"}
          aria-label="Rechercher un membre délégué par nom ou prénom"
          data-testid={testId}
        />
        {selectedMember && (
          <button
            type="button"
            className="sacherie-member-picker-clear"
            aria-label="Effacer le membre sélectionné"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectMember("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div id={`${testId}-options`} className="sacherie-member-picker-options" role="listbox">
          {allowCentral && !normalizedQuery && (
            <button
              type="button"
              role="option"
              aria-selected={!selectedMember}
              className={`sacherie-member-picker-option${!selectedMember ? " selected" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMember("")}
            >
              <strong>Stock central</strong>
              <small>Aucun membre délégué</small>
            </button>
          )}
          {filteredMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              role="option"
              aria-selected={String(member.id) === value}
              className={`sacherie-member-picker-option${String(member.id) === value ? " selected" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMember(String(member.id))}
            >
              <strong>{fullName(member)}</strong>
              <small>
                {[
                  member.numeroMembre,
                  member.village,
                  `${member.sacsDetenus} détenus`,
                ].filter(Boolean).join(" · ")}
              </small>
            </button>
          ))}
          {!filteredMembers.length && (
            <p className="sacherie-member-picker-empty">
              Aucun membre trouvé pour « {query} »
            </p>
          )}
          {required && !members.length && (
            <p className="sacherie-member-picker-empty">Aucun membre délégué disponible.</p>
          )}
        </div>
      )}
    </div>
  );
}

const movementMeta: Record<MovementType, { label: string; short: string; icon: typeof ArrowDownToLine; tone: string }> = {
  entree: { label: "Entrée stock", short: "Entrée", icon: ArrowDownToLine, tone: "sage" },
  attribution: { label: "Attribution", short: "Attribution", icon: ArrowUpFromLine, tone: "gold" },
  retour: { label: "Retour", short: "Retour", icon: RotateCcw, tone: "teal" },
  perte: { label: "Perte", short: "Perte", icon: CircleAlert, tone: "rose" },
  ajustement: { label: "Ajustement", short: "Ajustement", icon: SlidersHorizontal, tone: "ink" },
};

function Metric({ label, value, caption, icon: Icon, tone }: { label: string; value: number; caption: string; icon: typeof Boxes; tone: string }) {
  return (
    <div className={`sacherie-metric sacherie-metric-${tone}`} data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="sacherie-metric-icon"><Icon size={18} strokeWidth={1.8} /></div>
      <div className="min-w-0">
        <p className="sacherie-eyebrow">{label}</p>
        <p className="sacherie-metric-value">{value.toLocaleString("fr-FR")} <span>sacs</span></p>
        <p className="sacherie-metric-caption">{caption}</p>
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[hsl(39_31%_92%)] ${className}`} aria-label="Chargement" />;
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="sacherie-error" role="alert" data-testid="state-error">
      <CircleAlert size={20} />
      <div><p className="font-semibold">Les données n’ont pas pu être chargées</p><p className="text-sm">{error.message}</p></div>
      <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-sacherie">Réessayer</Button>
    </div>
  );
}

function TypeDialog({ open, onOpenChange, editing, canWrite, onSaved }: { open: boolean; onOpenChange: (value: boolean) => void; editing: SacType | null; canWrite: boolean; onSaved: () => void }) {
  const [name, setName] = useState(editing?.nom ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [minimum, setMinimum] = useState(String(editing?.stockMinimum ?? 0));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(editing?.nom ?? "");
    setDescription(editing?.description ?? "");
    setMinimum(String(editing?.stockMinimum ?? 0));
    setError("");
  }, [editing, open]);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api<SacType>(editing ? `/api/sacherie/types/${editing.id}` : "/api/sacherie/types", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({ nom: name.trim(), description: description.trim() || null, stockMinimum: Number(minimum), ...(editing ? {} : {}) }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sacherie-types"] });
      queryClient.invalidateQueries({ queryKey: ["sacherie-resume"] });
      onOpenChange(false); onSaved(); setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sacherie-dialog">
        <DialogHeader><DialogTitle>{editing ? "Modifier le type de sac" : "Nouveau type de sac"}</DialogTitle><DialogDescription>Le seuil déclenche une alerte dès que le stock disponible l’atteint.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <label className="sacherie-field"><span>Nom du type <b>*</b></span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Sac jute 64 kg" data-testid="input-type-sac-nom" /></label>
          <label className="sacherie-field"><span>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="sacherie-textarea" placeholder="Repère ou usage opérationnel" data-testid="input-type-sac-description" /></label>
          <label className="sacherie-field"><span>Seuil minimum <b>*</b></span><Input type="number" min="0" step="1" value={minimum} onChange={(e) => setMinimum(e.target.value)} data-testid="input-type-sac-seuil" /></label>
          {error && <p className="sacherie-form-error" role="alert">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-type">Annuler</Button><Button disabled={!canWrite || !name.trim() || mutation.isPending} onClick={() => mutation.mutate()} data-testid="button-save-type">{mutation.isPending ? "Enregistrement…" : editing ? "Enregistrer les changements" : "Créer le type"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ open, onOpenChange, types, members, campaigns, defaultType, canMove, canAdjust }: { open: boolean; onOpenChange: (value: boolean) => void; types: SacType[]; members: Delegate[]; campaigns: Campaign[]; defaultType: MovementType; canMove: boolean; canAdjust: boolean }) {
  const [movementType, setMovementType] = useState<MovementType>(defaultType);
  const [typeSacId, setTypeSacId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [membreId, setMembreId] = useState("");
  const [campagneId, setCampagneId] = useState("");
  const [sens, setSens] = useState<"plus" | "moins">("plus");
  const [motif, setMotif] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setMovementType(defaultType);
    setTypeSacId("");
    setQuantite("");
    setMembreId("");
    setCampagneId("");
    setSens("plus");
    setMotif("");
    setError("");
  }, [defaultType, open]);
  const queryClient = useQueryClient();
  const isAdjustment = movementType === "ajustement";
  const isAttribution = movementType === "attribution";
  const isReturn = movementType === "retour";
  const isLoss = movementType === "perte";
  const mutation = useMutation({
    mutationFn: () => api("/api/sacherie/mouvements", {
      method: "POST",
      body: JSON.stringify({
        typeSacId: Number(typeSacId), type: movementType, quantite: Number(quantite),
        reference: crypto.randomUUID(),
        ...(membreId ? { membreId: Number(membreId) } : {}),
        ...(campagneId ? { campagneId: Number(campagneId) } : {}),
        ...(isAdjustment ? { sens } : {}),
        ...(motif.trim() ? { motif: motif.trim() } : {}),
      }),
    }),
    onSuccess: () => {
      ["sacherie-resume", "sacherie-types", "sacherie-membres", "sacherie-mouvements"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      onOpenChange(false); setError(""); setQuantite(""); setMembreId(""); setCampagneId(""); setMotif("");
    },
    onError: (err: Error) => setError(err.message),
  });
  const selected = types.find((item) => String(item.id) === typeSacId);
  const valid = Boolean(typeSacId && Number(quantite) > 0 && (!isAttribution || (membreId && campagneId)) && (!isReturn || membreId) && (!isAdjustment || canAdjust));
  const OperationIcon = movementMeta[movementType].icon;
  const movementOptions = (["entree", "attribution", "retour", "perte", "ajustement"] as MovementType[]).filter((item) => item !== "ajustement" || canAdjust);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sacherie-dialog sacherie-dialog-movement">
        <DialogHeader>
          <div className="flex items-center gap-3"><div className={`sacherie-operation-icon ${movementMeta[movementType].tone}`}><OperationIcon size={19} /></div><div><DialogTitle>Enregistrer un mouvement</DialogTitle><DialogDescription>Chaque opération reçoit une référence unique et reste dans l’historique auditable.</DialogDescription></div></div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="sacherie-segmented" role="tablist" aria-label="Type de mouvement">
            {movementOptions.map((item) => <button key={item} type="button" role="tab" aria-selected={movementType === item} onClick={() => setMovementType(item)} className={movementType === item ? "active" : ""} data-testid={`tab-movement-${item}`}>{movementMeta[item].short}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sacherie-field"><span>Type de sac <b>*</b></span><select value={typeSacId} onChange={(e) => setTypeSacId(e.target.value)} className="sacherie-select" data-testid="select-movement-type"><option value="">Sélectionner un type</option>{types.filter((item) => item.actif || isAdjustment).map((item) => <option key={item.id} value={item.id}>{item.nom} · {item.stockDisponible} disponibles</option>)}</select></label>
            <label className="sacherie-field"><span>Quantité <b>*</b></span><Input type="number" min="1" step="1" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="0" data-testid="input-movement-quantity" /></label>
          </div>
          {isAdjustment && <div className="sacherie-direction" role="group" aria-label="Sens de l’ajustement"><button type="button" className={sens === "plus" ? "active plus" : ""} onClick={() => setSens("plus")} data-testid="button-adjustment-plus"><Plus size={15} /> Ajouter au stock</button><button type="button" className={sens === "moins" ? "active moins" : ""} onClick={() => setSens("moins")} data-testid="button-adjustment-minus"><ArrowUpFromLine size={15} /> Retirer du stock</button></div>}
          {(isAttribution || isReturn || isLoss) && <label className="sacherie-field"><span>Membre délégué {isAttribution || isReturn ? <b>*</b> : <em>(facultatif pour une perte centrale)</em>}</span><MemberSelector members={members} value={membreId} onChange={setMembreId} required={isAttribution || isReturn} allowCentral={isLoss} testId="select-movement-member" /></label>}
          {isAttribution && <label className="sacherie-field"><span>Campagne <b>*</b></span><select value={campagneId} onChange={(e) => setCampagneId(e.target.value)} className="sacherie-select" data-testid="select-movement-campaign"><option value="">Sélectionner une campagne</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.libelle}{campaign.statut === "ouverte" ? " · ouverte" : ""}</option>)}</select></label>}
          <label className="sacherie-field"><span>Motif ou précision</span><textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} className="sacherie-textarea" placeholder={isLoss ? "Décrire la perte constatée" : "Note opérationnelle (facultatif)"} data-testid="input-movement-reason" /></label>
          {selected && <div className="sacherie-form-context"><PackageOpen size={15} /><span><strong>{selected.nom}</strong> · stock après opération estimé selon le mouvement</span></div>}
          {error && <p className="sacherie-form-error" role="alert">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-movement">Annuler</Button><Button disabled={!canMove || !valid || mutation.isPending} onClick={() => mutation.mutate()} data-testid="button-save-movement">{mutation.isPending ? "Enregistrement…" : "Confirmer le mouvement"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SacheriePage() {
  const [tab, setTab] = useState<Tab>("pilotage");
  const [typeDialog, setTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<SacType | null>(null);
  const [movementDialog, setMovementDialog] = useState<MovementType | null>(null);
  const [search, setSearch] = useState("");
  const [historyType, setHistoryType] = useState("all");
  const [historyKind, setHistoryKind] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  const canManageTypes = usePermission("sacherie", "gerer_types");
  const canMove = usePermission("sacherie", "mouvement");
  const canAdjust = usePermission("sacherie", "ajuster");
  const queryClient = useQueryClient();
  const resume = useQuery<Resume>({ queryKey: ["sacherie-resume"], queryFn: () => api("/api/sacherie/resume") });
  const types = useQuery<SacType[]>({ queryKey: ["sacherie-types"], queryFn: () => api("/api/sacherie/types") });
  const members = useQuery<Delegate[]>({ queryKey: ["sacherie-membres"], queryFn: () => api("/api/sacherie/membres") });
  const movements = useQuery<Movement[]>({ queryKey: ["sacherie-mouvements"], queryFn: () => api("/api/sacherie/mouvements") });
  const campaigns = useQuery<Campaign[]>({ queryKey: ["sacherie-campagnes"], queryFn: () => api("/api/campagnes"), staleTime: 60_000 });
  const toggleType = useMutation({
    mutationFn: ({ id, actif }: { id: number; actif: boolean }) => api(`/api/sacherie/types/${id}`, { method: "PATCH", body: JSON.stringify({ actif }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sacherie-types"] }); queryClient.invalidateQueries({ queryKey: ["sacherie-resume"] }); },
  });

  const typeRows = types.data ?? [];
  const memberRows = useMemo(() => (members.data ?? []).filter((member) => fullName(member).toLowerCase().includes(memberSearch.toLowerCase()) || (member.village ?? "").toLowerCase().includes(memberSearch.toLowerCase())), [members.data, memberSearch]);
  const historyRows = useMemo(() => (movements.data ?? []).filter((movement) => (historyType === "all" || String(movement.typeSacId) === historyType) && (historyKind === "all" || movement.type === historyKind)), [movements.data, historyType, historyKind]);
  const alertTypes = typeRows.filter((item) => item.enAlerte);
  const queryError = [resume, types, members, movements].find((query) => query.isError)?.error as Error | undefined;
  const isLoading = resume.isLoading || types.isLoading || members.isLoading || movements.isLoading;

  const refreshAll = () => [resume, types, members, movements].forEach((query) => query.refetch());
  const openNewType = () => { setEditingType(null); setTypeDialog(true); };
  const openEditType = (item: SacType) => { setEditingType(item); setTypeDialog(true); };
  return (
    <div className="sacherie-page" data-testid="page-sacherie">
      <div className="sacherie-header">
        <div>
          <div className="sacherie-kicker"><span className="sacherie-kicker-mark" /> Poste de contrôle · logistique</div>
          <h1>Sacherie</h1>
          <p>Chaque sac compte. Suivez le stock, les remises et les écarts de la coopérative.</p>
        </div>
        <div className="sacherie-header-actions">
          <span className="sacherie-live"><span /> Données synchronisées</span>
          {canMove && <Button onClick={() => setMovementDialog("entree")} data-testid="button-new-movement"><Plus size={16} /> Nouveau mouvement</Button>}
        </div>
      </div>

      {queryError && <ErrorState error={queryError} onRetry={refreshAll} />}
      {isLoading ? <div className="sacherie-metrics-grid">{[1, 2, 3, 4].map((item) => <Skeleton className="h-[112px]" key={item} />)}</div> : (
        <div className="sacherie-metrics-grid">
          <Metric label="Disponible central" value={resume.data?.stockDisponible ?? 0} caption="hors sacs déjà remis" icon={Boxes} tone="brown" />
          <Metric label="Chez les délégués" value={resume.data?.sacsDetenus ?? 0} caption={`${resume.data?.membresDelegues ?? 0} membres suivis`} icon={UsersRound} tone="teal" />
          <Metric label="Types actifs" value={resume.data?.typesActifs ?? 0} caption={`${typeRows.length} types configurés`} icon={PackageOpen} tone="gold" />
          <Metric label="À traiter" value={resume.data?.alertes ?? 0} caption={resume.data?.alertes ? "seuils minimum atteints" : "aucune alerte stock"} icon={AlertTriangle} tone={resume.data?.alertes ? "rose" : "sage"} />
        </div>
      )}

      <div className="sacherie-workspace">
        <nav className="sacherie-tabs" aria-label="Sections sacherie">
          {([["pilotage", "Vue d’ensemble", ClipboardList], ["types", "Types de sacs", Boxes], ["membres", "Soldes membres", UsersRound], ["historique", "Historique auditable", History]] as const).map(([key, label, Icon]) => <button key={key} onClick={() => setTab(key)} className={tab === key ? "active" : ""} data-testid={`tab-sacherie-${key}`}><Icon size={16} /> <span>{label}</span>{key === "historique" && movements.data && <small>{movements.data.length}</small>}</button>)}
        </nav>

        {tab === "pilotage" && <section className="sacherie-section" aria-labelledby="pilotage-title">
          <div className="sacherie-section-heading"><div><p className="sacherie-overline">Lecture immédiate</p><h2 id="pilotage-title">Où en est le stock ?</h2></div><button className="sacherie-text-button" onClick={() => setTab("historique")} data-testid="button-view-history">Voir le journal <ChevronRight size={14} /></button></div>
          <div className="sacherie-overview-grid">
            <div className="sacherie-stock-panel">
              <div className="sacherie-panel-top"><div><p className="sacherie-eyebrow">Stock central disponible</p><p className="sacherie-big-number">{(resume.data?.stockDisponible ?? 0).toLocaleString("fr-FR")} <span>sacs</span></p></div><div className="sacherie-square-icon"><Boxes size={21} /></div></div>
              <div className="sacherie-stock-line"><div><span>Répartition estimée</span><strong>{(resume.data?.sacsDetenus ?? 0).toLocaleString("fr-FR")} chez les délégués</strong></div><div className="sacherie-bar"><span style={{ width: `${Math.min(100, ((resume.data?.sacsDetenus ?? 0) / Math.max(1, (resume.data?.stockDisponible ?? 0) + (resume.data?.sacsDetenus ?? 0))) * 100)}%` }} /></div><div className="flex justify-between text-xs text-[hsl(24_10%_48%)]"><span>Central</span><span>Délégués</span></div></div>
              <div className="sacherie-panel-footer"><span><Check size={14} /> Calculé depuis le journal des mouvements</span><span className="font-mono">LIVE</span></div>
            </div>
            <div className={`sacherie-alert-panel ${alertTypes.length ? "has-alert" : ""}`}>
              <div className="flex items-start gap-3"><div className="sacherie-alert-icon"><AlertTriangle size={18} /></div><div><p className="sacherie-eyebrow">Contrôle des seuils</p><h3>{alertTypes.length ? `${alertTypes.length} type${alertTypes.length > 1 ? "s" : ""} à réapprovisionner` : "Stock sous contrôle"}</h3><p>{alertTypes.length ? "Le stock disponible a atteint le seuil minimum configuré." : "Aucun écart de seuil ne demande votre attention."}</p></div></div>
              {alertTypes.length > 0 && <div className="sacherie-alert-list">{alertTypes.slice(0, 3).map((item) => <button key={item.id} onClick={() => { setTab("types"); setSearch(item.nom); }} data-testid={`alert-type-${item.id}`}><span>{item.nom}</span><strong>{item.stockDisponible} <em>/ min. {item.stockMinimum}</em></strong><ChevronRight size={14} /></button>)}</div>}
              {alertTypes.length > 3 && <button className="sacherie-text-button mt-3" onClick={() => setTab("types")} data-testid="button-view-all-alerts">Voir les {alertTypes.length} alertes <ChevronRight size={14} /></button>}
            </div>
          </div>
          <div className="sacherie-section-heading sacherie-subheading"><div><p className="sacherie-overline">Dernières opérations</p><h2>Mouvements récents</h2></div><button className="sacherie-text-button" onClick={() => setTab("historique")} data-testid="button-view-all-movements">Historique complet <ChevronRight size={14} /></button></div>
          <MovementTable rows={(movements.data ?? []).slice(0, 5)} empty={!movements.isLoading} />
        </section>}

        {tab === "types" && <section className="sacherie-section" aria-labelledby="types-title">
          <div className="sacherie-section-heading"><div><p className="sacherie-overline">Référentiel & seuils</p><h2 id="types-title">Types de sacs</h2><p className="sacherie-section-note">Le disponible central est recalculé à partir des mouvements validés.</p></div>{canManageTypes && <Button onClick={openNewType} data-testid="button-new-type"><Plus size={16} /> Ajouter un type</Button>}</div>
          <div className="sacherie-toolbar"><label className="sacherie-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un type…" aria-label="Rechercher un type de sac" data-testid="input-search-types" />{search && <button onClick={() => setSearch("")} aria-label="Effacer la recherche" data-testid="button-clear-type-search"><X size={14} /></button>}</label><span className="sacherie-result-count">{typeRows.filter((item) => item.nom.toLowerCase().includes(search.toLowerCase())).length} types</span></div>
          {types.isLoading ? <div className="sacherie-type-grid">{[1, 2, 3].map((item) => <Skeleton className="h-[174px]" key={item} />)}</div> : typeRows.filter((item) => item.nom.toLowerCase().includes(search.toLowerCase())).length === 0 ? <EmptyState icone={Boxes} titre={search ? "Aucun type correspondant" : "Aucun type de sac"} description={search ? "Essayez un autre terme de recherche." : "Ajoutez votre premier type de sac pour commencer le suivi."} /> : <div className="sacherie-type-grid">{typeRows.filter((item) => item.nom.toLowerCase().includes(search.toLowerCase())).map((item) => <TypeCard key={item.id} item={item} canManage={canManageTypes} onEdit={openEditType} onToggle={(value) => { if (window.confirm(`${value ? "Activer" : "Désactiver"} le type « ${item.nom} » ?`)) toggleType.mutate({ id: item.id, actif: value }); }} />)}</div>}
        </section>}

        {tab === "membres" && <section className="sacherie-section" aria-labelledby="members-title">
          <div className="sacherie-section-heading"><div><p className="sacherie-overline">Détention par localité</p><h2 id="members-title">Soldes des membres délégués</h2><p className="sacherie-section-note">Les soldes incluent les attributions, retours et pertes rattachés à chaque membre.</p></div><div className="sacherie-member-total">{memberRows.reduce((sum, item) => sum + item.sacsDetenus, 0).toLocaleString("fr-FR")} <span>sacs détenus</span></div></div>
          <div className="sacherie-toolbar"><label className="sacherie-search"><Search size={16} /><input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Nom ou localité…" aria-label="Rechercher un membre délégué" data-testid="input-search-members" /></label><span className="sacherie-result-count">{memberRows.length} membres</span></div>
          {members.isLoading ? <div className="sacherie-member-list">{[1, 2, 3].map((item) => <Skeleton className="h-[68px]" key={item} />)}</div> : memberRows.length === 0 ? <EmptyState icone={UsersRound} titre="Aucun membre délégué" description={memberSearch ? "Aucun membre ne correspond à votre recherche." : "Les membres délégués de localités apparaîtront ici."} /> : <div className="sacherie-member-list">{memberRows.map((member) => <div className="sacherie-member-row" key={member.id} data-testid={`row-member-${member.id}`}><div className="sacherie-avatar">{member.nom.slice(0, 1)}{member.prenoms?.slice(0, 1) ?? ""}</div><div className="min-w-0 flex-1"><p className="font-semibold text-[hsl(24_24%_16%)] truncate">{fullName(member)}</p><p className="text-xs text-[hsl(24_10%_48%)]">{member.numeroMembre ? `${member.numeroMembre} · ` : ""}{member.village ?? "Localité non renseignée"}</p></div><span className={`sacherie-status ${member.statut === "actif" ? "ok" : ""}`}>{member.statut ?? "—"}</span><div className="sacherie-member-balance"><strong>{member.sacsDetenus}</strong><span>sac{member.sacsDetenus !== 1 ? "s" : ""}</span></div><button className="sacherie-row-action" onClick={() => { setTab("historique"); setSearch(fullName(member)); }} aria-label={`Voir les mouvements de ${fullName(member)}`} data-testid={`button-member-history-${member.id}`}><ChevronRight size={16} /></button></div>)}</div>}
        </section>}

        {tab === "historique" && <section className="sacherie-section" aria-labelledby="history-title">
          <div className="sacherie-section-heading"><div><p className="sacherie-overline">Traçabilité complète</p><h2 id="history-title">Historique auditable</h2><p className="sacherie-section-note">Les références garantissent l’unicité de chaque opération.</p></div></div>
          <div className="sacherie-history-filters"><select value={historyType} onChange={(e) => setHistoryType(e.target.value)} className="sacherie-select" aria-label="Filtrer par type de sac" data-testid="select-history-sac-type"><option value="all">Tous les types de sacs</option>{typeRows.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select><select value={historyKind} onChange={(e) => setHistoryKind(e.target.value)} className="sacherie-select" aria-label="Filtrer par opération" data-testid="select-history-operation"><option value="all">Toutes les opérations</option>{Object.entries(movementMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select><span className="sacherie-result-count">{historyRows.length} opérations</span></div>
          <MovementTable rows={historyRows} empty />
        </section>}
      </div>

      <TypeDialog open={typeDialog} onOpenChange={setTypeDialog} editing={editingType} canWrite={canManageTypes} onSaved={() => setEditingType(null)} />
      <MovementDialog open={movementDialog !== null} onOpenChange={(open) => !open && setMovementDialog(null)} types={typeRows} members={members.data ?? []} campaigns={campaigns.data ?? []} defaultType={movementDialog ?? "entree"} canMove={canMove} canAdjust={canAdjust} />
    </div>
  );
}

function TypeCard({ item, canManage, onEdit, onToggle }: { item: SacType; canManage: boolean; onEdit: (item: SacType) => void; onToggle: (active: boolean) => void }) {
  const ratio = item.stockMinimum > 0 ? Math.min(100, (item.stockDisponible / item.stockMinimum) * 100) : item.stockDisponible > 0 ? 100 : 0;
  return <article className={`sacherie-type-card ${!item.actif ? "inactive" : ""}`} data-testid={`card-type-sac-${item.id}`}><div className="sacherie-type-top"><div className="sacherie-type-glyph"><PackageOpen size={18} /></div><span className={`sacherie-status ${item.actif ? "ok" : ""}`}>{item.actif ? "Actif" : "Désactivé"}</span></div><h3>{item.nom}</h3>{item.description && <p className="sacherie-type-description">{item.description}</p>}<div className="sacherie-type-stock"><div><span>Disponible</span><strong className={item.enAlerte ? "warning" : ""}>{item.stockDisponible}</strong></div><div className="text-right"><span>Seuil minimum</span><strong>{item.stockMinimum}</strong></div></div><div className="sacherie-mini-bar"><span className={item.enAlerte ? "warning" : ""} style={{ width: `${ratio}%` }} /></div>{canManage && <div className="sacherie-card-actions"><button onClick={() => onEdit(item)} data-testid={`button-edit-type-${item.id}`}><Edit3 size={14} /> Modifier</button><button onClick={() => onToggle(!item.actif)} data-testid={`button-toggle-type-${item.id}`}>{item.actif ? "Désactiver" : "Activer"}</button></div>}</article>;
}

function MovementTable({ rows, empty }: { rows: Movement[]; empty: boolean }) {
  if (!rows.length && empty) return <EmptyState icone={History} titre="Aucun mouvement enregistré" description="Les opérations apparaîtront ici dès qu’elles seront enregistrées." />;
  if (!rows.length) return <div className="sacherie-table-empty"><History size={18} /><span>Aucun mouvement récent</span></div>;
  return <div className="sacherie-table-wrap"><table className="sacherie-table"><thead><tr><th>Opération</th><th>Type de sac</th><th>Destination / origine</th><th>Quantité</th><th>Référence</th><th>Date</th></tr></thead><tbody>{rows.map((movement) => { const meta = movementMeta[movement.type]; const Icon = meta.icon; return <tr key={movement.id} data-testid={`row-movement-${movement.id}`}><td><span className={`sacherie-movement-icon ${meta.tone}`}><Icon size={15} /></span><strong>{meta.label}{movement.type === "ajustement" && movement.sens ? ` · ${movement.sens}` : ""}</strong></td><td>{movement.typeSacNom ?? "—"}</td><td>{movement.membreId ? <>{fullName({ nom: movement.membreNom ?? "", prenoms: movement.membrePrenoms })}{movement.campagneLibelle && <small>{movement.campagneLibelle}</small>}</> : <span className="text-[hsl(24_10%_48%)]">Stock central</span>}</td><td><b className={movement.type === "attribution" || movement.type === "perte" || (movement.type === "ajustement" && movement.sens === "moins") ? "quantity-out" : "quantity-in"}>{movement.type === "attribution" || movement.type === "perte" || (movement.type === "ajustement" && movement.sens === "moins") ? "−" : "+"}{movement.quantite}</b></td><td><code title={movement.reference}>{movement.reference.slice(0, 13)}…</code></td><td>{formatDate(movement.createdAt)}</td></tr>})}</tbody></table></div>;
}