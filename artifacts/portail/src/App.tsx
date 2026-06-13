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
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useEffect } from "react";

function PushSetup() {
  const { profil } = useAuth();
  const loggedIn = !!profil;
  const { subscribe, isSupported } = usePushNotifications(loggedIn);

  useEffect(() => {
    if (!isSupported || !loggedIn) return;
    if (!("Notification" in window)) return;
    // Subscribe (or silently re-subscribe) whenever permission is not explicitly denied.
    // - "default" → prompts the user once
    // - "granted" → silently creates/re-syncs the subscription without any prompt
    if (Notification.permission !== "denied") {
      subscribe();
    }
  }, [loggedIn, isSupported, subscribe]);

  return null;
}

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
      <Route path="/verifier/:code" component={VerifierPage} />
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
        <PushSetup />
        <AppRoutes />
        <InstallBanner />
      </WouterRouter>
    </AuthProvider>
  );
}
