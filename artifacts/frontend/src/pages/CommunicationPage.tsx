import { useState } from "react";
import {
  useGetCommunicationHistorique,
  useSendSmsGroupe,
  useGetMembres,
} from "@workspace/api-client-react";
import { getGetCommunicationHistoriqueQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Users, CheckCircle, XCircle, Clock } from "lucide-react";

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MAX_SMS = 160;

export default function CommunicationPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [groupement, setGroupement] = useState("");
  const [resultat, setResultat] = useState<{ envoyes: number; echecs: number; total: number } | null>(null);

  const { data: historique = [], isLoading } = useGetCommunicationHistorique();
  const { data: membresData } = useGetMembres({ limit: 500 });

  // Extraire les groupements uniques
  const groupements = [
    ...new Set(
      (membresData?.membres ?? [])
        .map((m) => m.groupement)
        .filter((g): g is string => !!g)
    ),
  ].sort();

  const nbDestinataires = groupement
    ? (membresData?.membres ?? []).filter((m) => m.statut === "actif" && m.groupement === groupement).length
    : (membresData?.membres ?? []).filter((m) => m.statut === "actif").length;

  const mutSms = useSendSmsGroupe({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetCommunicationHistoriqueQueryKey() });
        setResultat(data);
        setMessage("");
        setGroupement("");
      },
    },
  });

  const handleEnvoyer = () => {
    if (!message.trim()) return;
    mutSms.mutate({ data: { message, groupement: groupement || undefined } });
  };

  const STATUT_ICONS = {
    envoye: <CheckCircle size={14} className="text-green-600" />,
    echec: <XCircle size={14} className="text-red-500" />,
    partiel: <Clock size={14} className="text-yellow-500" />,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communication</h1>
        <p className="text-gray-500 text-sm mt-1">Envoi de SMS groupés aux membres de la coopérative</p>
      </div>

      {/* Résultat d'envoi */}
      {resultat && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${resultat.echecs === 0 ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
          {resultat.echecs === 0 ? (
            <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Clock size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {resultat.envoyes} SMS envoyé{resultat.envoyes > 1 ? "s" : ""} avec succès
              {resultat.echecs > 0 && ` (${resultat.echecs} échec${resultat.echecs > 1 ? "s" : ""})`}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {resultat.total} destinataires ciblés
            </p>
          </div>
          <button onClick={() => setResultat(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulaire d'envoi */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Send size={16} />
            SMS groupé
          </h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Groupement ciblé</label>
            <select
              value={groupement}
              onChange={(e) => setGroupement(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
            >
              <option value="">Tous les membres actifs</option>
              {groupements.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Users size={11} />
              {nbDestinataires} destinataire{nbDestinataires !== 1 ? "s" : ""} ciblé{nbDestinataires !== 1 ? "s" : ""}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Message</label>
              <span className={`text-xs ${message.length > MAX_SMS ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                {message.length}/{MAX_SMS}
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_SMS))}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 resize-none"
              placeholder="Saisissez votre message SMS ici…&#10;ex. Chers membres, la pesée reprend lundi 9h à l'entrepôt principal. Merci."
            />
          </div>

          {/* Aperçu */}
          {message.trim() && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1 font-medium">Aperçu</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
            </div>
          )}

          <button
            onClick={handleEnvoyer}
            disabled={!message.trim() || nbDestinataires === 0 || mutSms.isPending}
            className="w-full py-3 text-white rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#1a4731" }}
          >
            <Send size={15} />
            {mutSms.isPending
              ? "Envoi en cours…"
              : `Envoyer à ${nbDestinataires} membre${nbDestinataires !== 1 ? "s" : ""}`}
          </button>
        </div>

        {/* Historique */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Historique des envois</h2>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : historique.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm">Aucun envoi effectué</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {historique.map((h) => (
                <div key={h.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-sm text-gray-800 line-clamp-2 flex-1">
                      {h.message}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {STATUT_ICONS[h.statut]}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Users size={10} />
                      {h.nbEnvoyes}/{h.nbDestinataires}
                      {h.groupement && ` • ${h.groupement}`}
                    </span>
                    <span>{formaterDate(h.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
