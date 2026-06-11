import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { AuthProvider, useAuth } from "@/lib/auth";
import ConnexionPage from "@/pages/ConnexionPage";
import DashboardPage from "@/pages/DashboardPage";
import LivraisonsPage from "@/pages/LivraisonsPage";
import AvancesPage from "@/pages/AvancesPage";
import PartsSocialesPage from "@/pages/PartsSocialesPage";
import DocumentsPage from "@/pages/DocumentsPage";
import { InstallBanner, OfflineBanner, OnlineToast } from "@/components/InstallPrompt";
import { Loader2 } from "lucide-react";
import VerifierPage from "@/pages/VerifierPage";

function AppRoutes() {
  const { profil, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-green-800 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if (!profil) {
    return (
      <Switch>
        <Route path="/verifier/:code" component={VerifierPage} />
        <Route path="/connexion" component={ConnexionPage} />
        <Route><Redirect to="/connexion" /></Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/livraisons" component={LivraisonsPage} />
      <Route path="/avances" component={AvancesPage} />
      <Route path="/parts-sociales" component={PartsSocialesPage} />
      <Route path="/documents" component={DocumentsPage} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <OfflineBanner />
        <OnlineToast />
        <AppRoutes />
        <InstallBanner />
      </WouterRouter>
    </AuthProvider>
  );
}
