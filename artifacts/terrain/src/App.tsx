import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OfflineProvider } from "./contexts/OfflineContext";
import { usePushSubscription } from "./hooks/usePushSubscription";
import OfflineBanner from "./components/OfflineBanner";
import Login from "./pages/Login";
import Accueil from "./pages/Accueil";
import CollecteFlow from "./pages/CollecteFlow";
import PaiementFlow from "./pages/PaiementFlow";
import AvanceFlow from "./pages/AvanceFlow";
import Bilan from "./pages/Bilan";
import SyncHistorique from "./pages/SyncHistorique";
import ChangerMotDePasse from "./pages/ChangerMotDePasse";
import PaiementsDifferes from "./pages/PaiementsDifferes";
import AccueilAgent from "./pages/AccueilAgent";
import MissionsAgent from "./pages/MissionsAgent";
import MissionDetail from "./pages/MissionDetail";
import CollecteGps from "./pages/CollecteGps";
import HistoriqueAgent from "./pages/HistoriqueAgent";

function AgentTerrainRoutes() {
  return (
    <Switch>
      <Route path="/" component={AccueilAgent} />
      <Route path="/missions" component={MissionsAgent} />
      <Route path="/missions/:id/parcelle/:membreId" component={CollecteGps} />
      <Route path="/missions/:id" component={MissionDetail} />
      <Route path="/historique" component={HistoriqueAgent} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}

function DelegueRoutes() {
  return (
    <Switch>
      <Route path="/" component={Accueil} />
      <Route path="/collecte" component={CollecteFlow} />
      <Route path="/paiement" component={PaiementFlow} />
      <Route path="/avance" component={AvanceFlow} />
      <Route path="/bilan" component={Bilan} />
      <Route path="/historique" component={SyncHistorique} />
      <Route path="/paiements-differes" component={PaiementsDifferes} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  usePushSubscription(isAuthenticated);

  if (!isAuthenticated) {
    return <Login />;
  }

  if (user?.motDePasseTemporaire) {
    return <ChangerMotDePasse />;
  }

  if (user?.role === "agent_terrain") {
    return <AgentTerrainRoutes />;
  }

  return <DelegueRoutes />;
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
