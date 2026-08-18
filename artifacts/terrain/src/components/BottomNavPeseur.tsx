import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Home, Scale, Package, History, Truck } from "lucide-react";
import { getTransfertsEnAttentePesee } from "../lib/api";

interface Props {
  /** delegueId provenant de AgentUser. null/undefined = peseur central → ajoute l'onglet Réceptions */
  delegueId?: number | null;
}

export default function BottomNavPeseur({ delegueId }: Props = {}) {
  const [location] = useLocation();
  const isCentral = delegueId == null;

  const [nbTransferts, setNbTransferts] = useState(0);

  useEffect(() => {
    if (!isCentral) return;

    let cancelled = false;

    async function fetchCount() {
      try {
        const list = await getTransfertsEnAttentePesee();
        if (!cancelled) setNbTransferts(list.length);
      } catch {
        // silencieux — pas de badge si hors-ligne
      }
    }

    void fetchCount();
    const interval = setInterval(() => void fetchCount(), 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isCentral]);

  const ITEMS_BASE = [
    { path: "/",              icon: <Home    size={20} strokeWidth={2} />, label: "Accueil"    },
    { path: "/collecte",      icon: <Scale   size={20} strokeWidth={2} />, label: "Simple"     },
    { path: "/pesee-session", icon: <Package size={20} strokeWidth={2} />, label: "Groupée"    },
    { path: "/historique",    icon: <History size={20} strokeWidth={2} />, label: "Historique" },
  ];

  const ITEM_RECEPTIONS = {
    path: "/receptions",
    icon: <Truck size={20} strokeWidth={2} />,
    label: "Réceptions",
    badge: nbTransferts,
  };

  const items = isCentral
    ? [...ITEMS_BASE.slice(0, 1), ITEM_RECEPTIONS, ...ITEMS_BASE.slice(1)]
    : ITEMS_BASE;

  return (
    <nav className="t-nav">
      {/* Brand — visible uniquement en sidebar desktop */}
      <div className="t-nav__brand">
        <span className="t-nav__brand-icon">🌱</span>
        <div>
          <div className="t-nav__brand-name">CoopDigital</div>
          <div className="t-nav__brand-sub">Espace Peseur</div>
        </div>
      </div>

      {items.map((item) => {
        const isActive = item.path === "/"
          ? location === "/"
          : location.startsWith(item.path);
        const badge = "badge" in item ? item.badge : 0;
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`t-nav__item${isActive ? " t-nav__item--active" : ""}`}
          >
            <span className="t-nav-pill" style={{ position: "relative" }}>
              <span className="t-nav__icon">{item.icon}</span>
              <span style={{ fontSize: ".62rem", fontWeight: 600 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  background: "#dc2626",
                  color: "#fff",
                  fontSize: ".6rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingInline: 3,
                  lineHeight: 1,
                  boxShadow: "0 0 0 2px var(--t-nav-bg, #1a4731)",
                }}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
