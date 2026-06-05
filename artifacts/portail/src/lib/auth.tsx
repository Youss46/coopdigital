import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getToken, clearToken, api, type Profil } from "./api";

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
    if (getToken()) {
      api.profil()
        .then(setProfil)
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (p: Profil) => setProfil(p);
  const logout = () => { clearToken(); setProfil(null); };

  return <Ctx.Provider value={{ profil, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
