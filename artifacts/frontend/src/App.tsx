import { useState, useCallback } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import SplashScreen from "@/components/SplashScreen";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Membres from "@/pages/Membres";
import MembreFiche from "@/pages/MembreFiche";
import Avances from "@/pages/Avances";
import NouvelleLivraison from "@/pages/NouvelleLivraison";
import TracabilitePage from "@/pages/TracabilitePage";
import ParcellePage from "@/pages/ParcellePage";
import RsePage from "@/pages/RsePage";
import StocksPage from "@/pages/StocksPage";
import ExportateursPage from "@/pages/ExportateursPage";
import CreancesPage from "@/pages/CreancesPage";
import CommunicationPage from "@/pages/CommunicationPage";
import SalairesPage from "@/pages/SalairesPage";
import ReportingPage from "@/pages/ReportingPage";
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
import TransportPage from "@/pages/TransportPage";
import PeseePage from "@/pages/PeseePage";
import EquipementsPage from "@/pages/EquipementsPage";
import PrevisionsPage from "@/pages/PrevisionsPage";
import DonsPage from "@/pages/DonsPage";
import PlanningCollectePage from "@/pages/PlanningCollectePage";
import FormationsPage from "@/pages/FormationsPage";
import CaissePage from "@/pages/CaissePage";
import FiscalitePage from "@/pages/FiscalitePage";
import ReconciliationPage from "@/pages/ReconciliationPage";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { Toaster } from "@/components/ui/toaster";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { estConnecte } = useAuth();
  if (!estConnecte) return <Redirect to="/login" />;
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function AppRoutes() {
  const { estConnecte } = useAuth();
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        {estConnecte ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/membres/:id">
        <ProtectedRoute component={MembreFiche} />
      </Route>
      <Route path="/membres">
        <ProtectedRoute component={Membres} />
      </Route>
      <Route path="/avances">
        <ProtectedRoute component={Avances} />
      </Route>
      <Route path="/livraisons/nouvelle">
        <ProtectedRoute component={NouvelleLivraison} />
      </Route>
      <Route path="/tracabilite">
        <ProtectedRoute component={TracabilitePage} />
      </Route>
      <Route path="/parcelles">
        <ProtectedRoute component={ParcellePage} />
      </Route>
      <Route path="/rse">
        <ProtectedRoute component={RsePage} />
      </Route>
      <Route path="/stocks">
        <ProtectedRoute component={StocksPage} />
      </Route>
      <Route path="/exportateurs">
        <ProtectedRoute component={ExportateursPage} />
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
        <ProtectedRoute component={ParametresPage} />
      </Route>
      <Route path="/transport">
        <ProtectedRoute component={TransportPage} />
      </Route>
      <Route path="/pesee">
        <ProtectedRoute component={PeseePage} />
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
      <Route path="/planning">
        <ProtectedRoute component={PlanningCollectePage} />
      </Route>
      <Route path="/formations">
        <ProtectedRoute component={FormationsPage} />
      </Route>
      <Route path="/caisse">
        <ProtectedRoute component={CaissePage} />
      </Route>
      <Route path="/fiscalite">
        <ProtectedRoute component={FiscalitePage} />
      </Route>
      <Route path="/reconciliation">
        <ProtectedRoute component={ReconciliationPage} />
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
      {!splashTermine && <SplashScreen onTermine={handleSplashTermine} />}
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
