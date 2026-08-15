import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OfflineProvider } from "./contexts/OfflineContext";
import { EnqueteBadgeProvider } from "./contexts/EnqueteBadgeContext";
import { usePushSubscription } from "./hooks/usePushSubscription";
import OfflineBanner from "./components/OfflineBanner";
import SystemBanner from "./components/SystemBanner";
import Login from "./pages/Login";
import Accueil from "./pages/Accueil";
import CollecteFlow from "./pages/CollecteFlow";
import SessionPeseeFlow from "./pages/SessionPeseeFlow";
import PaiementFlow from "./pages/PaiementFlow";
import AvanceFlow from "./pages/AvanceFlow";
import Bilan from "./pages/Bilan";
import SyncHistorique from "./pages/SyncHistorique";
import ChangerMotDePasse from "./pages/ChangerMotDePasse";
import PaiementsDifferes from "./pages/PaiementsDifferes";
import Commissions from "./pages/Commissions";
import AccueilAgent from "./pages/AccueilAgent";
import AccueilPeseur from "./pages/AccueilPeseur";
import HistoriquePeseur from "./pages/HistoriquePeseur";
import AccueilChauffeur from "./pages/AccueilChauffeur";
import MissionsChauffeur from "./pages/MissionsChauffeur";
import BonsCarburantChauffeur from "./pages/BonsCarburantChauffeur";
import MissionsAgent from "./pages/MissionsAgent";
import MissionDetail from "./pages/MissionDetail";
import CollecteGps from "./pages/CollecteGps";
import HistoriqueAgent from "./pages/HistoriqueAgent";
import EnquetesAgent from "./pages/EnquetesAgent";
import MissionEnqueteDetail from "./pages/MissionEnqueteDetail";
import CollecteEnquete from "./pages/CollecteEnquete";
import StationService from "./pages/StationService";
import StationChauffeur from "./pages/StationChauffeur";
import HistoriqueChauffeur from "./pages/HistoriqueChauffeur";

function AgentTerrainRoutes() {
  return (
    <Switch>
      <Route path="/" component={AccueilAgent} />
      <Route path="/missions" component={MissionsAgent} />
      <Route path="/missions/:id/parcelle/:membreId" component={CollecteGps} />
      <Route path="/missions/:id" component={MissionDetail} />
      <Route path="/enquetes" component={EnquetesAgent} />
      <Route path="/enquetes/:id/membres/:membreId" component={CollecteEnquete} />
      <Route path="/enquetes/:id" component={MissionEnqueteDetail} />
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
      <Route path="/commissions" component={Commissions} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}

function ChauffeurRoutes() {
  return (
    <Switch>
      <Route path="/" component={AccueilChauffeur} />
      <Route path="/missions" component={MissionsChauffeur} />
      <Route path="/carburant" component={BonsCarburantChauffeur} />
      <Route path="/station" component={StationChauffeur} />
      <Route path="/historique" component={HistoriqueChauffeur} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}

function PeseurRoutes() {
  return (
    <Switch>
      <Route path="/" component={AccueilPeseur} />
      <Route path="/collecte" component={CollecteFlow} />
      <Route path="/pesee-session/:sessionId" component={SessionPeseeFlow} />
      <Route path="/pesee-session" component={SessionPeseeFlow} />
      <Route path="/historique" component={HistoriquePeseur} />
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
    return (
      <EnqueteBadgeProvider>
        <AgentTerrainRoutes />
      </EnqueteBadgeProvider>
    );
  }

  if (user?.role === "peseur") {
    return <PeseurRoutes />;
  }

  if (user?.role === "chauffeur") {
    return <ChauffeurRoutes />;
  }

  return <DelegueRoutes />;
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AuthProvider>
        <OfflineProvider>
          <SystemBanner />
          <OfflineBanner />
          {/* Route publique station-service — AVANT le guard auth */}
          <Switch>
            <Route path="/station/:numero" component={StationService} />
            <Route component={AppRoutes} />
          </Switch>
        </OfflineProvider>
      </AuthProvider>
    </WouterRouter>
  );
}
