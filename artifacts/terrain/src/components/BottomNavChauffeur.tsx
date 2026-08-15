import { useLocation } from "wouter";
import { Home, Truck, Fuel, MapPin } from "lucide-react";

const links = [
  { path: "/",          icon: Home,   label: "Accueil"   },
  { path: "/missions",  icon: Truck,  label: "Missions"  },
  { path: "/carburant", icon: Fuel,   label: "Carburant" },
  { path: "/station",   icon: MapPin, label: "Station"   },
];

export default function BottomNavChauffeur() {
  const [location, navigate] = useLocation();

  return (
    <nav className="t-nav">
      {links.map(({ path, icon: Icon, label }) => {
        const active = location === path;
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`t-nav__item${active ? " t-nav__item--active" : ""}`}
            style={{ position: "relative" }}
          >
            {active && (
              <span style={{
                position: "absolute",
                top: 6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 20,
                height: 3,
                borderRadius: 9999,
                background: "#fff",
                opacity: 0.9,
              }} />
            )}
            <Icon
              size={22}
              strokeWidth={active ? 2.5 : 1.8}
              style={{ marginTop: active ? 4 : 0 }}
            />
            <span style={{ fontSize: "0.65rem", fontWeight: 600, marginTop: 2 }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
