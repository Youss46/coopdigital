import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { OfflineBanner, OnlineToast } from "@/components/OfflineIndicator";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Cooperatives from "@/pages/Cooperatives";
import NouvelleCoop from "@/pages/NouvelleCoop";
import CoopDetail from "@/pages/CoopDetail";
import Licences from "@/pages/Licences";
import Revenus from "@/pages/Revenus";
import Support from "@/pages/Support";
import Plans from "@/pages/Plans";

const queryClient = new QueryClient();

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const { token } = useAuth();
  if (!token) return <Redirect to="/login" />;
  return <Component />;
}

function AppRoutes() {
  const { token } = useAuth();
  const [location] = useLocation();

  if (token && location === "/login") return <Redirect to="/dashboard" />;

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard"><PrivateRoute component={Dashboard} /></Route>
      <Route path="/cooperatives/nouvelle"><PrivateRoute component={NouvelleCoop} /></Route>
      <Route path="/cooperatives/:id"><PrivateRoute component={CoopDetail} /></Route>
      <Route path="/cooperatives"><PrivateRoute component={Cooperatives} /></Route>
      <Route path="/licences"><PrivateRoute component={Licences} /></Route>
      <Route path="/revenus"><PrivateRoute component={Revenus} /></Route>
      <Route path="/plans"><PrivateRoute component={Plans} /></Route>
      <Route path="/support"><PrivateRoute component={Support} /></Route>
      <Route path="/"><Redirect to={token ? "/dashboard" : "/login"} /></Route>
      <Route><Redirect to={token ? "/dashboard" : "/login"} /></Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <OfflineBanner />
          <OnlineToast />
          <AppRoutes />
        </WouterRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
