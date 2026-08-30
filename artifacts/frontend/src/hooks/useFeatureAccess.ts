import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

export type FeatureMode = "active" | "lecture_seule" | "disabled";
export interface EffectiveFeature {
  key: string;
  label: string;
  category: string;
  description: string;
  dependsOn: string[];
  mode: FeatureMode;
  source: "custom" | "default";
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function fetchFeatures(): Promise<EffectiveFeature[]> {
  const token = localStorage.getItem("coop_token") ?? "";
  const response = await fetch(`${BASE}/api/config/features`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Impossible de charger les fonctionnalités");
  const body = await response.json() as { features?: EffectiveFeature[] };
  return body.features ?? [];
}

export function useFeatureAccess(featureKey?: string) {
  const { utilisateur } = useAuth();
  const query = useQuery({
    queryKey: ["cooperative-features", utilisateur?.cooperativeId],
    queryFn: fetchFeatures,
    enabled: !!utilisateur?.cooperativeId,
    staleTime: 60_000,
    retry: 1,
  });
  const feature = query.data?.find((candidate) => candidate.key === featureKey);
  return {
    ...query,
    features: query.data ?? [],
    feature,
    mode: feature?.mode ?? "active",
    isFeatureEnabled: !feature || feature.mode !== "disabled",
    isFeatureReadOnly: feature?.mode === "lecture_seule",
    isFeatureLoading: query.isLoading,
  };
}

export function featureKeyForPath(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? pathname;
  const prefixes: Array<[string, string]> = [
    ["/finances", "finances"], ["/sessions-pesee", "pesee"], ["/bons-reception-membres", "bons_reception"],
    ["/delegues-localites", "delegues_localites"], ["/administration", "administration"], ["/ops-en-attente", "hors_ligne"],
    ["/formations-rse", "formations_rse"], ["/charges-diverses", "charges_diverses"], ["/mobile-marchand", "mobile_marchand"],
    ["/comptabilite", "comptabilite"], ["/reconciliation", "reconciliation"], ["/investissements", "investissements"],
    ["/dashboard", "dashboard"], ["/logistique", "logistique"], ["/membres", "membres"], ["/cartes-membres", "membres"], ["/campagnes", "campagnes"], ["/livraisons", "livraisons"],
    ["/transport", "transport"], ["/expeditions", "expeditions"], ["/tracabilite", "tracabilite"], ["/parcelles", "parcelles"],
    ["/certifications", "certifications"], ["/enquetes", "enquetes"], ["/stocks", "stocks"], ["/entrepots", "entrepots"],
    ["/missions", "missions"], ["/sacherie", "sacherie"],
    ["/mon-entrepot", "entrepots"], ["/refus", "refus"], ["/avances", "avances"], ["/intrants", "intrants"],
    ["/reglements", "reglements"], ["/primes", "primes"], ["/fournisseurs", "fournisseurs"], ["/exportateurs", "exportateurs"],
    ["/ventes", "ventes"], ["/creances", "creances"], ["/prix", "prix"], ["/budget", "budget"], ["/emprunts", "emprunts"],
    ["/subventions", "subventions"], ["/dons", "dons"], ["/caisse", "caisse"], ["/banque", "banque"], ["/cheques", "cheques"],
    ["/fiscalite", "fiscalite"], ["/salaires", "salaires"], ["/rh", "rh"], ["/formations", "formations"], ["/equipements", "equipements"],
    ["/archives", "archives"], ["/previsions", "previsions"], ["/reporting", "reporting"], ["/rapport-gestion", "rapport_gestion"],
    ["/anomalies", "anomalies"], ["/audit", "audit"], ["/gouvernance", "gouvernance"], ["/communication", "communication"],
    ["/peseurs", "peseurs"], ["/mes-peseurs", "peseurs"], ["/parametres", "parametres"],
  ];
  return prefixes.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;
}