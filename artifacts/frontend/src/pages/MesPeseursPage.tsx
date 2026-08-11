import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Scale, Plus, Loader2, X, Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";

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

interface Peseur {
  id: number;
  nom: string;
  prenoms: string;
  telephone: string | null;
  section: string | null;
  actif: boolean;
  createdAt: string;
}

function InitialesBadge({ nom, prenoms }: { nom: string; prenoms: string }) {
  const letters = `${(prenoms[0] ?? "")}${(nom[0] ?? "")}`.toUpperCase();
  return (
    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#0369a1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".88rem", flexShrink: 0 }}>
      {letters}
    </div>
  );
}

// ─── Modal création ────────────────────────────────────────────────────────────
function CreerPeseurModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [showMdp, setShowMdp] = useState(false);
  const [erreur, setErreur] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/users/peseurs", {
        method: "POST",
        body: JSON.stringify({ nom, prenoms, telephone, motDePasse }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mes-peseurs"] });
      onClose();
    },
    onError: (e: Error) => setErreur(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (!nom.trim() || !prenoms.trim() || !telephone.trim() || !motDePasse) {
      setErreur("Tous les champs sont obligatoires");
      return;
    }
    if (motDePasse.length < 6) {
      setErreur("Le mot de passe doit comporter au moins 6 caractères");
      return;
    }
    mutation.mutate();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 24px 48px rgba(0,0,0,.15)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem" }}>Nouveau peseur</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Prénom(s) *</label>
              <input
                value={prenoms} onChange={(e) => setPrenoms(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: ".88rem", boxSizing: "border-box", outline: "none" }}
                placeholder="Ex : Kouamé"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Nom *</label>
              <input
                value={nom} onChange={(e) => setNom(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: ".88rem", boxSizing: "border-box", outline: "none" }}
                placeholder="Ex : DIALLO"
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Téléphone *</label>
            <input
              value={telephone} onChange={(e) => setTelephone(e.target.value)}
              type="tel" inputMode="tel"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: ".88rem", boxSizing: "border-box", outline: "none" }}
              placeholder="07 00 00 00 00"
            />
            <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: 3 }}>Le peseur utilisera ce numéro pour se connecter à l'app terrain</div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Mot de passe initial *</label>
            <div style={{ position: "relative" }}>
              <input
                value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                type={showMdp ? "text" : "password"}
                style={{ width: "100%", padding: "8px 36px 8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: ".88rem", boxSizing: "border-box", outline: "none" }}
                placeholder="Minimum 6 caractères"
              />
              <button type="button" onClick={() => setShowMdp(!showMdp)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                {showMdp ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: 3 }}>Le peseur pourra changer son mot de passe depuis l'app terrain</div>
          </div>

          {erreur && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", color: "#dc2626" }}>
              {erreur}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            style={{ padding: "10px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {mutation.isPending ? "Création…" : "Créer le peseur"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function MesPeseursPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const { data: peseurs = [], isLoading } = useQuery<Peseur[]>({
    queryKey: ["mes-peseurs"],
    queryFn: () => apiFetch<Peseur[]>("/api/users/mes-peseurs"),
  });

  async function handleToggle(p: Peseur) {
    setTogglingId(p.id);
    try {
      await apiFetch(`/api/users/peseurs/${p.id}/activer`, {
        method: "PUT",
        body: JSON.stringify({ actif: !p.actif }),
      });
      await qc.invalidateQueries({ queryKey: ["mes-peseurs"] });
    } catch {
      // silently ignore
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Scale size={22} color="#0369a1" />
            <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>Mes peseurs</h1>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: ".86rem" }}>
            Gérez les peseurs rattachés à votre localité
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".86rem", cursor: "pointer" }}
        >
          <Plus size={16} />
          Nouveau peseur
        </button>
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Loader2 size={28} className="animate-spin" style={{ color: "#94a3b8", margin: "0 auto" }} />
        </div>
      ) : peseurs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 16px", background: "#f8fafc", borderRadius: 12, border: "2px dashed #e2e8f0" }}>
          <Scale size={40} style={{ color: "#cbd5e1", margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>Aucun peseur rattaché</div>
          <div style={{ fontSize: ".84rem", color: "#64748b", marginBottom: 16 }}>
            Créez un peseur pour qu'il puisse enregistrer les collectes à votre place
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, background: "#0369a1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".86rem", cursor: "pointer" }}
          >
            <Plus size={15} /> Créer mon premier peseur
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Info card */}
          <div style={{ background: "#eff6ff", borderRadius: 10, padding: "10px 14px", fontSize: ".8rem", color: "#1e40af", marginBottom: 4 }}>
            💡 Vos peseurs héritent automatiquement de votre section. Ils peuvent enregistrer des collectes simples et groupées depuis l'app terrain.
          </div>

          {peseurs.map((p) => (
            <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
              <InitialesBadge nom={p.nom} prenoms={p.prenoms} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{p.prenoms} {p.nom}</div>
                <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>
                  {p.telephone ?? "—"}
                  {p.section && <span style={{ marginLeft: 8, color: "#94a3b8" }}>· {p.section}</span>}
                </div>
              </div>

              {/* Statut badge */}
              <span style={{
                padding: "3px 10px", borderRadius: 99, fontSize: ".72rem", fontWeight: 600,
                background: p.actif ? "#dcfce7" : "#f1f5f9",
                color: p.actif ? "#15803d" : "#64748b",
              }}>
                {p.actif ? "Actif" : "Inactif"}
              </span>

              {/* Toggle actif */}
              <button
                onClick={() => void handleToggle(p)}
                disabled={togglingId === p.id}
                title={p.actif ? "Désactiver ce peseur" : "Activer ce peseur"}
                style={{ background: "none", border: "none", cursor: "pointer", color: p.actif ? "#0369a1" : "#94a3b8", padding: 4, display: "flex", alignItems: "center" }}
              >
                {togglingId === p.id
                  ? <Loader2 size={20} className="animate-spin" />
                  : p.actif ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && <CreerPeseurModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
