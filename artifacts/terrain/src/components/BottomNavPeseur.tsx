import { Link, useLocation } from "wouter";

const ITEMS_BASE = [
  { path: "/",                icon: "🏠", label: "Accueil"    },
  { path: "/collecte",        icon: "⚖️", label: "Simple"     },
  { path: "/pesee-session",   icon: "📦", label: "Groupée"    },
  { path: "/historique",      icon: "📋", label: "Historique" },
];

const ITEM_RECEPTIONS = { path: "/receptions", icon: "🚛", label: "Réceptions" };

interface Props {
  /** delegueId provenant de AgentUser. null/undefined = peseur central → ajoute l'onglet Réceptions */
  delegueId?: number | null;
}

export default function BottomNavPeseur({ delegueId }: Props = {}) {
  const [location] = useLocation();
  const isCentral = delegueId == null;
  const items = isCentral
    ? [...ITEMS_BASE.slice(0, 1), ITEM_RECEPTIONS, ...ITEMS_BASE.slice(1)]
    : ITEMS_BASE;

  return (
    <nav className="t-nav">
      {/* Brand — visible uniquement en sidebar desktop (caché sur mobile via CSS) */}
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
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`t-nav__item${isActive ? " t-nav__item--active" : ""}`}
          >
            <span className="t-nav__icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
