import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getToken, clearToken, api, type Profil } from "./api";

const ACTIVITY_KEY = "portail_last_activity_at";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

function recordActivity(at = Date.now()) {
  localStorage.setItem(ACTIVITY_KEY, String(at));
}

function isIdle(now = Date.now()): boolean {
  const raw = Number(localStorage.getItem(ACTIVITY_KEY));
  const last = Number.isFinite(raw) && raw > 0 ? raw : null;
  return last == null || now - last >= IDLE_TIMEOUT_MS;
}

interface AuthCtx {
  profil: Profil | null;
  loading: boolean;
  login: (p: Profil) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ profil: null, loading: true, login: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session déjà expirée par inactivité avant l'ouverture de l'onglet
    if (getToken() && isIdle()) {
      clearToken();
      setLoading(false);
      return;
    }
    if (getToken()) {
      api.profil()
        .then((p) => { recordActivity(); setProfil(p); })
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => { clearToken(); setProfil(null); }, []);

  const login = (p: Profil) => { recordActivity(); setProfil(p); };

  // ── Déconnexion automatique après 30 min d'inactivité ──────────────────
  useEffect(() => {
    if (!profil) return;

    let idleTimer: number | undefined;
    let lastActivityAt = Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now();

    const logoutIfIdle = () => {
      if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
        logout();
        return;
      }
      scheduleNext();
    };

    const scheduleNext = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt));
      idleTimer = window.setTimeout(logoutIfIdle, remaining);
    };

    const onActivity = () => {
      lastActivityAt = Date.now();
      recordActivity(lastActivityAt);
      scheduleNext();
    };

    const onResume = () => {
      if (document.visibilityState === "visible") logoutIfIdle();
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    window.addEventListener("focus", logoutIfIdle);
    document.addEventListener("visibilitychange", onResume);
    scheduleNext();

    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("focus", logoutIfIdle);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [profil, logout]);

  return <Ctx.Provider value={{ profil, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
