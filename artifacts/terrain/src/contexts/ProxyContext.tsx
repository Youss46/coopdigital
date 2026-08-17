import { createContext, useContext, useState, type ReactNode } from "react";

export interface DelegueProxy {
  id: number;
  nom: string;
  prenoms: string;
  section: string | null;
  zoneNom: string | null;
}

interface ProxyContextValue {
  proxy: DelegueProxy | null;
  setProxy: (d: DelegueProxy | null) => void;
}

const ProxyContext = createContext<ProxyContextValue>({ proxy: null, setProxy: () => {} });

const STORAGE_KEY = "terrain_proxy_delegue";

export function ProxyProvider({ children }: { children: ReactNode }) {
  const [proxy, setProxyState] = useState<DelegueProxy | null>(() => {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      return s ? (JSON.parse(s) as DelegueProxy) : null;
    } catch { return null; }
  });

  function setProxy(d: DelegueProxy | null) {
    setProxyState(d);
    if (d) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  return <ProxyContext.Provider value={{ proxy, setProxy }}>{children}</ProxyContext.Provider>;
}

export function useProxy() {
  return useContext(ProxyContext);
}
