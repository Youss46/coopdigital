import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Plus, Eye, Clock, CheckCircle, Users, Calendar,
  Loader2, AlertTriangle, Search, ChevronRight, X, UserCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = "";
function getToken() { return localStorage.getItem("coop_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `${r.status}`); }
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(body) });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `${r.status}`); }
  return r.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MissionEnquete {
  id: number;
  titre: string;
  certificationId: number;
  datePrevue: string;
  statut: string;
  objectifMembres?: number | null;
  membresTotal: number;
  membresCollectes: number;
  membresValides: number;
  agentId?: number | null;
  agentNom?: string | null;
  agentPrenom?: string | null;
  createdAt: string;
}

interface Certification { id: number; type: string; statut: string; }
interface Agent { id: number; nom: string; prenoms: string; }
interface Membre { id: number; nom: string; prenoms: string; codeProducteur?: string; village?: string; cooperativeId: number; }

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  planifiee: { label: "Planifiée",  color: "#6366f1", bg: "#eef2ff", Icon: Clock },
  en_cours:  { label: "En cours",   color: "#f59e0b", bg: "#fffbeb", Icon: Clock },
  soumise:   { label: "Soumise",    color: "#3b82f6", bg: "#eff6ff", Icon: UserCheck },
  validee:   { label: "Validée",    color: "#22c55e", bg: "#f0fdf4", Icon: CheckCircle },
};

const TYPE_LABEL: Record<string, string> = {
  rainforest_alliance: "Rainforest Alliance",
  fairtrade: "Fairtrade",
  bio: "Agriculture Bio",
};

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONFIG[statut] ?? STATUT_CONFIG["planifiee"]!;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 4, border: `1px solid ${cfg.color}33` }}>
      {cfg.label}
    </span>
  );
}

// ── Formulaire création ────────────────────────────────────────────────────────

function NouvelleEnqueteForm({ certifications, onClose, onCreated, initialCertifId }: {
  certifications: Certification[];
  onClose: () => void;
  onCreated: () => void;
  initialCertifId?: string;
}) {
  const [form, setForm] = useState({
    titre: "", certificationId: initialCertifId ?? "", datePrevue: "", agentId: "", instructions: "",
  });
  const [selectedMembres, setSelectedMembres] = useState<Membre[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const qc = useQueryClient();

  // Debounce : attend 400ms après la dernière frappe avant de lancer la requête
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Agents : bon endpoint enquêtes (pas GPS missions)
  const { data: agents = [], isLoading: agentsLoading, isError: agentsError } = useQuery<Agent[]>({
    queryKey: ["enquetes-agents"],
    queryFn: () => apiFetch("/api/enquetes/agents"),
    staleTime: 60_000,
  });

  const { data: searchResult, isFetching, isError: searchError } = useQuery<{ membres: Membre[]; total: number }>({
    queryKey: ["membres-enquete-search", debouncedSearch],
    queryFn: () => apiFetch(`/api/membres?search=${encodeURIComponent(debouncedSearch)}&statut_membre=actif&limit=20`),
    enabled: debouncedSearch.length >= 2,
  });
  const resultats = searchResult?.membres ?? [];

  const mutation = useMutation({
    mutationFn: () => apiPost("/api/enquetes", {
      titre: form.titre,
      certificationId: Number(form.certificationId),
      datePrevue: form.datePrevue,
      agentId: form.agentId ? Number(form.agentId) : undefined,
      instructions: form.instructions || undefined,
      membreIds: selectedMembres.map(m => m.id),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enquetes"] }); onCreated(); onClose(); },
    onError: (e: Error) => setErreur(e.message),
  });

  const toggleMembre = (m: Membre) =>
    setSelectedMembres(prev =>
      prev.some(x => x.id === m.id) ? prev.filter(x => x.id !== m.id) : [...prev, m],
    );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nouvelle mission d'enquête</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={20} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {erreur && <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{erreur}</div>}
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Titre *</label>
              <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                placeholder="Ex : Enquête Rainforest — Zone Nord" style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Certification *</label>
                <select value={form.certificationId} onChange={e => setForm(f => ({ ...f, certificationId: e.target.value }))}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }}>
                  <option value="">— Choisir —</option>
                  {certifications.map(c => <option key={c.id} value={c.id}>{TYPE_LABEL[c.type] ?? c.type}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Date prévue *</label>
                <input type="date" value={form.datePrevue} onChange={e => setForm(f => ({ ...f, datePrevue: e.target.value }))}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Agent terrain assigné</label>
              <select value={form.agentId} onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}
                disabled={agentsLoading}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box", opacity: agentsLoading ? 0.6 : 1 }}>
                <option value="">{agentsLoading ? "Chargement…" : agentsError ? "Erreur de chargement" : "— Non assigné —"}</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.prenoms} {a.nom}</option>)}
              </select>
              {agentsError && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#dc2626" }}>Impossible de charger les agents (vérifiez vos permissions).</p>}
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Instructions pour l'agent</label>
              <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                rows={2} placeholder="Consignes, priorités, zones géographiques…"
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                  Membres à enquêter ({selectedMembres.length} sélectionné{selectedMembres.length > 1 ? "s" : ""})
                </label>
                {selectedMembres.length > 0 && (
                  <button onClick={() => setSelectedMembres([])} style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>Tout désélectionner</button>
                )}
              </div>
              {/* Tags membres sélectionnés */}
              {selectedMembres.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {selectedMembres.map(m => (
                    <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: "#166534" }}>
                      {m.prenoms} {m.nom}
                      <button onClick={() => toggleMembre(m)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#16a34a", fontSize: 14 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {/* Recherche serveur */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Tapez au moins 2 lettres pour rechercher…"
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px 8px 30px", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                {search.trim().length < 2 && (
                  <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Saisissez au moins 2 caractères pour rechercher un membre</div>
                )}
                {/* Debounce en cours ou fetch actif : l'input ne correspond pas encore au debouncedSearch */}
                {search.trim().length >= 2 && (search.trim() !== debouncedSearch || isFetching) && (
                  <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Recherche…</div>
                )}
                {search.trim().length >= 2 && search.trim() === debouncedSearch && !isFetching && searchError && (
                  <div style={{ padding: 16, textAlign: "center", color: "#dc2626", fontSize: 13 }}>Erreur lors de la recherche. Vérifiez vos permissions.</div>
                )}
                {search.trim().length >= 2 && search.trim() === debouncedSearch && !isFetching && !searchError && resultats.length === 0 && (
                  <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Aucun membre trouvé pour « {debouncedSearch} »</div>
                )}
                {/* Résultats masqués tant que le debounce n'a pas encore résolu */}
                {search.trim() === debouncedSearch && resultats.map(m => {
                  const sel = selectedMembres.some(x => x.id === m.id);
                  return (
                    <div key={m.id} onClick={() => toggleMembre(m)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                      cursor: "pointer", background: sel ? "#f0fdf4" : "#fff",
                      borderBottom: "1px solid #f1f5f9", transition: "background 0.1s",
                    }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${sel ? "#22c55e" : "#d1d5db"}`,
                        background: sel ? "#22c55e" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {sel && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{m.prenoms} {m.nom}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{m.codeProducteur ?? "—"} · {m.village ?? "—"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 13 }}>Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.titre || !form.certificationId || !form.datePrevue}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
              opacity: mutation.isPending || !form.titre || !form.certificationId || !form.datePrevue ? 0.6 : 1 }}>
            {mutation.isPending ? "Création…" : "Créer la mission"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function MissionsEnquetePage() {
  const { utilisateur: user } = useAuth();
  const search_ = useSearch();
  const urlParams = new URLSearchParams(search_);
  const urlCertifId = urlParams.get("certifId") ?? undefined;
  const urlNouveau  = urlParams.get("nouveau") === "1";

  const [showForm, setShowForm] = useState(urlNouveau);
  const [filterStatut, setFilterStatut] = useState<string>("tous");
  const [search, setSearch] = useState("");

  const { data: enquetes = [], isLoading, refetch } = useQuery<MissionEnquete[]>({
    queryKey: ["enquetes"],
    queryFn: () => apiFetch("/api/enquetes"),
  });

  const { data: certifications = [] } = useQuery<Certification[]>({
    queryKey: ["certifications"],
    queryFn: () => apiFetch("/api/certifications"),
  });



  const filtered = enquetes.filter(e => {
    const matchStatut = filterStatut === "tous" || e.statut === filterStatut;
    const matchSearch = !search || e.titre.toLowerCase().includes(search.toLowerCase());
    return matchStatut && matchSearch;
  });

  const stats = {
    total: enquetes.length,
    enCours: enquetes.filter(e => e.statut === "en_cours").length,
    soumises: enquetes.filter(e => e.statut === "soumise").length,
    validees: enquetes.filter(e => e.statut === "validee").length,
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#16a34a" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "24px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/certifications" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>← Certifications</Link>
            <span style={{ color: "#d1d5db" }}>/</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardList size={22} style={{ color: "#16a34a" }} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Missions d'enquête</h1>
            </div>
          </div>
          {["pca", "directeur", "responsable_tracabilite"].includes(user?.role ?? "") && (
            <button onClick={() => setShowForm(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>
              <Plus size={16} />Nouvelle mission
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total", value: stats.total, color: "#6366f1" },
            { label: "En cours", value: stats.enCours, color: "#f59e0b" },
            { label: "Soumises", value: stats.soumises, color: "#3b82f6" },
            { label: "Validées", value: stats.validees, color: "#22c55e" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une mission…"
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "9px 12px 9px 30px", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "9px 12px", fontSize: 13, background: "#fff" }}>
            <option value="tous">Tous les statuts</option>
            <option value="planifiee">Planifiées</option>
            <option value="en_cours">En cours</option>
            <option value="soumise">Soumises</option>
            <option value="validee">Validées</option>
          </select>
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f1f5f9", padding: 40, textAlign: "center" }}>
            <ClipboardList size={40} style={{ color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ color: "#6b7280", margin: 0, fontSize: 15 }}>Aucune mission d'enquête{filterStatut !== "tous" ? ` avec ce statut` : ""}</p>
            {filterStatut === "tous" && (
              <button onClick={() => setShowForm(true)} style={{ marginTop: 16, padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                Créer la première mission
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(e => {
              const pct = e.membresTotal > 0 ? Math.round((e.membresCollectes / e.membresTotal) * 100) : 0;
              const certif = certifications.find(c => c.id === e.certificationId);
              return (
                <Link key={e.id} href={`/enquetes/${e.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #f1f5f9", padding: "16px 18px",
                    display: "flex", alignItems: "center", gap: 16, cursor: "pointer", transition: "box-shadow 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{e.titre}</span>
                        <StatutBadge statut={e.statut} />
                        {certif && (
                          <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "2px 7px", borderRadius: 4 }}>
                            {TYPE_LABEL[certif.type] ?? certif.type}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "#6b7280" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Calendar size={12} />{new Date(e.datePrevue).toLocaleDateString("fr-FR")}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Users size={12} />{e.membresCollectes}/{e.membresTotal} membres
                        </span>
                        {e.agentNom && (
                          <span>Agent : {e.agentPrenom} {e.agentNom}</span>
                        )}
                      </div>
                      {e.membresTotal > 0 && (
                        <div style={{ marginTop: 8, height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#22c55e" : "#16a34a", borderRadius: 2, transition: "width 0.3s" }} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#6b7280" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <NouvelleEnqueteForm
          certifications={certifications.filter(c => c.statut !== "expire")}
          initialCertifId={urlCertifId}
          onClose={() => setShowForm(false)}
          onCreated={() => { void refetch(); }}
        />
      )}
    </div>
  );
}
