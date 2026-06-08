import { useState } from "react";
import {
  useGetLots,
  useCreateLot,
  useGetLivraisonsNonLotees,
  useUpdateLotStatut,
  useGetLotTracabilite,
  useGetEntrepots,
  useFusionnerLots,
  useExpedierLot,
  useGetVentes,
} from "@workspace/api-client-react";
import {
  getGetLotsQueryKey,
  getGetLivraisonsNonLoteesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  QrCode,
  Package,
  Check,
  X,
  ChevronRight,
  Copy,
  Truck,
  ShoppingCart,
  Warehouse,
  Users,
  Scale,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  Merge,
  AlertOctagon,
  MapPin,
  FileJson,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function formaterPoids(kg: string | number) {
  const v = parseFloat(String(kg));
  return v >= 1000 ? `${(v / 1000).toFixed(2)} T` : `${v.toFixed(1)} kg`;
}
function formaterMontant(v: number) {
  return new Intl.NumberFormat("fr-FR").format(v) + " FCFA";
}

const STATUT_COLORS: Record<string, string> = {
  en_stock: "bg-emerald-100 text-emerald-700",
  vendu: "bg-blue-100 text-blue-700",
  transit: "bg-amber-100 text-amber-700",
  refoule: "bg-red-100 text-red-700",
  fusionne: "bg-gray-100 text-gray-500",
};
const STATUT_LABELS: Record<string, string> = {
  en_stock: "En stock",
  vendu: "Vendu",
  transit: "En transit",
  refoule: "Refoulé",
  fusionne: "Fusionné",
};
const STATUT_ORDER = ["en_stock", "transit", "vendu"];

type LotStatut = "en_stock" | "transit" | "vendu" | "refoule" | "fusionne";

function StatutTimeline({ statut }: { statut: LotStatut }) {
  if (statut === "refoule") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded-full w-fit">
        <AlertOctagon size={11} className="text-red-600" />
        <span className="text-xs font-medium text-red-700">Refoulé</span>
      </div>
    );
  }
  if (statut === "fusionne") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 border border-gray-200 rounded-full w-fit">
        <Merge size={11} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-500">Fusionné (archivé)</span>
      </div>
    );
  }
  const idx = STATUT_ORDER.indexOf(statut);
  return (
    <div className="flex items-center gap-1">
      {STATUT_ORDER.map((s, i) => {
        const done = i <= idx;
        const current = i === idx;
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                current
                  ? "bg-[#1a4731] text-white"
                  : done
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {done && !current ? (
                <CheckCircle2 size={11} />
              ) : current ? (
                <Clock size={11} />
              ) : null}
              {STATUT_LABELS[s]}
            </div>
            {i < STATUT_ORDER.length - 1 && (
              <ArrowRight size={12} className={done ? "text-emerald-400" : "text-gray-300"} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Modal Expédier ───────────────────────────────────────────── */
function ModalExpedier({
  lotId,
  onClose,
  onDone,
}: {
  lotId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: ventes = [] } = useGetVentes();
  const mutExpedier = useExpedierLot();
  const [venteId, setVenteId] = useState<string>("");
  const ventesDispos = ventes.filter((v) => !v.lotId);

  const handleExpedier = () => {
    if (!venteId) return;
    mutExpedier.mutate(
      { id: lotId, data: { venteExportateurId: parseInt(venteId) } },
      { onSuccess: onDone }
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-amber-600" />
            <h3 className="font-bold text-gray-900 text-sm">Expédier le lot</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Lier à une vente exportateur existante
            </label>
            <select
              value={venteId}
              onChange={(e) => setVenteId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="">— Sélectionner une vente —</option>
              {ventesDispos.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.exportateurNom ?? `Exp. #${v.exportateurId}`} —{" "}
                  {formaterPoids(v.poidsKg)} — {formaterDate(v.dateVente)}
                </option>
              ))}
            </select>
            {ventesDispos.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Aucune vente sans lot disponible. Créez d'abord une vente depuis la page Exportateurs.
              </p>
            )}
          </div>
          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Le lot passera en statut <strong>EN TRANSIT</strong> et sera lié à la vente sélectionnée.
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleExpedier}
            disabled={!venteId || mutExpedier.isPending}
            className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Truck size={14} />
            {mutExpedier.isPending ? "Expédition…" : "Expédier"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal Détail Lot ─────────────────────────────────────────── */
function DetailModal({
  lotId,
  onClose,
  onStatutChange,
  peutModifier,
}: {
  lotId: number;
  onClose: () => void;
  onStatutChange: (id: number, statut: LotStatut) => void;
  peutModifier: boolean;
}) {
  const { data, isLoading } = useGetLotTracabilite(lotId);
  const [copied, setCopied] = useState(false);
  const [confirmStatut, setConfirmStatut] = useState<LotStatut | null>(null);
  const [showExpedier, setShowExpedier] = useState(false);
  const queryClient = useQueryClient();

  const copyQr = () => {
    if (!data?.lot.qrCodeLot) return;
    navigator.clipboard.writeText(data.lot.qrCodeLot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!data?.lot.qrCodeLot) return;
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.lot.qrCodeLot)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `lot-qr-${data.lot.qrCodeLot.slice(0, 8)}.png`;
    a.target = "_blank";
    a.click();
  };

  const imprimerQr = () => {
    if (!data?.lot.qrCodeLot) return;
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(data.lot.qrCodeLot)}`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR Lot ${data.lot.qrCodeLot.slice(0, 8)}</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;padding:40px;font-family:sans-serif">
        <h2>Lot de cacao</h2>
        <p style="font-family:monospace;font-size:12px">${data.lot.qrCodeLot}</p>
        <img src="${url}" style="margin:20px 0" />
        <p>Poids: ${formaterPoids(data.lot.poidsTotalKg)} · Entrepôt: ${data.lot.entrepot ?? "—"}</p>
        <script>window.onload=()=>{window.print();window.close()}</script>
      </body></html>
    `);
    win.document.close();
  };

  const exporterEudr = () => {
    if (!data) return;
    const coop = (data.membres[0] as unknown as Record<string, unknown> | undefined);
    const payload = {
      lot_id: String(data.lot.id),
      qr_code: data.lot.qrCodeLot,
      poids_net_kg: parseFloat(data.lot.poidsTotalKg),
      producteurs: (data.parcelles ?? []).map((p) => ({
        nom: `${p.membreNom ?? ""} ${p.membrePrenoms ?? ""}`.trim(),
        parcelle_gps: p.coordonneesPoint ?? null,
        superficie_ha: p.superficieDeclareeHa ? parseFloat(String(p.superficieDeclareeHa)) : null,
        poids_kg: data.livraisons
          .filter((l) => l.membreId === p.membreId)
          .reduce((s, l) => s + parseFloat(String(l.poidsKg)), 0),
        eudr_statut: p.eudrStatut ?? "non_verifie",
        eudr_risque: p.eudrRisqueDeforestation ?? "inconnu",
      })),
      date_collecte: data.lot.dateCreation,
      cooperative: coop?.["cooperativeId"] ?? data.lot.cooperativeId,
      pays: "Côte d'Ivoire",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eudr-lot-${data.lot.qrCodeLot.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statut = data?.lot.statut as LotStatut | undefined;

  const prochainStatut = (s: LotStatut): LotStatut | null => {
    const idx = STATUT_ORDER.indexOf(s);
    return idx < STATUT_ORDER.length - 1 ? (STATUT_ORDER[idx + 1] as LotStatut) : null;
  };

  type ProdEntry = { nom: string; prenoms: string; poids: number; montant: number; nb: number };
  const parProducteur = data?.livraisons.reduce<Record<number, ProdEntry>>(
    (acc, l) => {
      const k = l.membreId;
      if (!acc[k]) {
        acc[k] = { nom: l.membreNom ?? "", prenoms: l.membrePrenoms ?? "", poids: 0, montant: 0, nb: 0 };
      }
      acc[k]!.poids += parseFloat(l.poidsKg);
      acc[k]!.montant += l.montantNetFcfa;
      acc[k]!.nb += 1;
      return acc;
    },
    {},
  );

  // Timeline des événements
  const buildTimeline = () => {
    if (!data) return [];
    const events: { icon: string; label: string; date: string; detail?: string }[] = [];
    events.push({ icon: "📍", label: "Création du lot", date: data.lot.dateCreation });
    if (data.lot.entrepot) {
      events.push({ icon: "📦", label: `Stockage — ${data.lot.entrepot}`, date: data.lot.dateCreation });
    }
    if (data.vente) {
      events.push({ icon: "🚚", label: `Expédition vers ${data.vente.exportateurNom ?? "exportateur"}`, date: data.vente.dateVente });
    }
    if (statut === "vendu" && data.vente) {
      events.push({ icon: "✅", label: "Livraison confirmée", date: data.vente.dateVente });
    }
    if (statut === "refoule") {
      events.push({ icon: "⛔", label: "Refus signalé", date: data.lot.createdAt, detail: "Lot refoulé par l'exportateur" });
    }
    return events;
  };

  const timeline = buildTimeline();

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-4 px-4 pb-4 overflow-y-auto">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <QrCode size={20} className="text-[#1a4731]" />
              <h2 className="font-bold text-gray-900">Détail du lot</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200">
              <X size={18} />
            </button>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-400">Chargement…</div>
          ) : !data ? (
            <div className="p-12 text-center text-gray-400">Lot introuvable</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* ── SECTION IDENTITÉ ── */}
              <div className="px-6 py-4 space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {data.lot.qrCodeLot}
                      </span>
                      <button
                        onClick={copyQr}
                        title="Copier QR code"
                        className="text-gray-400 hover:text-[#1a4731] transition-colors"
                      >
                        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={downloadQr}
                        title="Télécharger QR code (PNG)"
                        className="text-gray-400 hover:text-[#1a4731] transition-colors"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                    <StatutTimeline statut={statut ?? "en_stock"} />
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{formaterPoids(data.lot.poidsTotalKg)}</p>
                    <p className="text-xs text-gray-500">Créé le {formaterDate(data.lot.dateCreation)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                      <Warehouse size={11} /> Entrepôt
                    </p>
                    <p className="text-sm font-medium text-gray-800">{data.lot.entrepot ?? "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                      <Users size={11} /> Producteurs
                    </p>
                    <p className="text-sm font-medium text-gray-800">{data.lot.nbProducteurs ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                      <Package size={11} /> Livraisons
                    </p>
                    <p className="text-sm font-medium text-gray-800">{data.lot.nbLivraisons ?? data.livraisons.length}</p>
                  </div>
                </div>
              </div>

              {/* ── SECTION ACTIONS ── */}
              {peutModifier && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {/* Expédier — visible si EN STOCK */}
                    {statut === "en_stock" && (
                      <button
                        onClick={() => setShowExpedier(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700"
                      >
                        <Truck size={13} /> Expédier
                      </button>
                    )}

                    {/* Confirmer livraison — visible si EN TRANSIT */}
                    {statut === "transit" && !confirmStatut && (
                      <button
                        onClick={() => setConfirmStatut("vendu")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                      >
                        <CheckCircle2 size={13} /> Confirmer livraison
                      </button>
                    )}

                    {/* Signaler refus — visible si EN TRANSIT ou VENDU */}
                    {(statut === "transit" || statut === "vendu") && !confirmStatut && (
                      <button
                        onClick={() => setConfirmStatut("refoule")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
                      >
                        <AlertOctagon size={13} /> Signaler refus
                      </button>
                    )}

                    {/* Passer EN TRANSIT (si pas de vente exportateur disponible) via statut classique */}
                    {statut === "en_stock" && prochainStatut("en_stock") && !confirmStatut && (
                      <button
                        onClick={() => setConfirmStatut("transit")}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-50"
                      >
                        <Clock size={13} /> Passer en transit (sans vente)
                      </button>
                    )}

                    {/* Confirmation inline */}
                    {confirmStatut && (
                      <div className="w-full flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800 flex-1">
                          {confirmStatut === "refoule"
                            ? "Confirmer le signalement de refus ?"
                            : `Passer ce lot en ${STATUT_LABELS[confirmStatut]} ?`}
                        </p>
                        <button
                          onClick={() => {
                            onStatutChange(data.lot.id, confirmStatut);
                            setConfirmStatut(null);
                            onClose();
                          }}
                          className="px-3 py-1 bg-[#1a4731] text-white text-xs font-medium rounded-lg"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => setConfirmStatut(null)}
                          className="px-3 py-1 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg"
                        >
                          Annuler
                        </button>
                      </div>
                    )}

                    {/* Toujours visibles */}
                    <button
                      onClick={exporterEudr}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-50"
                    >
                      <FileJson size={13} /> Export EUDR
                    </button>
                    <button
                      onClick={imprimerQr}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                    >
                      <Printer size={13} /> Imprimer QR
                    </button>
                  </div>
                </div>
              )}

              {/* Actions lecture seule (EUDR + QR) */}
              {!peutModifier && (
                <div className="px-6 py-3 flex gap-2">
                  <button
                    onClick={exporterEudr}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-50"
                  >
                    <FileJson size={13} /> Export EUDR
                  </button>
                  <button
                    onClick={imprimerQr}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                  >
                    <Printer size={13} /> Imprimer QR
                  </button>
                </div>
              )}

              {/* ── SECTION CHAÎNE DE TRAÇABILITÉ ── */}
              {timeline.length > 0 && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Chaîne de traçabilité</h3>
                  <div className="relative pl-4">
                    {/* Ligne verticale */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
                    <div className="space-y-3">
                      {timeline.map((ev, i) => (
                        <div key={i} className="relative flex items-start gap-3">
                          <div className="absolute -left-4 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#1a4731] flex-shrink-0 mt-0.5" />
                          <div className="ml-2">
                            <p className="text-sm font-medium text-gray-800">
                              {ev.icon} {ev.label}
                            </p>
                            <p className="text-xs text-gray-400">{formaterDate(ev.date)}</p>
                            {ev.detail && (
                              <p className="text-xs text-red-500 mt-0.5">{ev.detail}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── SECTION VENTE LIÉE ── */}
              {data.vente && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <ShoppingCart size={14} /> Vente exportateur
                  </h3>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-blue-500 mb-0.5">Exportateur</p>
                      <p className="font-semibold text-blue-900">{data.vente.exportateurNom ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 mb-0.5">Montant</p>
                      <p className="font-semibold text-blue-900">{formaterMontant(data.vente.montantTotalFcfa)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 mb-0.5">Reçu</p>
                      <p className="font-semibold text-blue-900">{formaterMontant(data.vente.montantRecuFcfa)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 mb-0.5">Date vente</p>
                      <p className="font-semibold text-blue-900">{formaterDate(data.vente.dateVente)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SECTION COMPOSITION (Producteurs) ── */}
              {parProducteur && Object.keys(parProducteur).length > 0 && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Users size={14} /> Composition du lot ({Object.keys(parProducteur).length} producteurs)
                  </h3>
                  <div className="space-y-2">
                    {(Object.entries(parProducteur) as [string, ProdEntry][]).map(([id, p]) => (
                      <div key={id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: "#1a4731" }}
                          >
                            {p.nom[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{p.nom} {p.prenoms}</p>
                            <p className="text-xs text-gray-500">{p.nb} livraison{p.nb > 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-800">{formaterPoids(p.poids)}</p>
                          <p className="text-xs text-gray-500">{formaterMontant(p.montant)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SECTION PARCELLES GPS (EUDR) ── */}
              {(data.parcelles ?? []).length > 0 && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <MapPin size={14} /> Parcelles géolocalisées ({(data.parcelles ?? []).length})
                  </h3>
                  <div className="space-y-2">
                    {(data.parcelles ?? []).map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-emerald-50 rounded-lg text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{p.membreNom} {p.membrePrenoms}</p>
                          <p className="text-xs text-gray-500">
                            {p.coordonneesPoint
                              ? `GPS: ${(p.coordonneesPoint as { lat: number; lng: number }).lat.toFixed(5)}, ${(p.coordonneesPoint as { lat: number; lng: number }).lng.toFixed(5)}`
                              : "GPS non renseigné"}
                            {p.superficieDeclareeHa ? ` · ${parseFloat(String(p.superficieDeclareeHa)).toFixed(2)} ha` : ""}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.eudrStatut === "conforme"
                              ? "bg-green-100 text-green-700"
                              : p.eudrStatut === "non_conforme"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {p.eudrStatut ?? "non vérifié"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SECTION LIVRAISONS ── */}
              {data.livraisons.length > 0 && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Scale size={14} /> Livraisons ({data.livraisons.length})
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Membre</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Poids</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500 hidden sm:table-cell">Montant net</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500 hidden sm:table-cell">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.livraisons.map((l) => (
                          <tr key={l.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {l.membreNom} {l.membrePrenoms}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{formaterPoids(l.poidsKg)}</td>
                            <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">
                              {formaterMontant(l.montantNetFcfa)}
                            </td>
                            <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                              {formaterDate(l.dateLivraison)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sous-modal Expédier */}
      {showExpedier && data && (
        <ModalExpedier
          lotId={data.lot.id}
          onClose={() => setShowExpedier(false)}
          onDone={() => {
            setShowExpedier(false);
            queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
            onClose();
          }}
        />
      )}
    </>
  );
}

/* ── Modal Fusion ─────────────────────────────────────────────── */
function ModalFusion({
  lotsEnStock,
  onClose,
  onDone,
}: {
  lotsEnStock: Array<{ id: number; qrCodeLot: string; poidsTotalKg: string; entrepot?: string | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: entrepots = [] } = useGetEntrepots();
  const mutFusion = useFusionnerLots();
  const [selection, setSelection] = useState<number[]>([]);
  const [entrepotId, setEntrepotId] = useState<string>("");

  const toggle = (id: number) =>
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const selectionnes = lotsEnStock.filter((l) => selection.includes(l.id));
  const poidsTotal = selectionnes.reduce((s, l) => s + parseFloat(l.poidsTotalKg), 0);
  const entrepotNom = entrepots.find((e) => String(e.id) === entrepotId)?.nom ?? "";

  const handleFusion = () => {
    if (selection.length < 2 || !entrepotNom) return;
    mutFusion.mutate(
      { data: { lotIds: selection, entrepot: entrepotNom } },
      { onSuccess: onDone }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-8 px-4 pb-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <Merge size={18} className="text-[#1a4731]" />
            <h3 className="font-bold text-gray-900">Fusionner des lots</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Sélectionnez au moins 2 lots EN STOCK à fusionner. Un nouveau lot sera créé avec un QR code unique.
            Les lots sources seront archivés avec le statut FUSIONNÉ.
          </p>

          <div className="space-y-2 max-h-52 overflow-y-auto">
            {lotsEnStock.map((lot) => {
              const sel = selection.includes(lot.id);
              return (
                <div
                  key={lot.id}
                  onClick={() => toggle(lot.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sel ? "border-[#1a4731] bg-emerald-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      sel ? "border-[#1a4731] bg-[#1a4731]" : "border-gray-300"
                    }`}
                  >
                    {sel && <Check size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{formaterPoids(lot.poidsTotalKg)}</p>
                    <p className="text-xs text-gray-400 font-mono">{lot.qrCodeLot.slice(0, 8)}…</p>
                  </div>
                  <p className="text-xs text-gray-500">{lot.entrepot ?? "—"}</p>
                </div>
              );
            })}
          </div>

          {selection.length >= 2 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-emerald-800">
                {selection.length} lots sélectionnés — Poids total : {formaterPoids(poidsTotal)}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Entrepôt du lot fusionné <span className="text-red-400">*</span>
            </label>
            <select
              value={entrepotId}
              onChange={(e) => setEntrepotId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
            >
              <option value="">— Sélectionner un entrepôt —</option>
              {entrepots.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.nom}{e.ville ? ` — ${e.ville}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleFusion}
            disabled={selection.length < 2 || !entrepotNom || mutFusion.isPending}
            className="flex-1 px-4 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#1a4731" }}
          >
            <Merge size={14} />
            {mutFusion.isPending ? "Fusion…" : `Fusionner ${selection.length} lots`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────── */
export default function TracabilitePage() {
  const queryClient = useQueryClient();
  const { utilisateur } = useAuth();
  const peutCreerLot = usePermission("tracabilite", "creer_lot");
  const peutModifier = usePermission("tracabilite", "modifier_lot");

  const [onglet, setOnglet] = useState<"lots" | "creer">("lots");
  const [filtreStatut, setFiltreStatut] = useState<LotStatut | "">("");
  const [selection, setSelection] = useState<number[]>([]);
  const [entrepotId, setEntrepotId] = useState<string>("");
  const [lotDetail, setLotDetail] = useState<number | null>(null);
  const [showFusion, setShowFusion] = useState(false);

  const { data: lots = [], isLoading } = useGetLots({
    statut: (filtreStatut as LotStatut) || undefined,
  });
  const { data: livraisonsDispos = [] } = useGetLivraisonsNonLotees();
  const { data: entrepots = [] } = useGetEntrepots();

  const mutCreate = useCreateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLivraisonsNonLoteesQueryKey() });
        setOnglet("lots");
        setSelection([]);
        setEntrepotId("");
      },
    },
  });

  const mutStatut = useUpdateLotStatut({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() }),
    },
  });

  const toggleSelection = (id: number) =>
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toutSelectionner = () => {
    if (selection.length === livraisonsDispos.length) {
      setSelection([]);
    } else {
      setSelection(livraisonsDispos.map((l) => l.id));
    }
  };

  const poidsSelectionne = livraisonsDispos
    .filter((l) => selection.includes(l.id))
    .reduce((s, l) => s + parseFloat(l.poidsKg), 0);

  const entrepotNom = entrepots.find((e) => String(e.id) === entrepotId)?.nom ?? null;

  const handleCreerLot = () => {
    if (selection.length === 0 || !utilisateur?.cooperativeId) return;
    mutCreate.mutate({
      data: {
        cooperativeId: utilisateur.cooperativeId,
        livraisonIds: selection,
        entrepot: entrepotNom ?? undefined,
      },
    });
  };

  const handleStatutChange = (id: number, statut: LotStatut) => {
    mutStatut.mutate({ id, data: { statut } });
  };

  const lotsEnStock = lots.filter((l) => l.statut === "en_stock");

  const statsLots = {
    en_stock: lots.filter((l) => l.statut === "en_stock").length,
    transit: lots.filter((l) => l.statut === "transit").length,
    vendu: lots.filter((l) => l.statut === "vendu").length,
    refoule: lots.filter((l) => l.statut === "refoule").length,
    poidsTotal: lots.reduce((s, l) => s + parseFloat(l.poidsTotalKg ?? "0"), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Traçabilité QR</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion des lots de cacao et traçabilité</p>
        </div>
        {peutModifier && lotsEnStock.length >= 2 && (
          <button
            onClick={() => setShowFusion(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:border-[#1a4731] hover:text-[#1a4731] transition-colors"
          >
            <Merge size={15} /> Fusionner des lots
          </button>
        )}
      </div>

      {/* Stats */}
      {lots.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "En stock", value: statsLots.en_stock, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "En transit", value: statsLots.transit, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "Vendus", value: statsLots.vendu, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Refoulés", value: statsLots.refoule, color: "text-red-700", bg: "bg-red-50" },
            { label: "Poids total", value: formaterPoids(statsLots.poidsTotal), color: "text-gray-700", bg: "bg-gray-50" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl px-4 py-3`}>
              <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["lots", "creer"] as const)
          .filter((o) => o === "lots" || peutCreerLot)
          .map((o) => (
            <button
              key={o}
              onClick={() => setOnglet(o)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                onglet === o
                  ? "border-[#1a4731] text-[#1a4731]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {o === "lots" ? `Lots (${lots.length})` : "Créer un lot"}
            </button>
          ))}
      </div>

      {/* Onglet Lots */}
      {onglet === "lots" && (
        <div className="space-y-4">
          {/* Filtres statut */}
          <div className="flex gap-2 flex-wrap">
            {(["", "en_stock", "transit", "vendu", "refoule", "fusionne"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFiltreStatut(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filtreStatut === s
                    ? "border-[#1a4731] bg-[#1a4731] text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {s === "" ? "Tous" : STATUT_LABELS[s]}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-16" />
              ))}
            </div>
          ) : lots.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <QrCode size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Aucun lot créé</p>
              <p className="text-gray-400 text-sm mt-1">
                Commencez par créer un lot depuis l'onglet "Créer un lot"
              </p>
              {peutCreerLot && (
                <button
                  onClick={() => setOnglet("creer")}
                  className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  Créer un lot
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">QR Code</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Poids</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">
                        Producteurs
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">
                        Entrepôt
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">
                        Date
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Statut</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot) => (
                      <tr
                        key={lot.id}
                        onClick={() => setLotDetail(lot.id)}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <QrCode size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-xs text-gray-600">
                              {lot.qrCodeLot.slice(0, 8)}…
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {formaterPoids(lot.poidsTotalKg)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                          {lot.nbProducteurs ?? 0} producteur{(lot.nbProducteurs ?? 0) > 1 ? "s" : ""}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          {lot.entrepot ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          {formaterDate(lot.dateCreation)}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUT_COLORS[lot.statut] ?? ""
                            }`}
                          >
                            {STATUT_LABELS[lot.statut]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight size={14} className="text-gray-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet Créer un lot */}
      {onglet === "creer" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Paramètres du lot</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Entrepôt de stockage (optionnel)
              </label>
              <select
                value={entrepotId}
                onChange={(e) => setEntrepotId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
              >
                <option value="">— Sélectionner un entrepôt —</option>
                {entrepots.map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.nom}
                    {e.ville ? ` — ${e.ville}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-gray-900">
                Livraisons disponibles ({livraisonsDispos.length})
              </h3>
              <div className="flex items-center gap-3">
                {selection.length > 0 && (
                  <span className="text-xs font-medium text-[#1a4731]">
                    {selection.length} sélectionnée{selection.length > 1 ? "s" : ""} —{" "}
                    {formaterPoids(poidsSelectionne)}
                  </span>
                )}
                {livraisonsDispos.length > 0 && (
                  <button
                    onClick={toutSelectionner}
                    className="text-xs font-medium text-gray-500 hover:text-[#1a4731] border border-gray-200 px-3 py-1 rounded-lg hover:border-[#1a4731] transition-colors"
                  >
                    {selection.length === livraisonsDispos.length ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                )}
              </div>
            </div>

            {livraisonsDispos.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Toutes les livraisons sont déjà dans un lot
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="w-10 px-4 py-3"></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Membre</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Poids</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">
                        Montant net
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {livraisonsDispos.map((l) => {
                      const sel = selection.includes(l.id);
                      return (
                        <tr
                          key={l.id}
                          onClick={() => toggleSelection(l.id)}
                          className={`border-b border-gray-50 cursor-pointer transition-colors ${
                            sel ? "bg-green-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                sel ? "border-[#1a4731] bg-[#1a4731]" : "border-gray-300"
                              }`}
                            >
                              {sel && <Check size={10} className="text-white" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {l.membreNom} {l.membrePrenoms}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{formaterPoids(l.poidsKg)}</td>
                          <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                            {l.montantNetFcfa != null
                              ? formaterMontant(l.montantNetFcfa)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                            {formaterDate(l.dateLivraison)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selection.length > 0 && (
            <div className="bg-[#1a4731] rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="text-white">
                <p className="text-sm font-semibold">
                  {selection.length} livraison{selection.length > 1 ? "s" : ""} sélectionnée
                  {selection.length > 1 ? "s" : ""}
                </p>
                <p className="text-green-200 text-xs">
                  Poids total : {formaterPoids(poidsSelectionne)}
                  {entrepotNom ? ` · Entrepôt : ${entrepotNom}` : ""}
                </p>
              </div>
              <button
                onClick={handleCreerLot}
                disabled={mutCreate.isPending || !utilisateur?.cooperativeId}
                className="px-5 py-2 bg-white text-[#1a4731] text-sm font-bold rounded-lg hover:bg-green-50 disabled:opacity-50 flex items-center gap-2"
              >
                <QrCode size={14} />
                {mutCreate.isPending ? "Création…" : "Créer le lot"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal détail */}
      {lotDetail !== null && (
        <DetailModal
          lotId={lotDetail}
          onClose={() => setLotDetail(null)}
          onStatutChange={handleStatutChange}
          peutModifier={peutModifier}
        />
      )}

      {/* Modal fusion */}
      {showFusion && (
        <ModalFusion
          lotsEnStock={lotsEnStock}
          onClose={() => setShowFusion(false)}
          onDone={() => {
            setShowFusion(false);
            queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
          }}
        />
      )}
    </div>
  );
}
