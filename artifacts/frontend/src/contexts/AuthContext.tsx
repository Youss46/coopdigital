import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { ApiError, setAuthTokenGetter, setBaseUrl, setOnUnauthorized } from "@workspace/api-client-react";

// Strip trailing /api if present — VITE_API_URL must point to the server root,
// not /api, because Orval already prepends /api to every generated path.
setBaseUrl((import.meta.env.VITE_API_URL ?? "").replace(/\/api\/?$/, ""));

const TOKEN_KEY = "coop_token";
const USER_KEY  = "coop_user";
const ACTIVITY_KEY = "coop_last_activity_at";
export const AUTH_MESSAGE_KEY = "coop_auth_message";
export const ROLE_DISABLED_MESSAGE = "Votre compte est désactivé. Veuillez contacter le PCA.";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

function recordActivity(at = Date.now()) {
  localStorage.setItem(ACTIVITY_KEY, String(at));
}

function isIdle(now = Date.now()): boolean {
  const raw = Number(localStorage.getItem(ACTIVITY_KEY));
  const last = Number.isFinite(raw) && raw > 0 ? raw : null;
  return last == null || now - last >= IDLE_TIMEOUT_MS;
}

setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

// Quand le serveur répond 401 (token expiré ou invalide), on efface la session
// et on redirige vers la page de connexion plutôt que d'afficher un tableau vide.
setOnUnauthorized((error) => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  const data = error instanceof ApiError && error.data && typeof error.data === "object"
    ? error.data as { code?: unknown }
    : null;
  if (data?.code === "ROLE_DISABLED") {
    localStorage.setItem(AUTH_MESSAGE_KEY, ROLE_DISABLED_MESSAGE);
  } else {
    localStorage.removeItem(AUTH_MESSAGE_KEY);
  }
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  window.location.href = `${base}/login`;
});

interface Utilisateur {
  id: number;
  nom: string;
  prenoms: string;
  role: string;
  cooperativeId: number | null;
  photoUrl?: string | null;
}

interface AuthContextType {
  utilisateur: Utilisateur | null;
  token: string | null;
  login: (token: string, utilisateur: Utilisateur) => void;
  logout: () => void;
  estConnecte: boolean;
  updatePhotoUrl: (photoUrl: string | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    // Si la session est en idle dès l'ouverture, on la vide immédiatement
    if (isIdle()) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return localStorage.getItem(TOKEN_KEY);
  });
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? (JSON.parse(stored) as Utilisateur) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUtilisateur(null);
  }, []);

  const login = (newToken: string, newUser: Utilisateur) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    localStorage.removeItem(AUTH_MESSAGE_KEY);
    recordActivity();
    setToken(newToken);
    setUtilisateur(newUser);
  };

  // ── Déconnexion automatique après 30 min d'inactivité ──────────────────
  useEffect(() => {
    if (!token || !utilisateur) return;

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
  }, [token, utilisateur, logout]);

  const updatePhotoUrl = (photoUrl: string | null) => {
    setUtilisateur((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, photoUrl };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ utilisateur, token, login, logout, estConnecte: !!token, updatePhotoUrl }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
