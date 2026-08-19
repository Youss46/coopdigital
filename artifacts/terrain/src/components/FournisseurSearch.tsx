import { useState, useEffect, useRef } from "react";
import { Search, User, Play, ChevronRight } from "lucide-react";
import { getFournisseurs } from "../lib/api";
import { cacheFournisseurs, getCachedFournisseurs } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
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
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
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

      <div className="t-section-title">{title} ({loading ? "…" : `${filtered.length} résultats`})</div>

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
    </>
  );
}
