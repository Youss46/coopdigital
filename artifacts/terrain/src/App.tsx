import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OfflineProvider } from "./contexts/OfflineContext";
import OfflineBanner from "./components/OfflineBanner";
import Login from "./pages/Login";
import Accueil from "./pages/Accueil";
import CollecteFlow from "./pages/CollecteFlow";
import PaiementFlow from "./pages/PaiementFlow";
import AvanceFlow from "./pages/AvanceFlow";
import Bilan from "./pages/Bilan";
import SyncHistorique from "./pages/SyncHistorique";
import ChangerMotDePasse from "./pages/ChangerMotDePasse";

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  if (user?.motDePasseTemporaire) {
    return <ChangerMotDePasse />;
  }

  return (
    <Switch>
      <Route path="/" component={Accueil} />
      <Route path="/collecte" component={CollecteFlow} />
      <Route path="/paiement" component={PaiementFlow} />
      <Route path="/avance" component={AvanceFlow} />
      <Route path="/bilan" component={Bilan} />
      <Route path="/historique" component={SyncHistorique} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AuthProvider>
        <OfflineProvider>
          <OfflineBanner />
          <AppRoutes />
        </OfflineProvider>
      </AuthProvider>
    </WouterRouter>
  );
}
