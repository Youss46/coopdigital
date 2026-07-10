import { Link, useLocation } from "wouter";
import { useEnqueteBadge } from "../contexts/EnqueteBadgeContext";

const ITEMS = [
  { path: "/",          icon: "🏠", label: "Accueil",    badge: false },
  { path: "/missions",  icon: "📍", label: "Mapping",    badge: false },
  { path: "/enquetes",  icon: "📋", label: "Enquêtes",   badge: true  },
  { path: "/historique", icon: "🕐", label: "Historique", badge: false },
];

export default function BottomNavAgent() {
  const [location] = useLocation();
  const { count } = useEnqueteBadge();

  return (
    <nav className="t-nav">
      {ITEMS.map((item) => {
        const isActive = item.path === "/"
          ? location === "/"
          : location.startsWith(item.path);
        const showBadge = item.badge && count > 0 && !isActive;
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`t-nav__item${isActive ? " t-nav__item--active" : ""}`}
          >
            <span className="t-nav__icon" style={{ position: "relative", display: "inline-block" }}>
              {item.icon}
              {showBadge && (
                <span style={{
                  position: "absolute", top: -4, right: -6,
                  background: "#ef4444", color: "#fff",
                  borderRadius: "50%", minWidth: 16, height: 16,
                  fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px", lineHeight: 1,
                  boxShadow: "0 0 0 2px #0f172a",
                }}>
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
