import { useLocation } from "wouter";
import { Home, Package, Wallet, Leaf, FileText } from "lucide-react";

const TABS = [
  { path: "/", icon: Home, label: "Accueil" },
  { path: "/livraisons", icon: Package, label: "Livraisons" },
  { path: "/avances", icon: Wallet, label: "Avances" },
  { path: "/parts-sociales", icon: Leaf, label: "Parts" },
  { path: "/documents", icon: FileText, label: "Documents" },
];

export default function BottomNav() {
  const [loc, setLoc] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="flex max-w-lg mx-auto">
        {TABS.map(t => {
          const active = loc === t.path;
          return (
            <button
              key={t.path}
              onClick={() => setLoc(t.path)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors
                ${active ? "text-green-700" : "text-gray-400"}`}
            >
              <t.icon className={`w-6 h-6 ${active ? "fill-green-100" : ""}`} />
              <span className={`text-xs font-medium ${active ? "font-bold" : ""}`}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
