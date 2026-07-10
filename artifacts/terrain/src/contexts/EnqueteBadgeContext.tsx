import { createContext, useContext, useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import type { MissionEnquete } from "../lib/types";

interface EnqueteBadgeCtx {
  count: number;
  refresh: () => void;
}

const Ctx = createContext<EnqueteBadgeCtx>({ count: 0, refresh: () => {} });

export function EnqueteBadgeProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = () => {
    apiGet<MissionEnquete[]>("/enquetes")
      .then((list) => {
        const actives = list.filter(
          (m) => m.statut === "planifiee" || m.statut === "en_cours",
        ).length;
        setCount(actives);
      })
      .catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  return <Ctx.Provider value={{ count, refresh }}>{children}</Ctx.Provider>;
}

export function useEnqueteBadge() { return useContext(Ctx); }
