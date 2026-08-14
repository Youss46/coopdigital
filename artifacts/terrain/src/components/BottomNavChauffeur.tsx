import { useLocation } from "wouter";
import { Home, Truck, Fuel } from "lucide-react";

export default function BottomNavChauffeur() {
  const [location, navigate] = useLocation();

  const links = [
    { path: "/",          icon: Home,  label: "Accueil"  },
    { path: "/missions",  icon: Truck, label: "Missions" },
    { path: "/carburant", icon: Fuel,  label: "Carburant" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50">
      {links.map(({ path, icon: Icon, label }) => {
        const active = location === path;
        return (
          <button
            key={path}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              active ? "text-green-700 font-semibold" : "text-gray-400"
            }`}
            onClick={() => navigate(path)}
          >
            <Icon className={`h-5 w-5 ${active ? "text-green-700" : "text-gray-400"}`} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
