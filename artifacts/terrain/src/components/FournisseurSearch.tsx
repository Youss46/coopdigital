import { useState, useEffect, useRef } from "react";
import { Search, User, Play, ChevronRight, UserPlus, X, Loader2 } from "lucide-react";
import { createFournisseurExterne, getFournisseurs } from "../lib/api";
import { cacheFournisseurs, getCachedFournisseurs } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import { useAuth } from "../contexts/AuthContext";
import type { Fournisseur } from "../lib/types";

interface Props {
  onSelect: (f: Fournisseur) => void;
  title?: string;
  /** membreId → sessionId pour les membres qui ont déjà une session en cours */
  activeSessions?: Map<number, number>;
  /** Appelé à la place de onSelect quand le membre a une session active connue */
  onSelectActiveSession?: (f: Fournisseur, sessionId: number) => void;
}

export default function FournisseurSearch({
  onSelect,
  title = "Choisir un membre",
  activeSessions,
  onSelectActiveSession,
}: Props) {
  const { isOnline } = useOffline();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({ nom: "", prenoms: "", telephone: "", section: "" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFournisseurs();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  async function loadFournisseurs() {
    setLoading(true);
    try {
      if (isOnline) {
        const data = await getFournisseurs();
        await cacheFournisseurs(data);
        setItems(data);
      } else {
        const cached = await getCachedFournisseurs();
        setItems(cached);
      }
    } catch {
      const cached = await getCachedFournisseurs();
      setItems(cached);
    } finally {
      setLoading(false);
    }
  }

  const filtered = search.trim()
    ? items.filter((f) => {
        const s = search.toLowerCase();
        return (
          f.nom.toLowerCase().includes(s) ||
          f.prenoms.toLowerCase().includes(s) ||
          f.code.toLowerCase().includes(s) ||
          f.telephone.includes(s)
        );
      })
    : items.slice(0, 30);

  function initials(f: Fournisseur) {
    return `${f.nom[0] ?? ""}${f.prenoms[0] ?? ""}`.toUpperCase();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!isOnline) {
      setCreateError("La création nécessite une connexion internet.");
      return;
    }
    if (!createForm.nom.trim()) {
      setCreateError("Le nom du fournisseur est requis.");
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      const created = await createFournisseurExterne({
        nom: createForm.nom,
        prenoms: createForm.prenoms || undefined,
        telephone: createForm.telephone || undefined,
        section: createForm.section || undefined,
      });
      const newItem: Fournisseur = {
        id: created.id,
        code: created.code ?? `EXT-${String(created.id).padStart(4, "0")}`,
        nom: created.nom,
        prenoms: created.prenoms ?? "",
        telephone: created.telephone ?? "",
        section: created.section,
        village: null,
        typeMembre: "externe",
        avanceEnCours: 0,
        intrantsDus: 0,
        derniereLivraison: null,
      };
      const nextItems = [newItem, ...items];
      setItems(nextItems);
      await cacheFournisseurs(nextItems);
      setSearch("");
      setCreateForm({ nom: "", prenoms: "", telephone: "", section: "" });
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Impossible de créer le fournisseur.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="t-search-wrap">
        <div className="t-search">
          <span className="t-search__icon">
            <Search size={18} />
          </span>
          <input
            ref={inputRef}
            type="search"
            className="t-search__input t-search__input--peseur"
            placeholder="Nom, code ou téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputMode="search"
          />
        </div>
      </div>

      {user?.role === "peseur" && (
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "10px 16px 0",
          position: "relative",
          zIndex: 1,
          background: "var(--t-bg)",
        }}>
          <button
            type="button"
            onClick={() => { setCreateError(""); setShowCreate(true); }}
            disabled={!isOnline}
            title={isOnline ? "Créer un fournisseur externe" : "Connexion internet requise"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, border: "none",
              borderRadius: 8, padding: "9px 12px", background: isOnline ? "var(--t-peseur)" : "var(--t-border)",
              color: isOnline ? "#fff" : "var(--t-muted)", fontSize: ".78rem", fontWeight: 700,
              cursor: isOnline ? "pointer" : "not-allowed", whiteSpace: "nowrap",
            }}
          >
            <UserPlus size={14} /> Nouveau externe
          </button>
        </div>
      )}
      <div style={{
        position: "relative",
        zIndex: 1,
        background: "var(--t-bg)",
      }}>
        <div className="t-section-title">{title} ({loading ? "…" : `${filtered.length} résultats`})</div>
      </div>

      {loading && <div className="t-spinner" />}

      {!loading && filtered.length === 0 && (
        <div className="t-empty">
          <div className="t-empty__icon">
            <Search size={32} strokeWidth={1.5} />
          </div>
          <div className="t-empty__text">Aucun résultat trouvé</div>
        </div>
      )}

      <div className="t-fournisseur-list">
        {filtered.map((f) => {
          const sessionId = activeSessions?.get(f.id);
          const hasSession = sessionId !== undefined;
          return (
            <button
              key={f.id}
              className={`t-fournisseur-item${hasSession ? " t-fournisseur-item--active-session" : ""}`}
              onClick={() =>
                hasSession && onSelectActiveSession
                  ? onSelectActiveSession(f, sessionId)
                  : onSelect(f)
              }
            >
              <div className={`t-fournisseur-item__avatar${hasSession ? " t-fournisseur-item__avatar--peseur" : ""}`}>
                {initials(f) || <User size={20} />}
              </div>
              <div className="t-fournisseur-item__body">
                <div className="t-fournisseur-item__name">{f.nom} {f.prenoms}</div>
                <div className="t-fournisseur-item__sub">
                  {f.code} · {f.telephone}
                  {f.section && ` · ${f.section}`}
                </div>
                <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.typeMembre === "externe" && (
                    <span className="t-badge t-badge--info">
                      Fournisseur externe
                    </span>
                  )}
                  {f.isMembreDelegue && (
                    <span className="t-badge t-badge--peseur">
                      Membre délégué — bon de réception
                    </span>
                  )}
                  {hasSession && (
                    <span className="t-badge t-badge--peseur">
                      <Play size={10} fill="currentColor" style={{ marginRight: 4 }} />
                      Session en cours — Reprendre
                    </span>
                  )}
                  {f.avanceEnCours > 0 && (
                    <span className="t-badge t-badge--danger">
                      Avance {f.avanceEnCours.toLocaleString("fr-FR")} FCFA
                    </span>
                  )}
                  {f.intrantsDus > 0 && (
                    <span className="t-badge t-badge--warning">
                      Intrants {f.intrantsDus.toLocaleString("fr-FR")} FCFA
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--t-muted)", flexShrink: 0 }} />
            </button>
          );
        })}
      </div>

      {showCreate && (
        <div
          role="presentation"
          onClick={() => !creating && setShowCreate(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.45)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520, background: "var(--t-surface, #fff)",
              borderRadius: "18px 18px 0 0", padding: "20px 18px 24px",
              boxShadow: "0 -8px 30px rgba(0,0,0,.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--t-text)" }}>Nouveau fournisseur externe</div>
                <div style={{ color: "var(--t-muted)", fontSize: ".78rem", marginTop: 3 }}>Il sera rattaché à la base centrale.</div>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} disabled={creating} style={{ border: "none", background: "transparent", color: "var(--t-muted)", padding: 6 }}>
                <X size={20} />
              </button>
            </div>
            {(["nom", "prenoms", "telephone", "section"] as const).map((field) => {
              const labels = { nom: "Nom *", prenoms: "Prénoms", telephone: "Téléphone", section: "Section / localité" };
              return (
                <label key={field} style={{ display: "block", marginBottom: 12, color: "var(--t-text)", fontSize: ".8rem", fontWeight: 700 }}>
                  {labels[field]}
                  <input
                    required={field === "nom"}
                    value={createForm[field]}
                    onChange={(e) => setCreateForm({ ...createForm, [field]: e.target.value })}
                    placeholder={field === "nom" ? "Nom du fournisseur" : field === "prenoms" ? "Prénoms" : field === "telephone" ? "Numéro de téléphone" : "Section ou localité"}
                    style={{ display: "block", width: "100%", marginTop: 5, boxSizing: "border-box", border: "1px solid var(--t-border)", borderRadius: 9, padding: "11px 12px", fontSize: ".9rem", background: "var(--t-bg, #fff)", color: "var(--t-text)" }}
                  />
                </label>
              );
            })}
            {createError && <div style={{ color: "var(--t-danger)", background: "var(--t-danger-bg)", borderRadius: 8, padding: "9px 11px", fontSize: ".8rem", marginBottom: 12 }}>{createError}</div>}
            <button type="submit" disabled={creating || !isOnline} style={{ width: "100%", border: "none", borderRadius: 10, padding: "12px", background: "var(--t-peseur)", color: "#fff", fontWeight: 800, fontSize: ".9rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {creating && <Loader2 size={16} className="t-spin" />} {creating ? "Création…" : "Créer le fournisseur"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
