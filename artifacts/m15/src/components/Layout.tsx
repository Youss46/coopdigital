import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Building2, FileKey, TrendingUp,
  LogOut, ChevronRight, Menu, X, LifeBuoy,
} from "lucide-react";

const nav = [
  { href: "/dashboard",    label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/cooperatives", label: "Coopératives",     icon: Building2 },
  { href: "/licences",     label: "Licences",         icon: FileKey },
  { href: "/revenus",      label: "Revenus",          icon: TrendingUp },
  { href: "/support",      label: "Support",          icon: LifeBuoy },
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
  const [confirmDeconnexion, setConfirmDeconnexion] = useState(false);

  const demanderDeconnexion = () => {
    setOpen(false);
    setConfirmDeconnexion(true);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar desktop ───────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar text-sidebar-foreground flex-col">
        <SidebarContent user={user} logout={demanderDeconnexion} />
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
            <SidebarContent user={user} logout={demanderDeconnexion} onNav={() => setOpen(false)} />
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

      {/* Modal confirmation déconnexion */}
      {confirmDeconnexion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Déconnexion</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600">Voulez-vous vraiment vous déconnecter ?</p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setConfirmDeconnexion(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => { setConfirmDeconnexion(false); logout(); }}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
