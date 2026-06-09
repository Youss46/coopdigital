import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";

const API = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
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
  const [tab, setTab] = useState<"liste" | "differes">("liste");

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
    <Layout>
      <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111", marginBottom: 4 }}>Délégués terrain</h1>
          <p style={{ color: "#6b7280", fontSize: ".9rem" }}>Gestion des caisses et suivi des paiements différés</p>
        </div>

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
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
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f3f4f6", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {(["liste", "differes"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 18px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: ".85rem", cursor: "pointer", background: tab === t ? "#fff" : "transparent", color: tab === t ? "#111" : "#6b7280", boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
              {t === "liste" ? "Liste des délégués" : `Paiements différés${totalDifferes > 0 ? ` (${totalDifferes})` : ""}`}
            </button>
          ))}
        </div>

        {/* Tab: liste */}
        {tab === "liste" && (
          <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 380px" : "1fr", gap: 20 }}>
            <div>
              {isLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Chargement…</div>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            {differes.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "#9ca3af" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700 }}>Aucun paiement en attente</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
      </div>

      {/* Modal approvisionnement */}
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
              <input
                type="number"
                min="1"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".95rem" }}
                placeholder="Ex: 500000"
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
    </Layout>
  );
}
