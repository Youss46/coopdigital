/**
 * useScaleWeight — Hook React qui se connecte au service local de lecture balance.
 *
 * Le service scale-reader tourne sur le PC du peseur (ws://localhost:4001).
 * Si la WebSocket n'est pas disponible, le hook retourne isConnected:false
 * et le peseur peut saisir le poids manuellement — le formulaire n'est
 * jamais bloqué.
 *
 * Configuration :
 *   VITE_SCALE_WS_URL  (optionnel, défaut: ws://localhost:4001)
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface ScaleState {
  /** Poids courant en kg (null si pas encore de lecture stable) */
  weightKg: number | null;
  /** true si le poids est stable (plusieurs mesures consécutives cohérentes) */
  isStable: boolean;
  /** true si le service local répond et le port série est ouvert */
  isConnected: boolean;
  /** Message d'erreur lisible, ou null */
  error: string | null;
}

const DEFAULT_STATE: ScaleState = {
  weightKg: null,
  isStable: false,
  isConnected: false,
  error: null,
};

const WS_URL =
  (import.meta.env.VITE_SCALE_WS_URL as string | undefined) ??
  "ws://localhost:4001";

const RECONNECT_DELAY_MS = 4_000;
const MAX_RECONNECT_ATTEMPTS = 20; // arrêt après ~80 s d'échec

export function useScaleWeight() {
  const [state, setState] = useState<ScaleState>(DEFAULT_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setState((s) => ({
        ...s,
        isConnected: false,
        error: "Service balance non accessible. Saisie manuelle requise.",
      }));
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setState((s) => ({
          ...s,
          isConnected: true,
          error: null,
        }));
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(ev.data as string) as ScaleState;
          setState(data);
        } catch {
          /* trame non-JSON ignorée */
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setState((s) => ({
          ...s,
          isConnected: false,
          isStable: false,
          error: null, // silencieux — le peseur sait que le câble est branché ou pas
        }));
        attemptsRef.current += 1;
        timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        ws.close(); // déclenche onclose → reconnexion planifiée
      };
    } catch {
      attemptsRef.current += 1;
      timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connect]);

  return state;
}
