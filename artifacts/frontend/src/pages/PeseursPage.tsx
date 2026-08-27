import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Scale, Plus, Loader2, X, Eye, EyeOff, KeyRound, Building2, Users, Trash2 } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
  return body as T;
}

interface Delegue { id: number; nom: string; prenoms: string; section: string | null; role: string; }

interface Peseur {
  id: number;
  nom: string;
  prenoms: string;
  telephone: string | null;
  actif: boolean;
  delegueId: number | null;
  delegue: { id: number; nom: string; prenoms: string; section: string | null } | null;
  rattachement: "cooperative" | "delegue";
  createdAt: string;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: ".72rem", fontWeight: 700, background: color === "green" ? "#dcfce7" : color === "red" ? "#fee2e2" : "#dbeafe", color: color === "green" ? "#16a34a" : color === "red" ? "#dc2626" : "#1d4ed8" }}>
      {children}
    </span>
  );
}

function InitialesBadge({ nom, prenoms }: { nom: string; prenoms: string }) {
  const letters = `${prenoms[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
  return (
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0369a1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".82rem", flexShrink: 0 }}>
      {letters}
    </div>
  );
}

// ─── Modal création ─────────────────────────────────────────────────────────
function CreerPeseurModal({ onClose, delegues }: { onClose: () => void; delegues: Delegue[] }) {
  const qc = useQueryClient();
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [showMdp, setShowMdp] = useState(false);
  const [erreur, setErreur] = useState("");
  const [rattachement, setRattachement] = useState<"cooperative" | "delegue">("cooperative");
  const [delegueId, setDelegueId] = useState<number | "">("");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/users/peseurs/admin", {
        method: "POST",
        body: JSON.stringify({
          nom, prenoms, telephone, motDePasse,
          delegueId: rattachement === "delegue" && delegueId !== "" ? Number(delegueId) : null,
        }),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["peseurs-admin"] }); onClose(); },
    onError: (e: Error) => setErreur(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (!nom.trim() || !prenoms.trim() || !telephone.trim() || !motDePasse) {
      setErreur("Tous les champs sont obligatoires"); return;
    }
    if (motDePasse.length < 6) { setErreur("Mot de passe : 6 caractères minimum"); return; }
    if (rattachement === "delegue" && delegueId === "") {
      setErreur("Veuillez sélectionner un délégué de localité"); return;
    }
    mutation.mutate();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db",
    fontSize: ".88rem", boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 24px 48px rgba(0,0,0,.15)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem" }}>Nouveau peseur</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Rattachement */}
          <div>
            <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, color: "#374151", marginBottom: 8 }}>Rattachement *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(["cooperative", "delegue"] as const).map((r) => {
                const active = rattachement === r;
                return (
                  <button key={r} type="button" onClick={() => { setRattachement(r); setDelegueId(""); }}
                    style={{ padding: "12px 10px", borderRadius: 10, border: `2px solid ${active ? "#0369a1" : "#e5e7eb"}`, background: active ? "#eff6ff" : "#f9fafb", cursor: "pointer", textAlign: "center", transition: "all .15s" }}>
                    {r === "cooperative" ? <Building2 size={18} style={{ color: active ? "#0369a1" : "#9ca3af", marginBottom: 4 }} /> : <Users size={18} style={{ color: active ? "#0369a1" : "#9ca3af", marginBottom: 4 }} />}
                    <div style={{ fontSize: ".78rem", fontWeight: 700, color: active ? "#0369a1" : "#6b7280" }}>
                      {r === "cooperative" ? "Coopérative" : "Délégué localité"}
                    </div>
                    <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: 2 }}>
                      {r === "cooperative" ? "Base centrale" : "Périmètre délégué"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Délégué dropdown (si rattaché délégué) */}
          {rattachement === "delegue" && (
            <div>
              <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Délégué de localité *</label>
              <select value={delegueId} onChange={(e) => setDelegueId(e.target.value ? Number(e.target.value) : "")}
                style={{ ...inputStyle, appearance: "none", cursor: "pointer", background: "#fff" }}>
                <option value="">-- Sélectionner un délégué --</option>
                {delegues.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.prenoms} {d.nom}{d.section ? ` — ${d.section}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Identité */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Prénom(s) *</label>
              <input value={prenoms} onChange={(e) => setPrenoms(e.target.value)} style={inputStyle} placeholder="Ex : Kouamé" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Nom *</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} placeholder="Ex : DIALLO" />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Téléphone *</label>
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} type="tel" inputMode="tel" minLength={10} maxLength={10} pattern="[0-9]{10}" style={inputStyle} placeholder="07 00 00 00 00" />
            <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: 3 }}>Ce numéro sera utilisé pour la connexion à l'app terrain</div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Mot de passe initial *</label>
            <div style={{ position: "relative" }}>
              <input value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} type={showMdp ? "text" : "password"}
                style={{ ...inputStyle, padding: "8px 36px 8px 10px" }} placeholder="Minimum 6 caractères" />
              <button type="button" onClick={() => setShowMdp(!showMdp)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                {showMdp ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {erreur && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", color: "#dc2626" }}>{erreur}</div>
          )}

          <button type="submit" disabled={mutation.isPending}
            style={{ padding: "10px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {mutation.isPending ? "Création…" : "Créer le peseur"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Modal reset MDP ────────────────────────────────────────────────────────
function ResetMdpModal({ peseur, onClose }: { peseur: Peseur; onClose: () => void }) {
  const [mdp, setMdp] = useState("");
  const [showMdp, setShowMdp] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/users/peseurs/${peseur.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ nouveauMotDePasse: mdp }),
      }),
    onSuccess: () => setSucces(true),
    onError: (e: Error) => setErreur(e.message),
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 380, boxShadow: "0 24px 48px rgba(0,0,0,.15)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem" }}>Réinitialiser le mot de passe</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24 }}>
          {succes ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, color: "#16a34a" }}>Mot de passe réinitialisé</div>
              <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: 4 }}>Le peseur devra se reconnecter.</div>
              <button onClick={onClose} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>Fermer</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setErreur(""); if (mdp.length < 6) { setErreur("6 caractères minimum"); return; } mutation.mutate(); }}>
              <div style={{ fontSize: ".85rem", color: "#374151", marginBottom: 16 }}>
                Peseur : <strong>{peseur.prenoms} {peseur.nom}</strong>
              </div>
              <div>
                <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Nouveau mot de passe</label>
                <div style={{ position: "relative" }}>
                  <input value={mdp} onChange={(e) => setMdp(e.target.value)} type={showMdp ? "text" : "password"}
                    style={{ width: "100%", padding: "8px 36px 8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: ".88rem", boxSizing: "border-box", outline: "none" }}
                    placeholder="Minimum 6 caractères" />
                  <button type="button" onClick={() => setShowMdp(!showMdp)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                    {showMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {erreur && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", color: "#dc2626", marginTop: 10 }}>{erreur}</div>}
              <button type="submit" disabled={mutation.isPending}
                style={{ marginTop: 16, width: "100%", padding: "10px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ────────────────────────────────────────────────────────
export default function PeseursPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [resetPeseur, setResetPeseur] = useState<Peseur | null>(null);
  const [suppressionErreur, setSuppressionErreur] = useState("");
  const [search, setSearch] = useState("");
  const [filtreRattachement, setFiltreRattachement] = useState<"tous" | "cooperative" | "delegue">("tous");

  const { data: peseurs = [], isLoading } = useQuery<Peseur[]>({
    queryKey: ["peseurs-admin"],
    queryFn: () => apiFetch("/api/users/peseurs/admin"),
  });

  const { data: allUsers = [] } = useQuery<{ id: number; nom: string; prenoms: string; role: string; section: string | null }[]>({
    queryKey: ["users-list"],
    queryFn: () => apiFetch("/api/users"),
  });
  const delegues = allUsers.filter(u => u.role === "delegue");

  const toggleActif = useMutation({
    mutationFn: ({ id, actif }: { id: number; actif: boolean }) =>
      apiFetch(`/api/users/peseurs/${id}/activer`, { method: "PUT", body: JSON.stringify({ actif }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["peseurs-admin"] }),
  });

  const supprimerPeseur = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSuppressionErreur("");
      void qc.invalidateQueries({ queryKey: ["peseurs-admin"] });
    },
    onError: (error: Error) => setSuppressionErreur(error.message),
  });

  function handleSupprimer(peseur: Peseur) {
    const nomComplet = `${peseur.prenoms} ${peseur.nom}`;
    if (!window.confirm(`Supprimer définitivement le compte peseur de ${nomComplet} ? Cette action est irréversible.`)) {
      return;
    }
    setSuppressionErreur("");
    supprimerPeseur.mutate(peseur.id);
  }

  const filtered = peseurs.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = !s || `${p.prenoms} ${p.nom} ${p.telephone ?? ""}`.toLowerCase().includes(s);
    const matchFiltre = filtreRattachement === "tous" || p.rattachement === filtreRattachement;
    return matchSearch && matchFiltre;
  });

  const nbCooperative = peseurs.filter(p => p.rattachement === "cooperative").length;
  const nbDelegue = peseurs.filter(p => p.rattachement === "delegue").length;
  const nbActifs = peseurs.filter(p => p.actif).length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Scale size={22} style={{ color: "#0369a1" }} />
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: "1.25rem", color: "#0f172a" }}>Peseurs</h1>
            <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280" }}>Gestion des agents peseurs et de leur rattachement</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".88rem", cursor: "pointer" }}>
          <Plus size={16} /> Nouveau peseur
        </button>
      </div>

      {/* Statistiques */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total peseurs", value: peseurs.length, icon: "⚖️" },
          { label: "Actifs", value: nbActifs, icon: "✅" },
          { label: "Base centrale", value: nbCooperative, icon: "🏢", sub: `${nbDelegue} délégué(s)` },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>{s.value}</div>
            <div style={{ fontSize: ".75rem", color: "#6b7280" }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un peseur…"
          style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: ".88rem", outline: "none" }} />
        <div style={{ display: "flex", gap: 6 }}>
          {(["tous", "cooperative", "delegue"] as const).map(f => (
            <button key={f} onClick={() => setFiltreRattachement(f)}
              style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${filtreRattachement === f ? "#0369a1" : "#e5e7eb"}`, background: filtreRattachement === f ? "#eff6ff" : "#fff", color: filtreRattachement === f ? "#0369a1" : "#6b7280", fontWeight: 600, fontSize: ".78rem", cursor: "pointer" }}>
              {f === "tous" ? "Tous" : f === "cooperative" ? "🏢 Base centrale" : "👥 Délégués"}
            </button>
          ))}
        </div>
      </div>

      {suppressionErreur && (
        <div role="alert" style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: ".82rem" }}>
          {suppressionErreur}
        </div>
      )}

      {/* Liste */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 8px" }} />
            <div>Chargement…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
            <Scale size={32} style={{ margin: "0 auto 10px", opacity: .4 }} />
            <div style={{ fontWeight: 600, color: "#6b7280" }}>Aucun peseur trouvé</div>
            <div style={{ fontSize: ".82rem", marginTop: 4 }}>
              {peseurs.length === 0 ? "Créez le premier peseur en cliquant sur « Nouveau peseur »" : "Modifiez les filtres de recherche"}
            </div>
          </div>
        ) : (
          filtered.map((p, idx) => (
            <div key={p.id} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
              <InitialesBadge nom={p.nom} prenoms={p.prenoms} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: ".9rem" }}>{p.prenoms} {p.nom}</div>
                <div style={{ fontSize: ".78rem", color: "#6b7280" }}>{p.telephone ?? "—"}</div>
              </div>
              <div style={{ minWidth: 160 }}>
                {p.rattachement === "cooperative" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Building2 size={13} style={{ color: "#0369a1" }} />
                    <span style={{ fontSize: ".78rem", color: "#0369a1", fontWeight: 600 }}>Base centrale</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Users size={13} style={{ color: "#7c3aed" }} />
                    <div>
                      <div style={{ fontSize: ".78rem", color: "#7c3aed", fontWeight: 600 }}>
                        {p.delegue ? `${p.delegue.prenoms} ${p.delegue.nom}` : "Délégué inconnu"}
                      </div>
                      {p.delegue?.section && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{p.delegue.section}</div>}
                    </div>
                  </div>
                )}
              </div>
              <Badge color={p.actif ? "green" : "red"}>{p.actif ? "Actif" : "Inactif"}</Badge>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => toggleActif.mutate({ id: p.id, actif: !p.actif })}
                  disabled={toggleActif.isPending}
                  style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: ".75rem", fontWeight: 600, cursor: "pointer" }}>
                  {p.actif ? "Désactiver" : "Activer"}
                </button>
                <button onClick={() => setResetPeseur(p)}
                  style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <KeyRound size={14} />
                </button>
                <button
                  onClick={() => handleSupprimer(p)}
                  disabled={supprimerPeseur.isPending}
                  title="Supprimer ce compte peseur"
                  aria-label={`Supprimer le compte de ${p.prenoms} ${p.nom}`}
                  style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid #fecaca", background: "#fffafa", color: "#dc2626", cursor: supprimerPeseur.isPending ? "wait" : "pointer", display: "flex", alignItems: "center" }}>
                  {supprimerPeseur.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && <CreerPeseurModal onClose={() => setShowCreate(false)} delegues={delegues} />}
      {resetPeseur && <ResetMdpModal peseur={resetPeseur} onClose={() => setResetPeseur(null)} />}
    </div>
  );
}
