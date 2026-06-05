import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Bell, X, Check, CheckCheck, ExternalLink } from "lucide-react";
import {
  useGetNotificationsCount,
  useGetNotifications,
  useMarquerNotificationLue,
  useMarquerToutLu,
  getGetNotificationsCountQueryKey,
  getGetNotificationsQueryKey,
  GetNotificationsLu,
  GetNotificationsGravite,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

type Gravite = "info" | "attention" | "critique";

const GRAVITE_DOT: Record<Gravite, string> = {
  critique:  "bg-red-500",
  attention: "bg-amber-400",
  info:      "bg-blue-400",
};

const GRAVITE_LABEL: Record<Gravite, string> = {
  critique:  "🔴",
  attention: "🟡",
  info:      "🔵",
};

type Onglet = "toutes" | "non_lues" | "critiques";

export default function NotificationPanel() {
  const [ouvert, setOuvert] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("toutes");
  const panelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: countData } = useGetNotificationsCount({
    query: {
      queryKey: getGetNotificationsCountQueryKey(),
      refetchInterval: 30_000,
    },
  });

  const nonLues      = countData?.non_lues ?? 0;
  const critiquesNL  = countData?.critiques_non_lues ?? 0;

  const queryParams = {
    lu:      onglet === "non_lues" ? GetNotificationsLu.false : undefined,
    gravite: onglet === "critiques" ? GetNotificationsGravite.critique : undefined,
    page:    1,
    limit:   20,
  };

  const { data: notifData, isLoading } = useGetNotifications(queryParams, {
    query: {
      queryKey: getGetNotificationsQueryKey(queryParams),
      enabled: ouvert,
    },
  });

  const marquerLue  = useMarquerNotificationLue();
  const marquerTout = useMarquerToutLu();

  const notifications = notifData?.notifications ?? [];

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["getNotifications"] });
    qc.invalidateQueries({ queryKey: ["getNotificationsCount"] });
  }

  // Fermer en cliquant en dehors
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    if (ouvert) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ouvert]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Cloche */}
      <button
        onClick={() => setOuvert((o) => !o)}
        className="relative p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {nonLues > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
            style={{ backgroundColor: "#dc2626" }}
          >
            {nonLues > 99 ? "99+" : nonLues}
          </span>
        )}
      </button>

      {/* Panneau coulissant */}
      {ouvert && (
        <>
          {/* Overlay mobile */}
          <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setOuvert(false)} />

          <div
            className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col
                       lg:absolute lg:top-full lg:right-0 lg:h-auto lg:max-h-[560px] lg:w-96 lg:rounded-xl lg:mt-2 lg:border lg:border-gray-200"
          >
            {/* Header panel */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-gray-600" />
                <span className="font-semibold text-gray-900 text-sm">Notifications</span>
                {nonLues > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold px-1"
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    {nonLues}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {nonLues > 0 && (
                  <button
                    onClick={() => marquerTout.mutate(undefined, { onSuccess: invalidateAll })}
                    title="Tout marquer comme lu"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-green-700 hover:bg-green-50 text-xs"
                  >
                    <CheckCheck size={15} />
                  </button>
                )}
                <button
                  onClick={() => setOuvert(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Onglets */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {(["toutes", "non_lues", "critiques"] as Onglet[]).map((o) => {
                const labels: Record<Onglet, string> = {
                  toutes:    "Toutes",
                  non_lues:  `Non lues${nonLues > 0 ? ` (${nonLues})` : ""}`,
                  critiques: `Critiques${critiquesNL > 0 ? ` (${critiquesNL})` : ""}`,
                };
                return (
                  <button
                    key={o}
                    onClick={() => setOnglet(o)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
                      onglet === o
                        ? "border-green-700 text-green-800"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {labels[o]}
                  </button>
                );
              })}
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-gray-400">Chargement…</div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Aucune notification</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const g = (n.gravite ?? "info") as Gravite;
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-2.5 px-4 py-3 hover:bg-gray-50 transition-colors ${!n.lu ? "bg-blue-50/40" : ""}`}
                    >
                      <span className={`flex-shrink-0 block w-2 h-2 rounded-full mt-1.5 ${GRAVITE_DOT[g]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px]">{GRAVITE_LABEL[g]}</span>
                          <span className={`text-[13px] font-semibold leading-snug ${!n.lu ? "text-gray-900" : "text-gray-600"}`}>
                            {n.titre}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {n.lien && (
                            <Link
                              href={n.lien}
                              onClick={() => {
                                setOuvert(false);
                                if (!n.lu) marquerLue.mutate({ id: n.id! }, { onSuccess: invalidateAll });
                              }}
                              className="text-[11px] text-green-700 hover:text-green-900 flex items-center gap-0.5"
                            >
                              {n.lien_libelle ?? "Voir"} <ExternalLink size={9} />
                            </Link>
                          )}
                          <span className="text-[11px] text-gray-400">
                            {n.created_at
                              ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })
                              : ""}
                          </span>
                        </div>
                      </div>
                      {!n.lu && (
                        <button
                          title="Marquer comme lu"
                          onClick={() => marquerLue.mutate({ id: n.id! }, { onSuccess: invalidateAll })}
                          className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-green-600 self-start"
                        >
                          <Check size={13} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-gray-100 px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => setOuvert(false)}
                className="block text-center text-xs text-green-700 hover:text-green-900 font-medium"
              >
                Voir toutes les notifications →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
