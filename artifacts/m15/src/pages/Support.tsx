import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  fetchTickets, fetchTicketDetail, prendreEnCharge, marquerResolu, repondre,
  TicketM15, TicketDetailM15,
  PRIORITE_COLORS, STATUT_COLORS, STATUT_LABELS, PRIORITE_LABELS,
} from "@/lib/support";
import {
  LifeBuoy, RefreshCw, Inbox, Send,
  CheckCircle, PlayCircle, Filter, X,
  ChevronLeft, MessageCircle, Calendar,
  Building2, User,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function PrioriteBadge({ p }: { p: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${PRIORITE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>
      {PRIORITE_LABELS[p] ?? p}
    </span>
  );
}

function StatutBadge({ s }: { s: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[s] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUT_LABELS[s] ?? s}
    </span>
  );
}

// ─── Panneau détail ticket ────────────────────────────────────────────────────

function TicketDetail({
  ticketId,
  onClose,
  onUpdated,
}: { ticketId: number; onClose: () => void; onUpdated: () => void }) {
  const [ticket, setTicket] = useState<TicketDetailM15 | null>(null);
  const [loading, setLoading] = useState(true);
  const [reponse, setReponse] = useState("");
  const [sending, setSending] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const t = await fetchTicketDetail(ticketId);
      setTicket(t);
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [ticketId]);

  async function handlePrendre() {
    setAction("prendre");
    try {
      await prendreEnCharge(ticketId);
      await load();
      onUpdated();
    } catch {
      /* ignore */
    } finally {
      setAction(null);
    }
  }

  async function handleResolu() {
    setAction("resoudre");
    try {
      await marquerResolu(ticketId);
      await load();
      onUpdated();
    } catch {
      /* ignore */
    } finally {
      setAction(null);
    }
  }

  async function handleRepondre(e: React.FormEvent) {
    e.preventDefault();
    if (!reponse.trim()) return;
    setSending(true);
    try {
      await repondre(ticketId, reponse);
      setReponse("");
      await load();
      onUpdated();
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Chargement…
      </div>
    );
  }

  if (!ticket) return <div className="text-center text-gray-400 py-16">Ticket introuvable</div>;

  const canPrendre  = ticket.statut === "ouvert";
  const canResoudre = ticket.statut === "en_cours" || ticket.statut === "ouvert";
  const canRepondre = ticket.statut !== "ferme" && ticket.statut !== "resolu";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b bg-gray-50">
        <button onClick={onClose} className="mt-1 text-gray-400 hover:text-gray-700">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs text-gray-400">{ticket.reference}</span>
            <PrioriteBadge p={ticket.priorite} />
            <StatutBadge s={ticket.statut} />
          </div>
          <p className="font-semibold text-gray-900 text-sm leading-snug">{ticket.titre}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><Building2 size={12} />{ticket.cooperative_nom}</span>
            <span className="flex items-center gap-1"><User size={12} />{ticket.ouvert_par_nom ?? "—"}</span>
            <span className="flex items-center gap-1"><Calendar size={12} />{fmt(ticket.created_at)}</span>
          </div>
          {ticket.module_concerne && (
            <p className="text-xs text-blue-600 mt-1">Module : {ticket.module_concerne}</p>
          )}
          {ticket.assigne_m15 && (
            <p className="text-xs text-purple-600 mt-0.5">Agent : {ticket.assigne_m15}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      {(canPrendre || canResoudre) && (
        <div className="flex gap-2 px-4 py-2 border-b bg-white">
          {canPrendre && (
            <button
              onClick={handlePrendre}
              disabled={action === "prendre"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-medium disabled:opacity-60"
            >
              <PlayCircle size={14} />
              {action === "prendre" ? "…" : "Prendre en charge"}
            </button>
          )}
          {canResoudre && (
            <button
              onClick={handleResolu}
              disabled={action === "resoudre"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-60"
            >
              <CheckCircle size={14} />
              {action === "resoudre" ? "…" : "Marquer résolu"}
            </button>
          )}
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {ticket.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.auteur_type === "m15tech" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
              msg.auteur_type === "m15tech"
                ? "bg-green-600 text-white rounded-br-sm"
                : "bg-white border text-gray-800 rounded-bl-sm shadow-sm"
            }`}>
              <p className={`text-xs font-semibold mb-1 ${msg.auteur_type === "m15tech" ? "text-green-100" : "text-gray-500"}`}>
                {msg.auteur_nom}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.contenu}</p>
              <p className={`text-xs mt-1 ${msg.auteur_type === "m15tech" ? "text-green-200" : "text-gray-400"}`}>
                {fmt(msg.created_at)}
              </p>
            </div>
          </div>
        ))}
        {ticket.messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm">Aucun message</p>
        )}
      </div>

      {/* Zone de réponse */}
      {canRepondre && (
        <form onSubmit={handleRepondre} className="border-t p-3 flex gap-2 bg-white">
          <textarea
            value={reponse}
            onChange={(e) => setReponse(e.target.value)}
            placeholder="Votre réponse…"
            rows={2}
            className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={sending || !reponse.trim()}
            className="self-end px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </form>
      )}
      {!canRepondre && (
        <div className="border-t p-3 text-center text-xs text-gray-400 bg-gray-50">
          Ticket {ticket.statut} — plus de réponses possibles
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Support() {
  const [tickets, setTickets] = useState<TicketM15[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatut, setFilterStatut] = useState<string>("");
  const [filterPriorite, setFilterPriorite] = useState<string>("");
  const [showFilter, setShowFilter] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchTickets({
        statut:   filterStatut   || undefined,
        priorite: filterPriorite || undefined,
      });
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filterStatut, filterPriorite]);

  const nonLusTotal = tickets.reduce((acc, t) => acc + (t.nb_non_lus ?? 0), 0);

  if (selectedId !== null) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow border overflow-hidden h-[calc(100vh-120px)]">
          <TicketDetail
            ticketId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={() => void load()}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <LifeBuoy size={20} className="text-green-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Support clients</h1>
              <p className="text-sm text-gray-500">Tickets des coopératives</p>
            </div>
            {nonLusTotal > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {nonLusTotal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                showFilter || filterStatut || filterPriorite
                  ? "border-green-500 text-green-700 bg-green-50"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <Filter size={14} />
              Filtres
              {(filterStatut || filterPriorite) && <span className="ml-1 bg-green-600 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">!</span>}
            </button>
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:border-gray-300"
            >
              <RefreshCw size={14} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Filtres */}
        {showFilter && (
          <div className="bg-white border rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Statut</label>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Tous</option>
                <option value="ouvert">Ouvert</option>
                <option value="en_cours">En cours</option>
                <option value="resolu">Résolu</option>
                <option value="ferme">Fermé</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Priorité</label>
              <select value={filterPriorite} onChange={(e) => setFilterPriorite(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Toutes</option>
                <option value="urgente">Urgente 🚨</option>
                <option value="haute">Haute</option>
                <option value="normale">Normale</option>
                <option value="basse">Basse</option>
              </select>
            </div>
            <button onClick={() => { setFilterStatut(""); setFilterPriorite(""); }}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 pb-0.5">
              <X size={14} /> Réinitialiser
            </button>
          </div>
        )}

        {/* KPIs rapides */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Ouverts",   count: tickets.filter((t) => t.statut === "ouvert").length,   color: "text-blue-600 bg-blue-50" },
            { label: "En cours",  count: tickets.filter((t) => t.statut === "en_cours").length, color: "text-yellow-700 bg-yellow-50" },
            { label: "Urgents",   count: tickets.filter((t) => t.priorite === "urgente").length, color: "text-red-600 bg-red-50" },
            { label: "Non lus",   count: nonLusTotal,                                            color: "text-purple-700 bg-purple-50" },
          ].map(({ label, count, color }) => (
            <div key={label} className="bg-white border rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${color} inline-flex items-center justify-center w-10 h-10 rounded-full mx-auto mb-1`}>
                {count}
              </p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Liste des tickets */}
        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Chargement…
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Inbox size={40} className="mb-3 opacity-30" />
              <p className="font-medium">Aucun ticket</p>
              <p className="text-sm mt-1">Tous les tickets ont été traités 🎉</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Référence</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Titre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Coopérative</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Priorité</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Messages</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="hover:bg-green-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.reference}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">{t.titre}</span>
                        {t.nb_non_lus > 0 && (
                          <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                            {t.nb_non_lus}
                          </span>
                        )}
                      </div>
                      {t.module_concerne && (
                        <span className="text-xs text-gray-400">{t.module_concerne}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700 truncate block max-w-[140px]">{t.cooperative_nom}</span>
                    </td>
                    <td className="px-4 py-3"><PrioriteBadge p={t.priorite} /></td>
                    <td className="px-4 py-3"><StatutBadge s={t.statut} /></td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-500">
                        <MessageCircle size={12} />
                        {t.nb_messages}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
