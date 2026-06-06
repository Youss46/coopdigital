import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Building2, FileKey, TrendingUp,
  LogOut, ChevronRight, Menu, X,
} from "lucide-react";

const nav = [
  { href: "/dashboard",    label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/cooperatives", label: "Coopératives",     icon: Building2 },
  { href: "/licences",     label: "Licences",         icon: FileKey },
  { href: "/revenus",      label: "Revenus",          icon: TrendingUp },
];

function NavItem({
  href, label, icon: Icon, onClick,
}: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) {
  const [active] = useRoute(href);
  return (
    <Link href={href} onClick={onClick}>
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

function SidebarContent({ onNav, user, logout }: {
  onNav?: () => void;
  user: { nom: string; role: string } | null;
  logout: () => void;
}) {
  return (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">M15 Tech</div>
        <div className="text-lg font-bold text-white">CoopDigital</div>
        <div className="text-xs text-white/40 mt-0.5">Tableau de bord admin</div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((n) => <NavItem key={n.href} {...n} onClick={onNav} />)}
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
          <button
            onClick={logout}
            className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            title="Déconnexion"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar desktop ───────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar text-sidebar-foreground flex-col">
        <SidebarContent user={user} logout={logout} />
      </aside>

      {/* ── Drawer mobile ─────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          {/* Panneau */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl">
            <button
              className="absolute top-4 right-4 p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            <SidebarContent user={user} logout={logout} onNav={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Contenu principal ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar mobile */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-sidebar text-white border-b border-white/10 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/50">M15 Tech</div>
            <div className="text-sm font-bold leading-tight">CoopDigital</div>
          </div>
          <div className="size-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
            {user?.nom.charAt(0).toUpperCase()}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
