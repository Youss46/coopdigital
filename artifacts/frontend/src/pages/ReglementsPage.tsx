import { useState, useEffect } from "react";
import {
  CheckCircle2, Clock, Loader2, CreditCard, Search, CheckCheck, AlertCircle,
} from "lucide-react";
import {
  useListPaiements,
  useValiderPaiement,
  ListPaiementsStatut,
  type PaiementListItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPaiementsQueryKey } from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

function modeLbl(m: string) {
  if (m === "orange_money") return "Orange Money";
  if (m === "mtn_momo") return "MTN MoMo";
  return "Espèces";
}

const BADGE: Record<string, string> = {
  en_attente: "bg-amber-100 text-amber-700",
  confirme:   "bg-green-100 text-green-700",
  echec:      "bg-red-100 text-red-700",
};
const BADGE_LBL: Record<string, string> = {
  en_attente: "En attente",
  confirme:   "Confirmé",
  echec:      "Échec",
};

export default function ReglementsPage() {
  const peutValider = usePermission("paiements", "valider");
  const [filtreStatut, setFiltreStatut] = useState<string>("en_attente");
  const [recherche, setRecherche] = useState("");
  const [modal, setModal] = useState<{ paiement: PaiementListItem; ref: string } | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const params = { statut: (filtreStatut as ListPaiementsStatut) || undefined, limit: 100 };
  const { data: paiements, isLoading } = useListPaiements(params, {
    query: { queryKey: getListPaiementsQueryKey(params) },
  });

  const validerMut = useValiderPaiement();

  // Auto-ouvrir le modal si ?paiementId=X est passé dans l'URL (depuis "Payer maintenant")
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paiementId = urlParams.get("paiementId");
    if (!paiementId || !paiements) return;
    const found = paiements.find((p) => p.id === parseInt(paiementId));
    if (found && !modal) {
      setModal({ paiement: found, ref: "" });
      // Nettoyer l'URL sans recharger la page
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [paiements]);

  const filtres = (paiements ?? []).filter((p) => {
    if (!recherche) return true;
    const r = recherche.toLowerCase();
    return (
      (p.membreNom ?? "").toLowerCase().includes(r) ||
      (p.membrePrenoms ?? "").toLowerCase().includes(r) ||
      (p.telephone ?? "").includes(r)
    );
  });

  const totalEnAttente = (paiements ?? []).filter((p) => p.statut === "en_attente")
    .reduce((s, p) => s + p.montantFcfa, 0);

  async function handleValider() {
    if (!modal) return;
    try {
      await validerMut.mutateAsync({
        id: modal.paiement.id,
        data: { referenceTransaction: modal.ref || null },
      });
      await qc.invalidateQueries({ queryKey: getListPaiementsQueryKey({ statut: "en_attente" as ListPaiementsStatut }) });
      await qc.invalidateQueries({ queryKey: getListPaiementsQueryKey({ statut: "confirme" as ListPaiementsStatut }) });
      setModal(null);
      toast({ title: "Paiement confirmé" });
    } catch {
      toast({ title: "Erreur", description: "Impossible de valider le paiement", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Règlements</h1>
          <p className="text-gray-500 text-sm mt-0.5">Validation des paiements producteurs</p>
        </div>
        {totalEnAttente > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-right">
            <p className="text-xs text-amber-600 font-medium">En attente de validation</p>
            <p className="text-lg font-bold text-amber-700">{fmt(totalEnAttente)}</p>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Rechercher par nom ou téléphone…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1"
          />
        </div>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="en_attente">En attente</option>
          <option value="confirme">Confirmés</option>
          <option value="echec">Échec</option>
          <option value="">Tous</option>
        </select>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" size={28} />
        </div>
      ) : filtres.length === 0 ? (
        <div className="text-center py-16">
          <CheckCheck size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Aucun paiement {filtreStatut === "en_attente" ? "en attente" : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtres.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {p.membreNom} {p.membrePrenoms}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[p.statut] ?? ""}`}>
                    {BADGE_LBL[p.statut]}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500">{p.telephone}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">{modeLbl(p.modePaiement)}</span>
                  {p.dateLivraison && (
                    <>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">Livr. {p.dateLivraison}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right flex items-center gap-3 shrink-0">
                <span className="font-bold text-gray-900 text-sm">{fmt(p.montantFcfa)}</span>
                {p.statut === "en_attente" && peutValider && (
                  <button
                    onClick={() => setModal({ paiement: p, ref: "" })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ backgroundColor: "#1a4731" }}
                  >
                    <CheckCircle2 size={13} />
                    Valider
                  </button>
                )}
                {p.statut === "confirme" && (
                  <CheckCircle2 size={18} className="text-green-500" />
                )}
                {p.statut === "echec" && (
                  <AlertCircle size={18} className="text-red-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal validation */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#e8f5ee" }}>
                <CreditCard size={18} style={{ color: "#1a4731" }} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Confirmer le paiement</h3>
                <p className="text-xs text-gray-500">{modal.paiement.membreNom} {modal.paiement.membrePrenoms}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm text-gray-600">Montant</span>
              <span className="text-xl font-bold" style={{ color: "#1a4731" }}>{fmt(modal.paiement.montantFcfa)}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Référence transaction (optionnel)
              </label>
              <input
                type="text"
                value={modal.ref}
                onChange={(e) => setModal({ ...modal, ref: e.target.value })}
                placeholder="Ex: OM-2025-00123"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleValider}
                disabled={validerMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: "#1a4731" }}
              >
                {validerMut.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
