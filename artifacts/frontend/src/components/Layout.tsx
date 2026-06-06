import { useState } from "react";
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
  Menu,
  X,
  QrCode,
  Warehouse,
  Building2,
  Receipt,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Banknote,
  BookOpen,
  CalendarDays,
  UserCheck,
  PackageX,
  CheckCircle2,
  Landmark,
  Target,
  HandCoins,
  Gavel,
  TrendingUp,
  Award,
  ShieldAlert,
  ScrollText,
  Settings,
  Truck,
  Scale,
} from "lucide-react";
import { useCountEcrituresEnAttente, getCountEcrituresEnAttenteQueryKey, useGetAnomaliesStats, getGetAnomaliesStatsQueryKey } from "@workspace/api-client-react";
import NotificationPanel from "./NotificationPanel";

const navItems = [
  // ── Dashboards ────────────────────────────────────────────────────────────
  {
    href: "/dashboard/pca",
    label: "Vue PCA",
    icon: TrendingUp,
    roles: ["pca"],
  },
  {
    href: "/dashboard",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    roles: ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "auditeur"],
  },

  // ── Membres & Terrain ─────────────────────────────────────────────────────
  {
    href: "/membres",
    label: "Membres",
    icon: Users,
    roles: ["pca", "directeur", "comptable", "responsable_tracabilite", "agent_terrain", "auditeur"],
  },
  {
    href: "/scoring",
    label: "Scoring Producteurs",
    icon: Award,
    roles: ["pca", "directeur", "comptable", "agent_terrain", "auditeur"],
  },
  {
    href: "/campagnes",
    label: "Campagnes",
    icon: CalendarDays,
    roles: ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "agent_terrain", "auditeur"],
  },
  {
    href: "/livraisons/nouvelle",
    label: "Livraisons",
    icon: Package,
    roles: ["pca", "directeur", "agent_terrain", "responsable_tracabilite", "comptable", "auditeur"],
  },
  {
    href: "/tracabilite",
    label: "Traçabilité",
    icon: QrCode,
    roles: ["pca", "directeur", "responsable_tracabilite", "auditeur"],
  },
  {
    href: "/stocks",
    label: "Stocks",
    icon: Warehouse,
    roles: ["pca", "directeur", "magasinier", "comptable", "auditeur"],
  },
  {
    href: "/refus",
    label: "Stocks refoulés",
    icon: PackageX,
    roles: ["pca", "directeur", "magasinier", "responsable_tracabilite", "comptable", "auditeur"],
  },

  // ── Finance Membre ────────────────────────────────────────────────────────
  {
    href: "/avances",
    label: "Avances",
    icon: CreditCard,
    roles: ["pca", "directeur", "comptable", "agent_terrain", "auditeur"],
  },
  {
    href: "/intrants",
    label: "Intrants",
    icon: Leaf,
    roles: ["pca", "directeur", "comptable", "agent_terrain", "auditeur", "magasinier"],
  },
  {
    href: "/reglements",
    label: "Règlements",
    icon: CheckCircle2,
    roles: ["pca", "directeur", "comptable", "agent_terrain", "auditeur"],
  },

  // ── Commerce & Partenaires ────────────────────────────────────────────────
  {
    href: "/fournisseurs",
    label: "Fournisseurs",
    icon: UserCheck,
    roles: ["pca", "directeur", "comptable", "agent_terrain", "responsable_tracabilite", "auditeur"],
  },
  {
    href: "/exportateurs",
    label: "Exportateurs",
    icon: Building2,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },
  {
    href: "/creances",
    label: "Créances",
    icon: Receipt,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },
  {
    href: "/prix",
    label: "Suivi des Prix",
    icon: TrendingUp,
    roles: ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur"],
  },

  // ── Finance Coopérative ───────────────────────────────────────────────────
  {
    href: "/budget",
    label: "Budget",
    icon: Target,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },
  {
    href: "/emprunts",
    label: "Emprunts",
    icon: Landmark,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },
  {
    href: "/subventions",
    label: "Subventions",
    icon: HandCoins,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },
  {
    href: "/comptabilite",
    label: "Comptabilité",
    icon: BookOpen,
    roles: ["pca", "directeur", "comptable", "auditeur"],
    showBadge: true,
  },
  {
    href: "/salaires",
    label: "Salaires",
    icon: Banknote,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },

  // ── Pilotage & Contrôle ───────────────────────────────────────────────────
  {
    href: "/reporting",
    label: "Reporting",
    icon: BarChart3,
    roles: ["pca", "directeur", "comptable", "magasinier", "responsable_tracabilite", "auditeur"],
  },
  {
    href: "/anomalies",
    label: "Anomalies",
    icon: ShieldAlert,
    roles: ["pca", "directeur", "comptable", "auditeur"],
    showAnomaliesBadge: true,
  },
  {
    href: "/audit",
    label: "Journal d'audit",
    icon: ScrollText,
    roles: ["pca", "directeur", "auditeur"],
  },

  // ── Organisation ──────────────────────────────────────────────────────────
  {
    href: "/gouvernance",
    label: "Gouvernance",
    icon: Gavel,
    roles: ["pca", "directeur", "secretaire", "auditeur"],
  },
  {
    href: "/communication",
    label: "Communication",
    icon: MessageSquare,
    roles: ["pca", "directeur"],
  },
  {
    href: "/administration/comptes",
    label: "Administration",
    icon: ShieldCheck,
    roles: ["pca", "directeur"],
  },
  {
    href: "/transport",
    label: "Transport",
    icon: Truck,
    roles: ["pca", "directeur", "comptable", "responsable_tracabilite", "auditeur", "magasinier"],
  },
  {
    href: "/pesee",
    label: "Pesée",
    icon: Scale,
    roles: ["pca", "directeur", "comptable", "responsable_tracabilite", "magasinier"],
  },
  {
    href: "/equipements",
    label: "Équipements",
    icon: Package,
    roles: ["pca", "directeur", "comptable", "auditeur", "magasinier"],
  },
  {
    href: "/previsions",
    label: "Prévisions",
    icon: TrendingUp,
    roles: ["pca", "directeur", "comptable", "auditeur"],
  },
  {
    href: "/parametres",
    label: "Paramètres",
    icon: Settings,
    roles: ["pca", "directeur"],
  },
];

type NavItem = { href: string; label: string; icon: React.ElementType; roles?: string[]; showBadge?: boolean; showAnomaliesBadge?: boolean };

const BADGE_ROLES = ["pca", "directeur", "comptable"];
const ANOMALIE_BADGE_ROLES = ["pca", "directeur", "comptable", "auditeur"];

function SidebarContent({ onClose, onLogout }: { onClose?: () => void; onLogout: () => void }) {
  const [location] = useLocation();
  const { utilisateur } = useAuth();

  const showBadge = BADGE_ROLES.includes(utilisateur?.role ?? "");
  const showAnomaliesBadge = ANOMALIE_BADGE_ROLES.includes(utilisateur?.role ?? "");
  const { data: countData } = useCountEcrituresEnAttente({ query: { queryKey: getCountEcrituresEnAttenteQueryKey(), enabled: showBadge } });
  const nbEnAttente = countData?.count ?? 0;
  const { data: statsData } = useGetAnomaliesStats({ query: { queryKey: getGetAnomaliesStatsQueryKey(), enabled: showAnomaliesBadge } });
  const nbCritiques = Number(statsData?.nb_critiques ?? 0);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#1a4731" }}>
      {/* Logo + close button */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-green-800">
        <img
          src="/logo-192.png"
          alt="CoopDigital"
          className="w-9 h-9 rounded-lg flex-shrink-0 object-contain"
        />
        <div className="flex-1">
          <span className="text-white font-bold text-lg leading-tight">CoopDigital</span>
          <p className="text-green-300 text-xs">Gestion coopérative</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-green-300 hover:text-white transition-colors lg:hidden ml-auto"
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {(navItems as NavItem[])
          .filter(({ roles }) => !roles || roles.includes(utilisateur?.role ?? ""))
          .map(({ href, label, icon: Icon, showBadge: hasBadge, showAnomaliesBadge: hasAnomaliesBadge }) => {
            const isActive = location === href || location.startsWith(href + "/");
            const badgeCount = hasAnomaliesBadge && showAnomaliesBadge ? nbCritiques
              : hasBadge && showBadge ? nbEnAttente : 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive
                    ? "text-white"
                    : "text-green-200 hover:text-white hover:bg-green-800"
                }`}
                style={isActive ? { backgroundColor: "#c4962a" } : {}}
              >
                <Icon className="flex-shrink-0" size={18} />
                <span className="flex-1">{label}</span>
                {badgeCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold px-1"
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
                {isActive && badgeCount === 0 && <ChevronRight className="w-3.5 h-3.5 ml-auto" size={14} />}
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
            <p className="text-green-300 text-xs truncate capitalize">
              {utilisateur?.role?.replace(/_/g, " ")}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-green-300 hover:text-white text-xs w-full transition-colors py-1"
        >
          <LogOut size={14} />
          <span>Déconnexion</span>
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [confirmDeconnexion, setConfirmDeconnexion] = useState(false);

  const demanderDeconnexion = () => {
    setMenuOuvert(false);
    setConfirmDeconnexion(true);
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar desktop — always visible lg+ */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col">
        <SidebarContent onLogout={demanderDeconnexion} />
      </aside>

      {/* Overlay mobile */}
      {menuOuvert && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMenuOuvert(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar mobile — slide-in drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col lg:hidden transition-transform duration-300 ${
          menuOuvert ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent onClose={() => setMenuOuvert(false)} onLogout={demanderDeconnexion} />
      </aside>

      {/* Zone principale */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barre supérieure mobile */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setMenuOuvert(true)}
            className="text-gray-600 hover:text-gray-900 transition-colors"
            aria-label="Ouvrir le menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <img src="/logo-192.png" alt="CoopDigital" className="w-7 h-7 rounded-lg object-contain" />
            <span className="font-bold text-gray-900 text-base">CoopDigital</span>
          </div>
          <NotificationPanel />
        </header>

        {/* Barre supérieure desktop — cloche à droite */}
        <header className="hidden lg:flex items-center justify-end px-6 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <NotificationPanel />
        </header>

        {/* Contenu */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6">{children}</div>
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
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: "#1a4731" }}
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
