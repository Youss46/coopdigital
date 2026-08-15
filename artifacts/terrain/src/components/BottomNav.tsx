import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";

const ITEMS_AGENT = [
  { path: "/",             icon: "🏠", label: "Accueil"     },
  { path: "/collecte",     icon: "⚖️", label: "Collecte"    },
  { path: "/paiement",     icon: "💵", label: "Paiement"    },
  { path: "/commissions",  icon: "🏅", label: "Commissions" },
  { path: "/historique",   icon: "🔄", label: "Sync"        },
];

const ITEMS_PESEUR = [
  { path: "/",             icon: "🏠", label: "Accueil"     },
  { path: "/collecte",     icon: "⚖️", label: "Collecte"    },
  { path: "/pesee-session",icon: "📦", label: "Pesée groupée" },
  { path: "/historique",   icon: "🔄", label: "Sync"        },
];

export default function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isPeseur = user?.role === "peseur";
  const items = isPeseur ? ITEMS_PESEUR : ITEMS_AGENT;

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
