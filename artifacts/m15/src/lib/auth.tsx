import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { type M15User, clearToken, setToken } from "./api";

interface AuthCtx {
  user: M15User | null;
  token: string | null;
  login: (token: string, user: M15User) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, token: null, login: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<M15User | null>(() => {
    try { return JSON.parse(localStorage.getItem("m15_user") ?? "null"); } catch { return null; }
  });
  const [token, setLocalToken] = useState<string | null>(() => localStorage.getItem("m15_token"));

  const login = (t: string, u: M15User) => {
    setToken(t);
    localStorage.setItem("m15_user", JSON.stringify(u));
    setLocalToken(t);
    setUser(u);
  };

  const logout = () => {
    clearToken();
    setLocalToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
