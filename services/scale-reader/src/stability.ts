/**
 * stability.ts — Filtre de stabilité pour les lectures de balance
 *
 * Une lecture est considérée "stable" si :
 *   - Au moins STABLE_COUNT lectures consécutives ont été reçues
 *   - Toutes ces lectures se situent dans une fenêtre de ± TOLERANCE_KG
 *   - Ces lectures sont espacées d'au moins MIN_INTERVAL_MS entre elles
 *     (pour ignorer les rafales à fréquence très élevée)
 */

const STABLE_COUNT = 3;         // nb de lectures consécutives requises
const TOLERANCE_KG = 0.5;       // variation max admise sur la fenêtre (kg)
const MIN_INTERVAL_MS = 150;    // ignorer les lectures trop rapprochées
const MAX_AGE_MS = 3_000;       // une lecture de plus de 3 s est considérée obsolète

interface Sample {
  weightKg: number;
  timestamp: number;
}

export class StabilityFilter {
  private samples: Sample[] = [];
  private lastAcceptedTs = 0;

  /**
   * Soumet une nouvelle lecture.
   * @returns { isStable, weightKg } — weightKg est null si pas encore stable
   */
  push(weightKg: number, now = Date.now()): { isStable: boolean; weightKg: number | null } {
    // Throttle : ignorer les lectures trop rapprochées
    if (now - this.lastAcceptedTs < MIN_INTERVAL_MS) {
      return this.currentState();
    }
    this.lastAcceptedTs = now;

    this.samples.push({ weightKg, timestamp: now });

    // Ne conserver que les STABLE_COUNT dernières ET récentes
    const cutoff = now - MAX_AGE_MS;
    this.samples = this.samples.filter((s) => s.timestamp >= cutoff).slice(-STABLE_COUNT);

    return this.currentState();
  }

  /** Remet à zéro (ex: reconnexion port série) */
  reset() {
    this.samples = [];
    this.lastAcceptedTs = 0;
  }

  private currentState(): { isStable: boolean; weightKg: number | null } {
    if (this.samples.length < STABLE_COUNT) {
      return { isStable: false, weightKg: this.samples.at(-1)?.weightKg ?? null };
    }

    const weights = this.samples.map((s) => s.weightKg);
    const min = Math.min(...weights);
    const max = Math.max(...weights);

    if (max - min <= TOLERANCE_KG) {
      // Moyenne des lectures stables, arrondie à 3 décimales
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
      return { isStable: true, weightKg: Math.round(avg * 1000) / 1000 };
    }

    return { isStable: false, weightKg: this.samples.at(-1)?.weightKg ?? null };
  }
}
