import { createContext, useContext, useState, type ReactNode } from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

// Strip trailing /api if present — VITE_API_URL must point to the server root,
// not /api, because Orval already prepends /api to every generated path.
setBaseUrl((import.meta.env.VITE_API_URL ?? "").replace(/\/api\/?$/, ""));

const TOKEN_KEY = "coop_token";
const USER_KEY = "coop_user";

setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? (JSON.parse(stored) as Utilisateur) : null;
  });

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
