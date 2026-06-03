import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Membres from "@/pages/Membres";
import MembreFiche from "@/pages/MembreFiche";
import Avances from "@/pages/Avances";
import NouvelleLivraison from "@/pages/NouvelleLivraison";
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
