import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { saveAuth, getToken, getUser, clearAuth } from "../lib/auth";
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
  const [user, setUser] = useState<AgentUser | null>(getUser);
  const [token, setToken] = useState<string | null>(getToken);

  function login(newToken: string, newUser: AgentUser) {
    saveAuth(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    clearAuth();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token && !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
