import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MoneyInput } from "@/components/ui/money-input";

// ─── Types commissions ─────────────────────────────────────────────────────
interface Campagne {
  id: number;
  libelle: string;
  anneeDebut: number;
  anneeFin: number | null;
  statut: string;
}

interface TauxCommission {
  id: number;
  campagneId: number | null;
  delegueId: number | null;
  tauxFcfaParKg: string;
  dateDebut: string;
  dateFin: string | null;
  actif: boolean;
  campagneLibelle: string | null;
  delegueNom: string | null;
  deleguePrenoms: string | null;
}

interface CommissionDelegue {
  id: number;
  livraisonId: number;
  poidsKg: string;
  tauxFcfaParKg: string;
  montantFcfa: string;
  statut: string;
  createdAt: string;
}

interface CommissionsData {
  commissions: CommissionDelegue[];
  totaux: { enAttente: number; paye: number; total: number };
}

interface RecapCommission {
  delegueId: number;
  nom: string;
  prenoms: string | null;
  section: string | null;
  enAttenteFcfa: number;
  totalPayeFcfa: number;
  totalFcfa: number;
  nb: number;
}

const API = import.meta.env.VITE_API_URL ?? "";

const MODES_PAIEMENT = [
  { value: "especes",      label: "Espèces" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo",     label: "MTN Mobile Money" },
  { value: "wave",         label: "Wave" },
  { value: "virement",     label: "Virement bancaire" },
  { value: "cheque",       label: "Chèque" },
] as const;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("coop_token");
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `Erreur ${res.status}`); }
  return res.json();
}

interface Delegue {
  id: number;
  nom: string;
  prenoms: string;
  telephone: string | null;
  section: string | null;
  actif: boolean;
  caisse: { id: number | null; solde: number };
  paiementsDifferes: { nb: number; montantTotal: number };
  nbCollectes: number;
}

interface DetailCaisse {
  agent: { id: number; nom: string; prenoms: string; section: string | null };
  caisse: { id: number; solde: number; plafond: number | null };
  mouvements: Array<{ id: number; type: string; montantFcfa: number; soldeApresFcfa: number; note: string | null; createdAt: string }>;
  paiementsDifferes: Array<{ livraisonId: number; membreNom: string; dateLivraison: string; montantRestant: number }>;
}

function BadgePaiement({ nb }: { nb: number }) {
  if (nb === 0) return <span style={{ color: "#6b7280", fontSize: ".8rem" }}>—</span>;
  return <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 12, padding: "2px 8px", fontSize: ".78rem", fontWeight: 700 }}>{nb} en attente</span>;
}

export default function DeleguesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAppro, setShowAppro] = useState<number | null>(null);
  const [montant, setMontant] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"liste" | "differes" | "commissions">("liste");

  // ── État onglet Commissions ──────────────────────────────────────────────
  const [commTab, setCommTab] = useState<"taux" | "recap" | "pardelegue">("taux");
  const [commDelegueId, setCommDelegueId] = useState<number | null>(null);
  const [showTauxForm, setShowTauxForm] = useState(false);
  const [editTaux, setEditTaux] = useState<Partial<TauxCommission> | null>(null);
  const [commCampagneId, setCommCampagneId] = useState<number | null>(null);
  const [dlReleve, setDlReleve] = useState(false);
  const [dlReleveErr, setDlReleveErr] = useState<string | null>(null);

  // ── Modal paiement commission ────────────────────────────────────────────
  const [showPayerModal, setShowPayerModal] = useState<{
    delegueId: number;
    montant: number;
    commissionIds?: number[];
  } | null>(null);
  const [payerMode, setPayerMode] = useState<string>("especes");
  const [payerRef, setPayerRef] = useState<string>("");

  async function telechargerReleve() {
    if (!commDelegueId) return;
    setDlReleve(true);
    setDlReleveErr(null);
    try {
      const token = localStorage.getItem("coop_token");
      const qs = commCampagneId ? `?campagneId=${commCampagneId}` : "";
      const res = await fetch(`${API}/api/delegues/${commDelegueId}/commissions/releve${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `releve_commissions_delegue_${commDelegueId}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      setDlReleveErr((e as Error).message);
    } finally {
      setDlReleve(false);
    }
  }

  const { data: delegues = [], isLoading } = useQuery<Delegue[]>({
    queryKey: ["delegues"],
    queryFn: () => apiFetch("/delegues"),
  });

  const { data: detail } = useQuery<DetailCaisse>({
    queryKey: ["delegue-caisse", selectedId],
    queryFn: () => apiFetch(`/delegues/${selectedId}/caisse`),
    enabled: selectedId !== null,
  });

  const { data: differes = [] } = useQuery<Array<{ livraisonId: number; dateLivraison: string; montantRestant: number; membreNom: string; agentNom: string; agentSection: string }>>({
    queryKey: ["paiements-differes-admin"],
    queryFn: () => apiFetch("/delegues/paiements-differes"),
    enabled: tab === "differes",
  });

  // ── Queries commissions ──────────────────────────────────────────────────
  const { data: taux = [], isLoading: tauxLoading } = useQuery<TauxCommission[]>({
    queryKey: ["commissions-taux"],
    queryFn: () => apiFetch("/delegues/commissions/taux"),
    enabled: tab === "commissions",
  });

  const { data: campagnes = [] } = useQuery<Campagne[]>({
    queryKey: ["campagnes"],
    queryFn: () => apiFetch("/campagnes"),
    enabled: tab === "commissions",
  });

  const { data: recap = [] } = useQuery<RecapCommission[]>({
    queryKey: ["commissions-recap", commCampagneId],
    queryFn: () => {
      const qs = commCampagneId ? `?campagneId=${commCampagneId}` : "";
      return apiFetch(`/delegues/commissions/recap${qs}`);
    },
    enabled: tab === "commissions" && commTab === "recap",
  });

  const { data: commissions } = useQuery<CommissionsData>({
    queryKey: ["commissions-delegue", commDelegueId, commCampagneId],
    queryFn: () => {
      const qs = commCampagneId ? `?campagneId=${commCampagneId}` : "";
      return apiFetch(`/delegues/${commDelegueId}/commissions${qs}`);
    },
    enabled: commDelegueId !== null && tab === "commissions" && commTab === "pardelegue",
  });

  // ── Mutations commissions ────────────────────────────────────────────────
  const upsertTaux = useMutation({
    mutationFn: (data: Partial<TauxCommission> & { tauxFcfaParKg: string; dateDebut: string }) =>
      apiFetch("/delegues/commissions/taux", { method: "POST", body: JSON.stringify({
        id: data.id,
        campagneId: data.campagneId || null,
        delegueId: data.delegueId || null,
        tauxFcfaParKg: Number(data.tauxFcfaParKg),
        dateDebut: data.dateDebut,
        dateFin: data.dateFin || null,
        actif: data.actif ?? true,
      }) }),
    onSuccess: () => {
      toast({ title: editTaux?.id ? "Taux mis à jour" : "Taux créé avec succès" });
      setShowTauxForm(false); setEditTaux(null);
      qc.invalidateQueries({ queryKey: ["commissions-taux"] });
    },
    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
  });

  const deleteTaux = useMutation({
    mutationFn: (id: number) => apiFetch(`/delegues/commissions/taux/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Taux supprimé" });
      qc.invalidateQueries({ queryKey: ["commissions-taux"] });
    },
    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
  });

  const payerComm = useMutation({
    mutationFn: ({ delegueId, commissionIds, modePaiement, referencePaiement }: {
      delegueId: number;
      commissionIds?: number[];
      modePaiement: string;
      referencePaiement?: string;
    }) =>
      apiFetch<{ montantTotal: number; nb: number }>(`/delegues/${delegueId}/commissions/payer`, {
        method: "POST",
        body: JSON.stringify({ modePaiement, referencePaiement: referencePaiement || undefined, ...(commissionIds?.length ? { commissionIds } : {}) }),
      }),
    onSuccess: (data) => {
      const modeLabel = MODES_PAIEMENT.find(m => m.value === payerMode)?.label ?? payerMode;
      toast({ title: `${data.nb} commission(s) payées — ${data.montantTotal.toLocaleString("fr-FR")} FCFA (${modeLabel})` });
      setShowPayerModal(null);
      setPayerMode("especes");
      setPayerRef("");
      qc.invalidateQueries({ queryKey: ["commissions-delegue"] });
      qc.invalidateQueries({ queryKey: ["delegues"] });
    },
    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
  });

  const appro = useMutation({
    mutationFn: ({ agentId, montantFcfa, note }: { agentId: number; montantFcfa: number; note: string }) =>
      apiFetch(`/delegues/${agentId}/approvisionner`, { method: "POST", body: JSON.stringify({ montantFcfa, note }) }),
    onSuccess: () => {
      toast({ title: "Caisse approvisionnée avec succès" });
      setShowAppro(null); setMontant(""); setNote("");
      qc.invalidateQueries({ queryKey: ["delegues"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["delegue-caisse", selectedId] });
    },
    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
  });

  const totalSoldes = delegues.reduce((s, d) => s + d.caisse.solde, 0);
  const totalDifferes = delegues.reduce((s, d) => s + d.paiementsDifferes.nb, 0);
  const totalDu = delegues.reduce((s, d) => s + d.paiementsDifferes.montantTotal, 0);

  return (
    <div className="p-4 sm:p-6 md:px-8" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111", marginBottom: 4 }}>Délégués Localité</h1>
          <p style={{ color: "#6b7280", fontSize: ".9rem" }}>Gestion des caisses et suivi des paiements différés</p>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 16, marginBottom: 24 }}>
          {[
            { label: "Délégués actifs", val: delegues.filter(d => d.actif).length, color: "#16a34a" },
            { label: "Total en caisse", val: `${totalSoldes.toLocaleString("fr-FR")} FCFA`, color: "#2563eb" },
            { label: "Paiements différés", val: `${totalDifferes} — ${totalDu.toLocaleString("fr-FR")} FCFA`, color: "#dc2626" },
          ].map((k) => (
            <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: ".8rem", color: "#6b7280", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: k.color }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto" style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f3f4f6", borderRadius: 10, padding: 4, width: "fit-content", maxWidth: "100%" }}>
          {([
            { key: "liste", label: "Liste des délégués" },
            { key: "differes", label: `Paiements différés${totalDifferes > 0 ? ` (${totalDifferes})` : ""}` },
            { key: "commissions", label: "Commissions" },
          ] as { key: "liste" | "differes" | "commissions"; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: "6px 18px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: ".85rem", cursor: "pointer", background: tab === key ? "#fff" : "transparent", color: tab === key ? "#111" : "#6b7280", boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,.1)" : "none", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: liste */}
        {tab === "liste" && (
          <div className={`grid grid-cols-1 ${selectedId ? "lg:grid-cols-[1fr_380px]" : ""}`} style={{ gap: 20 }}>
            <div>
              {isLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Chargement…</div>
              ) : (
                <div className="overflow-x-auto" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {["Délégué", "Section", "Collectes", "Solde caisse", "Différés", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".78rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {delegues.map((d) => (
                        <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6", background: selectedId === d.id ? "#f0f9ff" : undefined, cursor: "pointer" }} onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 700, fontSize: ".9rem" }}>{d.nom} {d.prenoms}</div>
                            <div style={{ fontSize: ".78rem", color: "#9ca3af" }}>{d.telephone ?? "—"}</div>
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: ".85rem", color: "#374151" }}>{d.section ?? "—"}</td>
                          <td style={{ padding: "12px 14px", fontSize: ".85rem", color: "#374151" }}>{d.nbCollectes}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ fontWeight: 700, fontSize: ".9rem", color: d.caisse.solde > 0 ? "#16a34a" : "#9ca3af" }}>
                              {d.caisse.solde.toLocaleString("fr-FR")} FCFA
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px" }}><BadgePaiement nb={d.paiementsDifferes.nb} /></td>
                          <td style={{ padding: "12px 14px" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowAppro(d.id); setMontant(""); setNote(""); }}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #2563eb", color: "#2563eb", background: "#fff", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}
                            >
                              + Approvisionner
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Panneau détail caisse */}
            {selectedId && detail && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, height: "fit-content" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1rem" }}>{detail.agent.nom} {detail.agent.prenoms}</div>
                    <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>{detail.agent.section ?? "—"}</div>
                  </div>
                  <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#9ca3af" }}>✕</button>
                </div>

                <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: ".75rem", color: "#6b7280", marginBottom: 2 }}>Solde actuel</div>
                  <div style={{ fontWeight: 800, fontSize: "1.4rem", color: "#16a34a" }}>{detail.caisse.solde.toLocaleString("fr-FR")} FCFA</div>
                </div>

                {detail.paiementsDifferes.length > 0 && (
                  <>
                    <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#dc2626", marginBottom: 8, textTransform: "uppercase" }}>Paiements en attente</div>
                    {detail.paiementsDifferes.slice(0, 5).map((p) => (
                      <div key={p.livraisonId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: ".83rem" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.membreNom}</div>
                          <div style={{ color: "#9ca3af", fontSize: ".75rem" }}>{new Date(p.dateLivraison).toLocaleDateString("fr-FR")}</div>
                        </div>
                        <div style={{ fontWeight: 700, color: "#dc2626" }}>{p.montantRestant.toLocaleString("fr-FR")} FCFA</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => setShowAppro(selectedId)}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}
                      >
                        Approvisionner la caisse
                      </button>
                    </div>
                  </>
                )}

                {detail.mouvements.length > 0 && (
                  <>
                    <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#374151", margin: "16px 0 8px", textTransform: "uppercase" }}>Derniers mouvements</div>
                    {detail.mouvements.slice(0, 8).map((m) => (
                      <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: ".83rem" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: m.montantFcfa > 0 ? "#16a34a" : "#dc2626" }}>
                            {m.montantFcfa > 0 ? "+" : ""}{m.montantFcfa.toLocaleString("fr-FR")} FCFA
                          </div>
                          <div style={{ color: "#9ca3af", fontSize: ".75rem" }}>{m.note ?? m.type}</div>
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: ".75rem" }}>{new Date(m.createdAt).toLocaleDateString("fr-FR")}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: différés */}
        {tab === "differes" && (
          <div className="overflow-x-auto" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
            {differes.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "#9ca3af" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700 }}>Aucun paiement en attente</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
                    {["Date", "Planteur", "Délégué", "Section", "Montant dû"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".78rem", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {differes.map((d) => (
                    <tr key={d.livraisonId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>{new Date(d.dateLivraison).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: ".85rem" }}>{d.membreNom}</td>
                      <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>{d.agentNom}</td>
                      <td style={{ padding: "10px 14px", fontSize: ".85rem", color: "#9ca3af" }}>{d.agentSection}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#dc2626", fontSize: ".9rem" }}>{d.montantRestant.toLocaleString("fr-FR")} FCFA</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#fef2f2", borderTop: "2px solid #fecaca" }}>
                    <td colSpan={4} style={{ padding: "10px 14px", fontWeight: 700, fontSize: ".85rem" }}>Total à régulariser</td>
                    <td style={{ padding: "10px 14px", fontWeight: 800, color: "#dc2626" }}>
                      {differes.reduce((s, d) => s + d.montantRestant, 0).toLocaleString("fr-FR")} FCFA
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Tab: commissions */}
        {tab === "commissions" && (
          <div>
            {/* Sous-onglets */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f3f4f6", borderRadius: 10, padding: 4, width: "fit-content" }}>
              {([{ key: "taux", label: "Taux configurés" }, { key: "recap", label: "Récapitulatif" }, { key: "pardelegue", label: "Par délégué" }] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setCommTab(key)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: ".85rem", cursor: "pointer", background: commTab === key ? "#fff" : "transparent", color: commTab === key ? "#111" : "#6b7280", boxShadow: commTab === key ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Sous-onglet Taux */}
            {commTab === "taux" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>Taux de commission (FCFA/kg)</div>
                    <div style={{ fontSize: ".82rem", color: "#6b7280" }}>Les taux s'appliquent au poids net collecté par le délégué responsable du membre.</div>
                  </div>
                  <button
                    onClick={() => {
                      const active = campagnes.find(c => c.statut === "en_cours");
                      setEditTaux({ campagneId: active?.id ?? null, dateDebut: new Date().toISOString().slice(0, 10) });
                      setShowTauxForm(true);
                    }}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}
                  >
                    + Nouveau taux
                  </button>
                </div>

                {tauxLoading ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Chargement…</div>
                ) : taux.length === 0 ? (
                  <div style={{ padding: "48px 24px", textAlign: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>💡</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Aucun taux configuré</div>
                    <div style={{ fontSize: ".85rem", color: "#6b7280" }}>Créez un taux pour activer le calcul automatique des commissions lors des collectes.</div>
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0" }}>
                          {["Taux (FCFA/kg)", "Campagne", "Délégué", "Début", "Fin", "Statut", ""].map((h) => (
                            <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".78rem", fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {taux.map((t) => (
                          <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: "1rem", color: "#16a34a" }}>{Number(t.tauxFcfaParKg).toLocaleString("fr-FR")}</td>
                            <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>{t.campagneLibelle ?? <span style={{ color: "#9ca3af" }}>Toutes</span>}</td>
                            <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>
                              {t.delegueNom ? `${t.delegueNom} ${t.deleguePrenoms ?? ""}` : <span style={{ color: "#9ca3af" }}>Tous</span>}
                            </td>
                            <td style={{ padding: "10px 14px", fontSize: ".83rem" }}>{new Date(t.dateDebut).toLocaleDateString("fr-FR")}</td>
                            <td style={{ padding: "10px 14px", fontSize: ".83rem" }}>{t.dateFin ? new Date(t.dateFin).toLocaleDateString("fr-FR") : <span style={{ color: "#9ca3af" }}>—</span>}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: ".78rem", fontWeight: 700, background: t.actif ? "#dcfce7" : "#f3f4f6", color: t.actif ? "#16a34a" : "#9ca3af" }}>
                                {t.actif ? "Actif" : "Inactif"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => { setEditTaux(t); setShowTauxForm(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: ".78rem", cursor: "pointer", fontWeight: 600 }}>Modifier</button>
                                <button onClick={() => { if (confirm("Supprimer ce taux ?")) deleteTaux.mutate(t.id); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #fca5a5", color: "#dc2626", background: "#fff", fontSize: ".78rem", cursor: "pointer", fontWeight: 600 }}>Supprimer</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sous-onglet Récapitulatif */}
            {commTab === "recap" && (
              <div>
                {/* Filtre campagne */}
                <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Filtrer par campagne</label>
                    <select
                      value={commCampagneId ?? ""}
                      onChange={(e) => setCommCampagneId(e.target.value ? Number(e.target.value) : null)}
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem", minWidth: 220 }}
                    >
                      <option value="">— Toutes les campagnes —</option>
                      {campagnes.map((c) => (
                        <option key={c.id} value={c.id}>{c.libelle}{c.statut === "en_cours" ? " ✓" : ""}</option>
                      ))}
                    </select>
                  </div>
                  {recap.length > 0 && (
                    <div style={{ fontSize: ".85rem", color: "#6b7280", paddingBottom: 8 }}>
                      Total en attente :{" "}
                      <strong style={{ color: "#f59e0b" }}>
                        {recap.reduce((s, r) => s + r.enAttenteFcfa, 0).toLocaleString("fr-FR")} FCFA
                      </strong>
                      {" · "}Total payé :{" "}
                      <strong style={{ color: "#16a34a" }}>
                        {recap.reduce((s, r) => s + r.totalPayeFcfa, 0).toLocaleString("fr-FR")} FCFA
                      </strong>
                    </div>
                  )}
                </div>

                {recap.length === 0 ? (
                  <div style={{ padding: "48px 24px", textAlign: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>📊</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Aucune commission enregistrée</div>
                    <div style={{ fontSize: ".85rem", color: "#6b7280" }}>Les commissions apparaissent ici après chaque collecte, selon les taux configurés.</div>
                  </div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0" }}>
                          {["Délégué", "Section", "Collectes", "En attente", "Déjà payé", "Total cumulé", ""].map((h) => (
                            <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".78rem", fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recap.map((r) => (
                          <tr key={r.delegueId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: ".92rem" }}>{r.nom} {r.prenoms ?? ""}</td>
                            <td style={{ padding: "10px 14px", fontSize: ".85rem", color: "#6b7280" }}>{r.section ?? <span style={{ color: "#d1d5db" }}>—</span>}</td>
                            <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>{r.nb}</td>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: r.enAttenteFcfa > 0 ? "#f59e0b" : "#9ca3af" }}>
                              {r.enAttenteFcfa.toLocaleString("fr-FR")} FCFA
                            </td>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>
                              {r.totalPayeFcfa.toLocaleString("fr-FR")} FCFA
                            </td>
                            <td style={{ padding: "10px 14px", fontWeight: 700, color: "#2563eb" }}>
                              {r.totalFcfa.toLocaleString("fr-FR")} FCFA
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <button
                                onClick={() => { setCommDelegueId(r.delegueId); setCommTab("pardelegue"); }}
                                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: ".78rem", cursor: "pointer", fontWeight: 600 }}
                              >
                                Détail →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sous-onglet Par délégué */}
            {commTab === "pardelegue" && (
              <div>
                {/* Sélecteurs délégué + campagne */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, alignItems: "flex-end" }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Délégué</label>
                    <select
                      value={commDelegueId ?? ""}
                      onChange={(e) => { setCommDelegueId(e.target.value ? Number(e.target.value) : null); setCommCampagneId(null); }}
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem", minWidth: 240 }}
                    >
                      <option value="">— Choisir un délégué —</option>
                      {delegues.map((d) => (
                        <option key={d.id} value={d.id}>{d.nom} {d.prenoms} {d.section ? `— ${d.section}` : ""}</option>
                      ))}
                    </select>
                  </div>

                  {commDelegueId && campagnes.length > 0 && (
                    <div>
                      <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Campagne</label>
                      <select
                        value={commCampagneId ?? ""}
                        onChange={(e) => setCommCampagneId(e.target.value ? Number(e.target.value) : null)}
                        style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem", minWidth: 200 }}
                      >
                        <option value="">— Toutes les campagnes —</option>
                        {campagnes.map((c) => (
                          <option key={c.id} value={c.id}>{c.libelle}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {commDelegueId && commissions && (() => {
                  // IDs en_attente de la vue courante (respecte le filtre campagne)
                  const pendingIds = commissions.commissions
                    .filter((c) => c.statut === "en_attente")
                    .map((c) => c.id);
                  return (
                  <div>
                    {/* KPI */}
                    <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12, marginBottom: 20 }}>
                      {[
                        { label: commCampagneId ? "En attente (campagne)" : "En attente", val: `${commissions.totaux.enAttente.toLocaleString("fr-FR")} FCFA`, color: "#f59e0b" },
                        { label: commCampagneId ? "Payé (campagne)" : "Déjà payé", val: `${commissions.totaux.paye.toLocaleString("fr-FR")} FCFA`, color: "#16a34a" },
                        { label: commCampagneId ? "Total (campagne)" : "Total cumulé", val: `${commissions.totaux.total.toLocaleString("fr-FR")} FCFA`, color: "#2563eb" },
                      ].map((k) => (
                        <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px" }}>
                          <div style={{ fontSize: ".78rem", color: "#6b7280", marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: k.color }}>{k.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Actions : paiement + téléchargement relevé */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
                      {commissions.totaux.enAttente > 0 && (
                        <button
                          onClick={() => {
                            setPayerMode("especes");
                            setPayerRef("");
                            setShowPayerModal({
                              delegueId: commDelegueId,
                              montant: commissions.totaux.enAttente,
                              commissionIds: commCampagneId ? pendingIds : undefined,
                            });
                          }}
                          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: ".88rem" }}
                        >
                          💸 Payer {commissions.totaux.enAttente.toLocaleString("fr-FR")} FCFA
                        </button>
                      )}
                      <button
                        disabled={dlReleve}
                        onClick={telechargerReleve}
                        style={{ padding: "10px 20px", borderRadius: 8, border: "1.5px solid #2563eb", background: dlReleve ? "#eff6ff" : "#fff", color: "#2563eb", fontWeight: 700, cursor: dlReleve ? "not-allowed" : "pointer", fontSize: ".88rem" }}
                      >
                        {dlReleve ? "Génération…" : "📄 Télécharger le relevé PDF"}
                      </button>
                      {dlReleveErr && <span style={{ fontSize: ".8rem", color: "#dc2626" }}>⚠️ {dlReleveErr}</span>}
                    </div>

                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#fafafa", borderBottom: "1px solid #e5e7eb" }}>
                            {["Date", "Livraison", "Poids (kg)", "Taux /kg", "Commission", "Statut"].map((h) => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".78rem", fontWeight: 700, color: "#374151", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {commissions.commissions.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#9ca3af" }}>Aucune commission enregistrée</td></tr>
                          ) : commissions.commissions.map((c) => (
                            <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "10px 14px", fontSize: ".83rem" }}>{new Date(c.createdAt).toLocaleDateString("fr-FR")}</td>
                              <td style={{ padding: "10px 14px", fontSize: ".83rem", color: "#6b7280" }}>LIV-{c.livraisonId}</td>
                              <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>{Number(c.poidsKg).toFixed(1)}</td>
                              <td style={{ padding: "10px 14px", fontSize: ".85rem" }}>{Number(c.tauxFcfaParKg).toLocaleString("fr-FR")}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>{Number(c.montantFcfa).toLocaleString("fr-FR")} FCFA</td>
                              <td style={{ padding: "10px 14px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: ".78rem", fontWeight: 700, background: c.statut === "payé" ? "#dcfce7" : c.statut === "en_attente" ? "#fef3c7" : "#f3f4f6", color: c.statut === "payé" ? "#16a34a" : c.statut === "en_attente" ? "#d97706" : "#9ca3af" }}>
                                  {c.statut === "en_attente" ? "En attente" : c.statut === "payé" ? "Payé" : c.statut}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

      {/* Modal formulaire taux */}
      {showTauxForm && editTaux !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 20 }}>
              {editTaux.id ? "Modifier le taux" : "Nouveau taux de commission"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Taux (FCFA par kg) *</label>
                <input
                  type="number" step="0.5" min="0"
                  value={editTaux.tauxFcfaParKg ?? ""}
                  onChange={(e) => setEditTaux({ ...editTaux, tauxFcfaParKg: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".95rem" }}
                  placeholder="Ex: 25"
                />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>
                  Campagne
                  {campagnes.find(c => c.id === editTaux.campagneId)?.statut === "en_cours" && (
                    <span style={{ marginLeft: 8, fontSize: ".75rem", background: "#dcfce7", color: "#16a34a", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>En cours</span>
                  )}
                </label>
                <select
                  value={editTaux.campagneId ?? ""}
                  onChange={(e) => setEditTaux({ ...editTaux, campagneId: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem" }}
                >
                  <option value="">— Toutes les campagnes —</option>
                  {campagnes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}{c.statut === "en_cours" ? " ✓ En cours" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Délégué <span style={{ color: "#9ca3af", fontWeight: 400 }}>(laisser vide = tous)</span></label>
                <select
                  value={editTaux.delegueId ?? ""}
                  onChange={(e) => setEditTaux({ ...editTaux, delegueId: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem" }}
                >
                  <option value="">— Tous les délégués —</option>
                  {delegues.map((d) => <option key={d.id} value={d.id}>{d.nom} {d.prenoms}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Date de début *</label>
                <input
                  type="date"
                  value={editTaux.dateDebut ?? ""}
                  onChange={(e) => setEditTaux({ ...editTaux, dateDebut: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Date de fin (optionnel)</label>
                <input
                  type="date"
                  value={editTaux.dateFin ?? ""}
                  onChange={(e) => setEditTaux({ ...editTaux, dateFin: e.target.value || null })}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".9rem" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="taux-actif"
                  checked={editTaux.actif ?? true}
                  onChange={(e) => setEditTaux({ ...editTaux, actif: e.target.checked })}
                />
                <label htmlFor="taux-actif" style={{ fontWeight: 600, fontSize: ".85rem" }}>Taux actif</label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => { setShowTauxForm(false); setEditTaux(null); }} style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 600, cursor: "pointer" }}>Annuler</button>
              <button
                disabled={!editTaux.tauxFcfaParKg || !editTaux.dateDebut || upsertTaux.isPending}
                onClick={() => upsertTaux.mutate(editTaux as Partial<TauxCommission> & { tauxFcfaParKg: string; dateDebut: string })}
                style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: (!editTaux.tauxFcfaParKg || !editTaux.dateDebut) ? .5 : 1 }}
              >
                {upsertTaux.isPending ? "Enregistrement…" : editTaux.id ? "Mettre à jour" : "Créer le taux"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal approvisionnement */}
      {/* ── Modal paiement commission ───────────────────────────────────── */}
      {showPayerModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,.18)" }}>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 4 }}>Paiement de commissions</div>
            <div style={{ fontSize: ".88rem", color: "#6b7280", marginBottom: 20 }}>
              Montant à verser : <strong style={{ color: "#16a34a" }}>{showPayerModal.montant.toLocaleString("fr-FR")} FCFA</strong>
              {showPayerModal.commissionIds && (
                <span> ({showPayerModal.commissionIds.length} commission{showPayerModal.commissionIds.length > 1 ? "s" : ""} — campagne sélectionnée)</span>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Moyen de paiement</label>
              <select
                value={payerMode}
                onChange={(e) => setPayerMode(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".95rem", background: "#fff" }}
              >
                {MODES_PAIEMENT.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {(payerMode === "orange_money" || payerMode === "mtn_momo" || payerMode === "wave" || payerMode === "virement" || payerMode === "cheque") && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>
                  {payerMode === "virement" ? "Référence virement" : payerMode === "cheque" ? "Numéro de chèque" : "Numéro de transaction"}
                  <span style={{ fontWeight: 400, color: "#9ca3af" }}> (optionnel)</span>
                </label>
                <input
                  type="text"
                  value={payerRef}
                  onChange={(e) => setPayerRef(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".95rem" }}
                  placeholder={payerMode === "virement" ? "Ex: VIR-2024-001" : payerMode === "cheque" ? "Ex: 0012345" : "Ex: CI240812XXXXX"}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                onClick={() => { setShowPayerModal(null); setPayerMode("especes"); setPayerRef(""); }}
                style={{ flex: 1, padding: "11px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 600, cursor: "pointer", fontSize: ".9rem" }}
              >
                Annuler
              </button>
              <button
                disabled={payerComm.isPending}
                onClick={() => payerComm.mutate({
                  delegueId: showPayerModal.delegueId,
                  commissionIds: showPayerModal.commissionIds,
                  modePaiement: payerMode,
                  referencePaiement: payerRef || undefined,
                })}
                style={{ flex: 2, padding: "11px", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", fontWeight: 700, cursor: payerComm.isPending ? "not-allowed" : "pointer", opacity: payerComm.isPending ? .6 : 1, fontSize: ".9rem" }}
              >
                {payerComm.isPending ? "Paiement en cours…" : `✅ Confirmer le paiement`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAppro !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            {(() => { const d = delegues.find(x => x.id === showAppro); return d ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>Approvisionner — {d.nom} {d.prenoms}</div>
                <div style={{ fontSize: ".85rem", color: "#6b7280" }}>Solde actuel : {d.caisse.solde.toLocaleString("fr-FR")} FCFA</div>
              </div>
            ) : null; })()}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Montant (FCFA)</label>
              <MoneyInput
                value={montant}
                onChange={(raw) => setMontant(raw)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".95rem" }}
                placeholder="Ex: 500 000"
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: 6 }}>Note (optionnel)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".95rem" }}
                placeholder="Ex: Versement semaine 24"
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowAppro(null)} style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontWeight: 600, cursor: "pointer" }}>Annuler</button>
              <button
                disabled={!montant || Number(montant) <= 0 || appro.isPending}
                onClick={() => appro.mutate({ agentId: showAppro, montantFcfa: Number(montant), note })}
                style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: (!montant || Number(montant) <= 0) ? .5 : 1 }}
              >
                {appro.isPending ? "Envoi…" : "Approvisionner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
