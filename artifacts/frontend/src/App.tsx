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
import StocksPage from "@/pages/StocksPage";
import ExportateursPage from "@/pages/ExportateursPage";
import CreancesPage from "@/pages/CreancesPage";
import CommunicationPage from "@/pages/CommunicationPage";
import ReportingPage from "@/pages/ReportingPage";
import ComptesPage from "@/pages/ComptesPage";
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
      <Route path="/stocks">
        <ProtectedRoute component={StocksPage} />
      </Route>
      <Route path="/exportateurs">
        <ProtectedRoute component={ExportateursPage} />
      </Route>
      <Route path="/creances">
        <ProtectedRoute component={CreancesPage} />
      </Route>
      <Route path="/communication">
        <ProtectedRoute component={CommunicationPage} />
      </Route>
      <Route path="/reporting">
        <ProtectedRoute component={ReportingPage} />
      </Route>
      <Route path="/administration/comptes">
        <ProtectedRoute component={ComptesPage} />
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
