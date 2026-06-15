import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  MapPinned,
  MapPin,
  Gift,
  Navigation,
  GraduationCap,
  Wallet,
  Smartphone,
  Calculator,
  GitMerge,
  FolderKanban,
  Users2,
  Ship,
} from "lucide-react";
import { NAV_ITEMS, type NavItemConfig } from "@/config/navigation";
import { useCountEcrituresEnAttente, getCountEcrituresEnAttenteQueryKey, useGetAnomaliesStats, getGetAnomaliesStatsQueryKey } from "@workspace/api-client-react";
import NotificationPanel from "./NotificationPanel";
import HelpPanel from "./HelpPanel";
import InstallButton from "./InstallButton";
import GlobalSearch from "./GlobalSearch";

const BASE = import.meta.env.VITE_API_URL ?? "";

// ── Icônes — même ordre que NAV_ITEMS dans src/config/navigation.ts ──────────
// Pour ajouter un module : éditer navigation.ts en premier, puis ajouter l'icône ici.
const NAV_ICON_LIST: React.ElementType[] = [
  TrendingUp,     // /dashboard/pca
  LayoutDashboard,// /dashboard
  LayoutDashboard,// /dashboard-delegue
  Navigation,     // /missions (agent_terrain)
  Users,          // /membres
  CreditCard,     // /cartes-membres
  Award,          // /scoring
  CalendarDays,   // /campagnes
  Package,        // /livraisons (delegue)
  Package,        // /livraisons/nouvelle
  Truck,          // /transport
  Ship,           // /expeditions
  QrCode,         // /tracabilite
  MapPinned,      // /parcelles
  MapPin,         // /missions (responsable_tracabilite)
  Warehouse,      // /stocks
  Warehouse,      // /entrepots
  Warehouse,      // /mon-entrepot
  PackageX,       // /refus
  CreditCard,     // /avances
  Leaf,           // /intrants
  CheckCircle2,   // /reglements
  UserCheck,      // /fournisseurs
  Building2,      // /exportateurs
  Receipt,        // /creances
  TrendingUp,     // /prix
  BarChart3,      // /finances/tableau-bord
  Target,         // /budget
  Landmark,       // /emprunts
  HandCoins,      // /subventions
  Gift,           // /dons
  Wallet,         // /caisse
  Building2,      // /banque
  Smartphone,     // /mobile-marchand
  Calculator,     // /fiscalite
  GitMerge,       // /reconciliation
  FolderKanban,   // /investissements
  BookOpen,       // /comptabilite
  Banknote,       // /salaires
  GraduationCap,  // /formations
  GraduationCap,  // /formations-rse
  Package,        // /equipements
  TrendingUp,     // /previsions
  BarChart3,      // /reporting
  ShieldAlert,    // /anomalies
  ScrollText,     // /audit
  Gavel,          // /gouvernance
  MessageSquare,  // /communication
  Users2,         // /delegues
  ShieldCheck,    // /administration/comptes
  Settings,       // /parametres
];

type NavItem = NavItemConfig & { icon: React.ElementType };

const navItems: NavItem[] = NAV_ITEMS.map((item, i) => ({
  ...item,
  icon: NAV_ICON_LIST[i] ?? LayoutDashboard,
}));

const BADGE_ROLES = ["pca", "directeur", "comptable"];
const ANOMALIE_BADGE_ROLES = ["pca", "directeur", "comptable", "auditeur"];
const EUDR_ALERTE_ROLES = ["responsable_tracabilite"];

function SidebarContent({ onClose, onLogout }: { onClose?: () => void; onLogout: () => void }) {
  const [location] = useLocation();
  const { utilisateur } = useAuth();

  const showBadge = BADGE_ROLES.includes(utilisateur?.role ?? "");
  const showAnomaliesBadge = ANOMALIE_BADGE_ROLES.includes(utilisateur?.role ?? "");
  const showEudrAlerteBadge = EUDR_ALERTE_ROLES.includes(utilisateur?.role ?? "");
  const { data: countData } = useCountEcrituresEnAttente({ query: { queryKey: getCountEcrituresEnAttenteQueryKey(), enabled: showBadge } });
  const nbEnAttente = countData?.count ?? 0;
  const { data: statsData } = useGetAnomaliesStats({ query: { queryKey: getGetAnomaliesStatsQueryKey(), enabled: showAnomaliesBadge } });
  const nbCritiques = Number(statsData?.nb_critiques ?? 0);
  const { data: conformiteNav } = useQuery({
    queryKey: ["parcelles-conformite"],
    queryFn: async () => {
      const token = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/parcelles/conformite`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      return r.json() as Promise<{ par_section: { pct: number }[] }>;
    },
    enabled: showEudrAlerteBadge,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const storedWarning = (() => {
    try { return (JSON.parse(localStorage.getItem("coop_gps_seuils") ?? "null") as { warning?: number } | null)?.warning ?? 50; }
    catch { return 50; }
  })();
  const nbSectionsAlerte = showEudrAlerteBadge
    ? (conformiteNav?.par_section ?? []).filter(s => s.pct < storedWarning).length
    : 0;

  const { data: messagesNonLus } = useQuery({
    queryKey: ["messages-non-lus"],
    queryFn: async () => {
      const token = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/communication/messages/non-lus`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { count: 0 };
      return r.json() as Promise<{ count: number }>;
    },
    enabled: !!utilisateur,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const nbMessagesNonLus = messagesNonLus?.count ?? 0;

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
          .map(({ href, label, icon: Icon, showBadge: hasBadge, showAnomaliesBadge: hasAnomaliesBadge, showEudrAlerteBadge: hasEudrAlerteBadge, showMessagesBadge: hasMessagesBadge }) => {
            const isActive = location === href || location.startsWith(href + "/");
            const badgeCount = hasAnomaliesBadge && showAnomaliesBadge ? nbCritiques
              : hasBadge && showBadge ? nbEnAttente
              : hasEudrAlerteBadge && showEudrAlerteBadge ? nbSectionsAlerte
              : hasMessagesBadge ? nbMessagesNonLus
              : 0;
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
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img src="/logo-192.png" alt="CoopDigital" className="w-7 h-7 rounded-lg object-contain flex-shrink-0" />
            <span className="font-bold text-gray-900 text-base truncate">CoopDigital</span>
          </div>
          <div className="flex items-center gap-1">
            <GlobalSearch />
            <HelpPanel />
            <NotificationPanel />
          </div>
        </header>

        {/* Barre supérieure desktop — boutons à droite */}
        <header className="hidden lg:flex items-center gap-3 px-6 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <InstallButton />
          <HelpPanel />
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
