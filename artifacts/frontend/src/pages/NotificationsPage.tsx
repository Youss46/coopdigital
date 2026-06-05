import { useState } from "react";
import { Link } from "wouter";
import { Bell, Trash2, Check, CheckCheck, ExternalLink, Filter } from "lucide-react";
import {
  useGetNotifications,
  useMarquerNotificationLue,
  useMarquerToutLu,
  useSupprimerNotification,
  getGetNotificationsQueryKey,
  GetNotificationsLu,
  GetNotificationsGravite,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

type Gravite = "info" | "attention" | "critique";

const GRAVITE_COLORS: Record<Gravite, string> = {
  critique:  "bg-red-500",
  attention: "bg-amber-400",
  info:      "bg-blue-400",
};

const GRAVITE_LABELS: Record<Gravite, string> = {
  critique:  "Critique",
  attention: "Attention",
  info:      "Info",
};

function GraviteBadge({ gravite }: { gravite: string }) {
  const g = gravite as Gravite;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-semibold ${GRAVITE_COLORS[g] ?? "bg-gray-400"}`}>
      {GRAVITE_LABELS[g] ?? gravite}
    </span>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [filtreGravite, setFiltreGravite] = useState<string>("");
  const [filtreLu, setFiltreLu] = useState<string>("");
  const [page, setPage] = useState(1);

  const graviteParam = filtreGravite ? filtreGravite as GetNotificationsGravite : undefined;
  const luParam = filtreLu !== "" ? filtreLu as GetNotificationsLu : undefined;

  const { data, isLoading } = useGetNotifications(
    { gravite: graviteParam, lu: luParam, page, limit: 20 },
    { query: { queryKey: getGetNotificationsQueryKey({ gravite: graviteParam, lu: luParam, page, limit: 20 }) } },
  );

  const marquerLue     = useMarquerNotificationLue();
  const marquerTout    = useMarquerToutLu();
  const supprimer      = useSupprimerNotification();

  const notifications  = data?.notifications ?? [];
  const total          = data?.total ?? 0;
  const totalPages     = Math.ceil(total / 20);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["getNotifications"] });
    qc.invalidateQueries({ queryKey: ["getNotificationsCount"] });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1a4731" }}>
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">{total} notification{total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/notifications/preferences"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Préférences
          </Link>
          <button
            onClick={() => marquerTout.mutate(undefined, { onSuccess: invalidateAll })}
            disabled={marquerTout.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#1a4731" }}
          >
            <CheckCheck size={14} />
            Tout marquer lu
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500">Filtrer :</span>
        </div>
        <select
          value={filtreGravite}
          onChange={(e) => { setFiltreGravite(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
        >
          <option value="">Toutes gravités</option>
          <option value="critique">Critique</option>
          <option value="attention">Attention</option>
          <option value="info">Info</option>
        </select>
        <select
          value={filtreLu}
          onChange={(e) => { setFiltreLu(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
        >
          <option value="">Toutes</option>
          <option value="false">Non lues</option>
          <option value="true">Lues</option>
        </select>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Chargement…</div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Aucune notification</p>
          </div>
        ) : (
          notifications.map((n) => {
            const g = (n.gravite ?? "info") as Gravite;
            return (
              <div
                key={n.id}
                className={`flex gap-3 px-4 py-4 hover:bg-gray-50 transition-colors ${!n.lu ? "bg-blue-50/30" : ""}`}
              >
                {/* Dot gravité */}
                <div className="flex-shrink-0 mt-1">
                  <span className={`block w-2.5 h-2.5 rounded-full ${GRAVITE_COLORS[g]}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${!n.lu ? "text-gray-900" : "text-gray-600"}`}>
                      {n.titre}
                    </span>
                    <GraviteBadge gravite={n.gravite ?? "info"} />
                    {!n.lu && (
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {n.lien && (
                      <Link
                        href={n.lien}
                        className="text-xs text-green-700 hover:text-green-900 flex items-center gap-1"
                        onClick={() => !n.lu && marquerLue.mutate({ id: n.id! }, { onSuccess: invalidateAll })}
                      >
                        {n.lien_libelle ?? "Voir"} <ExternalLink size={10} />
                      </Link>
                    )}
                    <span className="text-xs text-gray-400">
                      {n.created_at
                        ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })
                        : ""}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  {!n.lu && (
                    <button
                      title="Marquer comme lu"
                      onClick={() => marquerLue.mutate({ id: n.id! }, { onSuccess: invalidateAll })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-green-700 hover:bg-green-50"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button
                    title="Supprimer"
                    onClick={() => supprimer.mutate({ id: n.id! }, { onSuccess: invalidateAll })}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
