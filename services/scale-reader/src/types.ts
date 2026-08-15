/** Lecture brute issue du port série */
export interface RawReading {
  rawLine: string;
  weightKg: number;
  timestamp: number; // Date.now()
}

/** État publié via WebSocket / HTTP vers le frontend */
export interface ScaleState {
  /** Poids actuel en kg (null si pas encore de lecture valide) */
  weightKg: number | null;
  /** true si le poids est stable (plusieurs lectures consécutives cohérentes) */
  isStable: boolean;
  /** true si le port série est ouvert et reçoit des données */
  isConnected: boolean;
  /** Dernière mise à jour (ISO 8601) */
  updatedAt: string;
  /** Message d'erreur si déconnecté */
  error: string | null;
}
