type AnalyticsData = Record<string, string | number | boolean>;

export type VenteSource = "lot" | "reception_port" | "fournisseur";

export interface VenteResponse {
  ok: boolean;
  statut?: string;
}

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackVenteEnregistree(
  source: VenteSource,
  response: VenteResponse,
): void {
  if (!response.ok) return;

  trackEvent("vente_enregistree", {
    source,
    statut: response.statut ?? "en_attente",
  });
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break the app.
  }
}