import { Link, useLocation } from "wouter";

const ITEMS = [
  { path: "/",                icon: "🏠", label: "Accueil"    },
  { path: "/collecte",        icon: "⚖️", label: "Simple"     },
  { path: "/pesee-session",   icon: "📦", label: "Groupée"    },
  { path: "/historique",      icon: "📋", label: "Historique" },
];

export default function BottomNavPeseur() {
  const [location] = useLocation();

  return (
    <nav className="t-nav">
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
