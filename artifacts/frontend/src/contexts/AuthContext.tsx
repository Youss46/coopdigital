import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

setBaseUrl(import.meta.env.VITE_API_URL ?? "");

interface Utilisateur {
  id: number;
  nom: string;
  prenoms: string;
  role: string;
  cooperativeId: number | null;
}

interface AuthContextType {
  utilisateur: Utilisateur | null;
  token: string | null;
  login: (token: string, utilisateur: Utilisateur) => void;
  logout: () => void;
  estConnecte: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "coop_token";
const USER_KEY = "coop_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? (JSON.parse(stored) as Utilisateur) : null;
  });

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
  }, []);

  const login = (newToken: string, newUser: Utilisateur) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUtilisateur(newUser);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUtilisateur(null);
    setAuthTokenGetter(null);
  };

  return (
    <AuthContext.Provider value={{ utilisateur, token, login, logout, estConnecte: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
