import { useState, useCallback } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import SplashScreen from "@/components/SplashScreen";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import DashboardDelegue from "@/pages/DashboardDelegue";
import DashboardCaissier from "@/pages/DashboardCaissier";
import Membres from "@/pages/Membres";
import MissionsPage from "@/pages/MissionsPage";
import MissionDetailPage from "@/pages/MissionDetailPage";
import MembreFiche from "@/pages/MembreFiche";
import Avances from "@/pages/Avances";
import PrimesPage from "@/pages/PrimesPage";
import NouvelleLivraison from "@/pages/NouvelleLivraison";
import LivraisonsPage from "@/pages/LivraisonsPage";
import SessionsPeseePage from "@/pages/SessionsPeseePage";
import BonsReceptionMembresDeleguesPage from "@/pages/BonsReceptionMembresDeleguesPage";
import MesPeseursPage from "@/pages/MesPeseursPage";
import PeseursPage from "@/pages/PeseursPage";
import TracabilitePage from "@/pages/TracabilitePage";
import ParcellePage from "@/pages/ParcellePage";
import StocksPage from "@/pages/StocksPage";
import ExportateursPage from "@/pages/ExportateursPage";
import VentesPage from "@/pages/VentesPage";
import CreancesPage from "@/pages/CreancesPage";
import CommunicationPage from "@/pages/CommunicationPage";
import SalairesPage from "@/pages/SalairesPage";
import ReportingPage from "@/pages/ReportingPage";
import RapportGestionPage from "@/pages/RapportGestionPage";
import ComptabilitePage from "@/pages/ComptabilitePage";
import ComptesPage from "@/pages/ComptesPage";
import CampagnesPage from "@/pages/CampagnesPage";
import FournisseursPage from "@/pages/FournisseursPage";
import RefusPage from "@/pages/RefusPage";
import ReglementsPage from "@/pages/ReglementsPage";
import IntrantsPage from "@/pages/IntrantsPage";
import EmpruntsPage from "@/pages/EmpruntsPage";
import BudgetPage from "@/pages/BudgetPage";
import SubventionsPage from "@/pages/SubventionsPage";
import GouvernancePage from "@/pages/GouvernancePage";
import PrixPage from "@/pages/PrixPage";
import ScoringPage from "@/pages/ScoringPage";
import AnomaliesPage from "@/pages/AnomaliesPage";
import AuditPage from "@/pages/AuditPage";
import PcaDashboardPage from "@/pages/PcaDashboardPage";
import NotificationsPage from "@/pages/NotificationsPage";
import NotificationsPreferencesPage from "@/pages/NotificationsPreferencesPage";
import ParametresPage from "@/pages/ParametresPage";
import MonProfilPage from "@/pages/MonProfilPage";
import TransportPage from "@/pages/TransportPage";
import EquipementsPage from "@/pages/EquipementsPage";
import PrevisionsPage from "@/pages/PrevisionsPage";
import DonsPage from "@/pages/DonsPage";
import FormationsPage from "@/pages/FormationsPage";
import FormationsRsePage from "@/pages/FormationsRsePage";
import CaissePage from "@/pages/CaissePage";
import BanquePage from "@/pages/BanquePage";
import ChequesPage from "@/pages/ChequesPage";
import MobileMarchandPage from "@/pages/MobileMarchandPage";
import FiscalitePage from "@/pages/FiscalitePage";
import ReconciliationPage from "@/pages/ReconciliationPage";
import InvestissementsPage from "@/pages/InvestissementsPage";
import DeleguesPage from "@/pages/DeleguesPage";
import DeleguesLocalitesPage from "@/pages/DeleguesLocalitesPage";
import ChangerMotDePassePage from "@/pages/ChangerMotDePassePage";
import FinancesTableauBordPage from "@/pages/FinancesTableauBordPage";
import CartesMembres from "@/pages/CartesMembres";
import ExpeditionsPage from "@/pages/ExpeditionsPage";
import NouvelleExpeditionPage from "@/pages/NouvelleExpeditionPage";
import ExpeditionDetailPage from "@/pages/ExpeditionDetailPage";
import EntrepotsPage from "@/pages/EntrepotsPage";
import MonEntrepotPage from "@/pages/MonEntrepotPage";
import PendingOpsPage from "@/pages/PendingOpsPage";
import ArchivesPage from "@/pages/ArchivesPage";
import CertificationsPage from "@/pages/CertificationsPage";
import MissionsEnquetePage from "@/pages/MissionsEnquetePage";
import MissionEnqueteDetailPage from "@/pages/MissionEnqueteDetailPage";
import CertificationsDashboardPage from "@/pages/CertificationsDashboardPage";
import ChargesDiversesPage from "@/pages/ChargesDiversesPage";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { Toaster } from "@/components/ui/sonner";
import { OnlineToast } from "@/components/OfflineIndicator";
import { OfflineProvider } from "@/contexts/OfflineContext";
import PdfViewerModal from "@/components/PdfViewerModal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

function ProtectedRoute({ component: Component, roles }: { component: React.ComponentType; roles?: string[] }) {
  const { estConnecte, utilisateur } = useAuth();
  if (!estConnecte) return <Redirect to="/login" />;
  if (roles && !roles.includes(utilisateur?.role ?? "")) return <Redirect to="/dashboard" />;
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function AppRoutes() {
  const { estConnecte, utilisateur } = useAuth();
  usePushSubscription(estConnecte);
  const accueil =
    utilisateur?.role === "agent_terrain" ? "/missions" :
    utilisateur?.role === "delegue"       ? "/dashboard-delegue" :
    utilisateur?.role === "caissier"      ? "/dashboard-caissier" :
    "/dashboard";
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/changer-mot-de-passe" component={ChangerMotDePassePage} />
      <Route path="/">
        {estConnecte ? <Redirect to={accueil} /> : <Redirect to="/login" />}
      </Route>
      <Route path="/dashboard">
        {utilisateur?.role === "caissier"
          ? <Redirect to="/dashboard-caissier" />
          : <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/dashboard-delegue">
        <ProtectedRoute component={DashboardDelegue} />
      </Route>
      <Route path="/dashboard-caissier">
        <ProtectedRoute component={DashboardCaissier} />
      </Route>
      <Route path="/membres/:id">
        <ProtectedRoute component={MembreFiche} />
      </Route>
      <Route path="/membres">
        <ProtectedRoute component={Membres} />
      </Route>
      <Route path="/missions/:id">
        <ProtectedRoute component={MissionDetailPage} />
      </Route>
      <Route path="/missions">
        <ProtectedRoute component={MissionsPage} />
      </Route>
      <Route path="/avances">
        <ProtectedRoute component={Avances} />
      </Route>
      <Route path="/livraisons/nouvelle">
        <ProtectedRoute component={NouvelleLivraison} />
      </Route>
      <Route path="/livraisons">
        <ProtectedRoute component={LivraisonsPage} />
      </Route>
      <Route path="/sessions-pesee">
        <ProtectedRoute component={SessionsPeseePage} />
      </Route>
      <Route path="/bons-reception-membres">
        <ProtectedRoute component={BonsReceptionMembresDeleguesPage} />
      </Route>
      <Route path="/tracabilite">
        <ProtectedRoute component={TracabilitePage} />
      </Route>
      <Route path="/parcelles">
        <ProtectedRoute component={ParcellePage} />
      </Route>
      <Route path="/stocks">
        <ProtectedRoute component={StocksPage} />
      </Route>
      <Route path="/exportateurs">
        <ProtectedRoute component={ExportateursPage} />
      </Route>
      <Route path="/ventes">
        <ProtectedRoute component={VentesPage} />
      </Route>
      <Route path="/creances">
        <ProtectedRoute component={CreancesPage} />
      </Route>
      <Route path="/salaires">
        <ProtectedRoute component={SalairesPage} />
      </Route>
      <Route path="/communication">
        <ProtectedRoute component={CommunicationPage} />
      </Route>
      <Route path="/reporting">
        <ProtectedRoute component={ReportingPage} />
      </Route>
      <Route path="/rapport-gestion">
        <ProtectedRoute component={RapportGestionPage} />
      </Route>
      <Route path="/comptabilite">
        <ProtectedRoute component={ComptabilitePage} />
      </Route>
      <Route path="/administration/comptes">
        <ProtectedRoute component={ComptesPage} />
      </Route>
      <Route path="/campagnes">
        <ProtectedRoute component={CampagnesPage} />
      </Route>
      <Route path="/fournisseurs">
        <ProtectedRoute component={FournisseursPage} />
      </Route>
      <Route path="/reglements">
        <ProtectedRoute component={ReglementsPage} />
      </Route>
      <Route path="/refus">
        <ProtectedRoute component={RefusPage} />
      </Route>
      <Route path="/primes">
        <ProtectedRoute component={PrimesPage} />
      </Route>
      <Route path="/intrants">
        <ProtectedRoute component={IntrantsPage} />
      </Route>
      <Route path="/emprunts">
        <ProtectedRoute component={EmpruntsPage} />
      </Route>
      <Route path="/budget">
        <ProtectedRoute component={BudgetPage} />
      </Route>
      <Route path="/subventions">
        <ProtectedRoute component={SubventionsPage} />
      </Route>
      <Route path="/gouvernance">
        <ProtectedRoute component={GouvernancePage} />
      </Route>
      <Route path="/prix">
        <ProtectedRoute component={PrixPage} />
      </Route>
      <Route path="/scoring">
        <ProtectedRoute component={ScoringPage} />
      </Route>
      <Route path="/anomalies">
        <ProtectedRoute component={AnomaliesPage} />
      </Route>
      <Route path="/audit">
        <ProtectedRoute component={AuditPage} />
      </Route>
      <Route path="/dashboard/pca">
        <ProtectedRoute component={PcaDashboardPage} />
      </Route>
      <Route path="/notifications/preferences">
        <ProtectedRoute component={NotificationsPreferencesPage} />
      </Route>
      <Route path="/notifications">
        <ProtectedRoute component={NotificationsPage} />
      </Route>
      <Route path="/parametres">
        <ProtectedRoute component={ParametresPage} roles={["pca", "directeur"]} />
      </Route>
      <Route path="/mon-profil">
        <ProtectedRoute component={MonProfilPage} />
      </Route>
      <Route path="/transport">
        <ProtectedRoute component={TransportPage} />
      </Route>
      <Route path="/equipements">
        <ProtectedRoute component={EquipementsPage} />
      </Route>
      <Route path="/previsions">
        <ProtectedRoute component={PrevisionsPage} />
      </Route>
      <Route path="/dons">
        <ProtectedRoute component={DonsPage} />
      </Route>
      <Route path="/formations">
        <ProtectedRoute component={FormationsPage} />
      </Route>
      <Route path="/formations-rse">
        <ProtectedRoute component={FormationsRsePage} />
      </Route>
      <Route path="/caisse">
        <ProtectedRoute component={CaissePage} />
      </Route>
      <Route path="/banque">
        <ProtectedRoute component={BanquePage} />
      </Route>
      <Route path="/cheques">
        <ProtectedRoute component={ChequesPage} />
      </Route>
      <Route path="/mobile-marchand">
        <ProtectedRoute component={MobileMarchandPage} />
      </Route>
      <Route path="/fiscalite">
        <ProtectedRoute component={FiscalitePage} />
      </Route>
      <Route path="/reconciliation">
        <ProtectedRoute component={ReconciliationPage} />
      </Route>
      <Route path="/investissements">
        <ProtectedRoute component={InvestissementsPage} />
      </Route>
      <Route path="/delegues">
        <ProtectedRoute component={DeleguesPage} />
      </Route>
      <Route path="/delegues-localites">
        <ProtectedRoute component={DeleguesLocalitesPage} />
      </Route>
      <Route path="/cartes-membres">
        <ProtectedRoute component={CartesMembres} />
      </Route>
      <Route path="/finances/tableau-bord">
        <ProtectedRoute component={FinancesTableauBordPage} />
      </Route>
      <Route path="/expeditions/nouvelle">
        <ProtectedRoute component={NouvelleExpeditionPage} />
      </Route>
      <Route path="/expeditions/:id">
        <ProtectedRoute component={ExpeditionDetailPage} />
      </Route>
      <Route path="/expeditions">
        <ProtectedRoute component={ExpeditionsPage} />
      </Route>
      <Route path="/entrepots">
        <ProtectedRoute component={EntrepotsPage} />
      </Route>
      <Route path="/peseurs">
        <ProtectedRoute component={PeseursPage} />
      </Route>
      <Route path="/mes-peseurs">
        <ProtectedRoute component={MesPeseursPage} />
      </Route>
      <Route path="/mon-entrepot">
        <ProtectedRoute component={MonEntrepotPage} />
      </Route>
      <Route path="/ops-en-attente">
        <ProtectedRoute component={PendingOpsPage} />
      </Route>
      <Route path="/archives">
        <ProtectedRoute component={ArchivesPage} />
      </Route>
      <Route path="/certifications/tableau-de-bord">
        <ProtectedRoute component={CertificationsDashboardPage} />
      </Route>
      <Route path="/certifications">
        <ProtectedRoute component={CertificationsPage} />
      </Route>
      <Route path="/enquetes/:id">
        <ProtectedRoute component={MissionEnqueteDetailPage} />
      </Route>
      <Route path="/enquetes">
        <ProtectedRoute component={MissionsEnquetePage} />
      </Route>
      <Route path="/charges-diverses">
        <ProtectedRoute component={ChargesDiversesPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [splashTermine, setSplashTermine] = useState(false);
  const handleSplashTermine = useCallback(() => setSplashTermine(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>
        {!splashTermine && <SplashScreen onTermine={handleSplashTermine} />}
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <ErrorBoundary>
              <OnlineToast />
              <AppRoutes />
              <Toaster
                position="top-right"
                richColors
                closeButton
                toastOptions={{
                  classNames: {
                    success: "!border-l-4 !border-l-emerald-500",
                    error: "!border-l-4 !border-l-red-500",
                    warning: "!border-l-4 !border-l-amber-500",
                    info: "!border-l-4 !border-l-blue-500",
                  },
                }}
              />
              <PdfViewerModal />
            </ErrorBoundary>
          </AuthProvider>
        </WouterRouter>
      </OfflineProvider>
    </QueryClientProvider>
  );
}

export default App;
