import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Package,
  LogOut,
  Leaf,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/membres", label: "Membres", icon: Users },
  { href: "/avances", label: "Avances", icon: CreditCard },
  { href: "/livraisons/nouvelle", label: "Nouvelle livraison", icon: Package },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { utilisateur, logout } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col" style={{ backgroundColor: "#1a4731" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-green-800">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#c4962a" }}
          >
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-lg leading-tight">CoopDigital</span>
            <p className="text-green-300 text-xs">Gestion coopérative</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href || location.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-green-200 hover:text-white hover:bg-green-800"
                }`}
                style={isActive ? { backgroundColor: "#c4962a" } : {}}
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                <span>{label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-green-800">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ backgroundColor: "#c4962a" }}
            >
              {utilisateur?.nom?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-sm font-medium truncate">
                {utilisateur?.prenoms} {utilisateur?.nom}
              </p>
              <p className="text-green-300 text-xs truncate capitalize">{utilisateur?.role?.replace(/_/g, " ")}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-green-300 hover:text-white text-xs w-full transition-colors py-1"
          >
            <LogOut size={14} />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
