import { useState, useEffect, useRef } from "react";
import { getFournisseurs } from "../lib/api";
import { cacheFournisseurs, getCachedFournisseurs } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import type { Fournisseur } from "../lib/types";

interface Props {
  onSelect: (f: Fournisseur) => void;
  title?: string;
}

export default function FournisseurSearch({ onSelect, title = "Choisir un membre" }: Props) {
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
          (f.nom ?? "").toLowerCase().includes(s) ||
          (f.prenoms ?? "").toLowerCase().includes(s) ||
          (f.code ?? "").toLowerCase().includes(s) ||
          (f.telephone ?? "").includes(s)
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
          <span className="t-search__icon">🔍</span>
          <input
            ref={inputRef}
            type="search"
            className="t-search__input"
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
          <div className="t-empty__icon">🔍</div>
          <div className="t-empty__text">Aucun membre trouvé</div>
        </div>
      )}

      <div className="t-fournisseur-list">
        {filtered.map((f) => (
          <button
            key={f.id}
            className="t-fournisseur-item"
            onClick={() => onSelect(f)}
          >
            <div className="t-fournisseur-item__avatar">{initials(f)}</div>
            <div className="t-fournisseur-item__body">
              <div className="t-fournisseur-item__name">{f.nom} {f.prenoms}</div>
              <div className="t-fournisseur-item__sub">
                {f.code} · {f.telephone}
                {f.section && ` · ${f.section}`}
              </div>
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
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
            <span style={{ color: "#9ca3af", fontSize: "1.2rem" }}>›</span>
          </button>
        ))}
      </div>
    </>
  );
}
