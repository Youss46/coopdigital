import { Link, useRoute } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Building2, FileKey, TrendingUp, LogOut, ChevronRight, Settings,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/cooperatives", label: "Coopératives", icon: Building2 },
  { href: "/licences", label: "Licences", icon: FileKey },
  { href: "/revenus", label: "Revenus", icon: TrendingUp },
];

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const [active] = useRoute(href);
  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
        active
          ? "bg-white/15 text-white"
          : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
      }`}>
        <Icon size={18} />
        <span className="flex-1">{label}</span>
        {active && <ChevronRight size={14} className="opacity-60" />}
      </div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">M15 Tech</div>
          <div className="text-lg font-bold text-white">CoopDigital</div>
          <div className="text-xs text-white/40 mt-0.5">Tableau de bord admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((n) => <NavItem key={n.href} {...n} />)}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="size-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-semibold">
              {user?.nom.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.nom}</div>
              <div className="text-xs text-white/40 capitalize">{user?.role}</div>
            </div>
            <button onClick={logout} className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Déconnexion">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
