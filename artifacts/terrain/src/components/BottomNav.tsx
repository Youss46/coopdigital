import { Link, useLocation } from "wouter";

const ITEMS = [
  { path: "/",             icon: "🏠", label: "Accueil"      },
  { path: "/collecte",     icon: "⚖️", label: "Collecte"     },
  { path: "/paiement",     icon: "💵", label: "Paiement"     },
  { path: "/commissions",  icon: "🏅", label: "Commissions"  },
  { path: "/historique",   icon: "🔄", label: "Sync"         },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="t-nav">
      {/* Brand — visible uniquement en sidebar desktop */}
      <div className="t-nav__brand">
        <span className="t-nav__brand-icon">🌱</span>
        <div>
          <div className="t-nav__brand-name">CoopDigital</div>
          <div className="t-nav__brand-sub">Espace Terrain</div>
        </div>
      </div>
      {ITEMS.map((item) => {
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
