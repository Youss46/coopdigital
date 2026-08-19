import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  saveAuth,
  getStoredActiveAuth,
  getLastAuthActivity,
  recordAuthActivity,
  isTerrainSessionIdle,
  TERRAIN_IDLE_TIMEOUT_MS,
  clearAuth,
} from "../lib/auth";
import type { AgentUser } from "../lib/types";

interface AuthContextValue {
  user: AgentUser | null;
  token: string | null;
  login: (token: string, user: AgentUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialAuth] = useState(() => getStoredActiveAuth());
  const [user, setUser] = useState<AgentUser | null>(initialAuth?.user ?? null);
  const [token, setToken] = useState<string | null>(initialAuth?.token ?? null);

  function login(newToken: string, newUser: AgentUser) {
    saveAuth(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
  }

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token || !user) return;

    let idleTimer: number | undefined;
    let lastActivityAt = getLastAuthActivity() ?? Date.now();

    const logoutIfIdle = () => {
      if (isTerrainSessionIdle(lastActivityAt)) {
        logout();
        return;
      }
      scheduleIdleLogout();
    };

    const scheduleIdleLogout = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      const remaining = Math.max(0, TERRAIN_IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt));
      idleTimer = window.setTimeout(logoutIfIdle, remaining);
    };

    const recordActivity = () => {
      lastActivityAt = Date.now();
      recordAuthActivity(lastActivityAt);
      scheduleIdleLogout();
    };

    const checkAfterBackground = () => {
      if (document.visibilityState === "visible") logoutIfIdle();
    };

    const handleFocus = () => logoutIfIdle();

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    activityEvents.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", checkAfterBackground);
    scheduleIdleLogout();

    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      activityEvents.forEach((event) => window.removeEventListener(event, recordActivity));
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", checkAfterBackground);
    };
  }, [token, user, logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token && !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
