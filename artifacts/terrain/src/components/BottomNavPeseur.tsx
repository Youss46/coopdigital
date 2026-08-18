import { Link, useLocation } from "wouter";
import { Home, Scale, Package, History, Truck } from "lucide-react";

type NavItem = {
  path: string;
  icon: React.ReactNode;
  label: string;
};

const ITEMS_BASE: NavItem[] = [
  { path: "/",               icon: <Home   size={20} strokeWidth={2} />, label: "Accueil"    },
  { path: "/collecte",       icon: <Scale  size={20} strokeWidth={2} />, label: "Simple"     },
  { path: "/pesee-session",  icon: <Package size={20} strokeWidth={2} />, label: "Groupée"   },
  { path: "/historique",     icon: <History size={20} strokeWidth={2} />, label: "Historique" },
];

const ITEM_RECEPTIONS: NavItem = {
  path: "/receptions",
  icon: <Truck size={20} strokeWidth={2} />,
  label: "Réceptions",
};

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
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`t-nav__item${isActive ? " t-nav__item--active" : ""}`}
          >
            <span className="t-nav-pill">
              <span className="t-nav__icon">{item.icon}</span>
              <span style={{ fontSize: ".62rem", fontWeight: 600 }}>{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
