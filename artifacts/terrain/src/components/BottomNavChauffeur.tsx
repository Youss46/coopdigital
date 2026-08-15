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
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2 pointer-events-none">
      <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_-2px_20px_rgba(0,0,0,0.10)] border border-gray-100 flex">
        {links.map(({ path, icon: Icon, label }) => {
          const active = location === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="flex-1 flex flex-col items-center gap-1 py-3 relative"
            >
              {active && (
                <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-5 h-1 rounded-full bg-green-700" />
              )}
              <Icon
                className={`h-5 w-5 transition-colors ${active ? "text-green-700" : "text-gray-400"}`}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={`text-[10px] font-medium tracking-tight ${active ? "text-green-700" : "text-gray-400"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
