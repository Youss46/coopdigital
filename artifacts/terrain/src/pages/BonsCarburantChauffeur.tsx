import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { apiGet, apiPut } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Fuel, CheckCircle2, Clock, Droplets, QrCode, X, Share2, Copy, RefreshCw, AlertCircle } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";

interface BonCarburant {
  id: number;
  numero: string;
  statut: string;
  type_carburant: string;
  quantite_autorisee: number;
  quantite_livree: number | null;
  prix_litre_fcfa: number | null;
  montant_fcfa: number | null;
  station_service: string | null;
  motif: string | null;
  observations: string | null;
  date_emission: string;
  date_utilisation: string | null;
  immatriculation: string | null;
  marque: string | null;
}

interface UtiliserForm {
  quantite_livree: string;
  prix_litre_fcfa: string;
  date_utilisation: string;
  station_service: string;
  observations: string;
}

const STATUT_BON: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  brouillon: { label: "Brouillon",  color: "bg-gray-100 text-gray-600",    icon: <Clock className="h-3 w-3" /> },
  soumis:    { label: "Soumis",     color: "bg-blue-100 text-blue-800",    icon: <Clock className="h-3 w-3" /> },
  approuve:  { label: "Approuvé",   color: "bg-green-100 text-green-800",  icon: <CheckCircle2 className="h-3 w-3" /> },
  utilise:   { label: "Utilisé",    color: "bg-emerald-100 text-emerald-800", icon: <Droplets className="h-3 w-3" /> },
  annule:    { label: "Annulé",     color: "bg-red-100 text-red-800",      icon: null },
};

const TYPE_CARB: Record<string, string> = { gasoil: "Gasoil", essence: "Essence", super: "Super" };

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const FILTER_TABS = [
  { value: "approuve,soumis,brouillon", label: "En cours" },
  { value: "utilise",                   label: "Utilisés" },
  { value: "annule",                    label: "Annulés"  },
];

export default function BonsCarburantChauffeur() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [bons, setBons] = useState<BonCarburant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(FILTER_TABS[0]!.value);
  const [selected, setSelected] = useState<BonCarburant | null>(null);
  const [qrBon, setQrBon] = useState<BonCarburant | null>(null);
  const [qrToken, setQrToken] = useState<{ payload: string; sig: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<UtiliserForm>({
    quantite_livree: "", prix_litre_fcfa: "",
    date_utilisation: new Date().toISOString().split("T")[0]!,
    station_service: "", observations: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ bons: BonCarburant[] }>(`/chauffeur/bons-carburant?statut=${tab}`)
      .then(r => setBons(r.bons))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab]);

  // Récupère (ou rafraîchit) un token QR signé depuis le serveur.
  // Endpoint authentifié : seul le chauffeur propriétaire du bon peut le générer.
  // Retourne false si le bon n'est plus éligible ou en cas d'erreur.
  const fetchQrToken = useCallback(async (bon: BonCarburant): Promise<boolean> => {
    setQrLoading(true);
    setQrError(null);
    try {
      // apiGet ajoute automatiquement le token Bearer terrain et cible /api/terrain/*
      const tok = await apiGet<{ payload: string; sig: string; spki?: string }>(
        `/chauffeur/bons-carburant/${encodeURIComponent(bon.numero)}/qr-token`,
      );
      setQrToken({ payload: tok.payload, sig: tok.sig });
      if (tok.spki) {
        try { localStorage.setItem("station_qr_spki_v1", tok.spki); } catch { /* ignore */ }
      }
      return true;
    } catch (err) {
      setQrError((err as Error).message ?? "Impossible de générer le QR");
      setQrToken(null);
      return false;
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const montantEstime = form.quantite_livree && form.prix_litre_fcfa
    ? Math.round(parseFloat(form.quantite_livree) * parseFloat(form.prix_litre_fcfa))
    : null;

  async function handleUtiliser() {
    if (!selected || !form.quantite_livree || !form.date_utilisation) return;
    setSubmitting(true);
    try {
      await apiPut(`/chauffeur/bons-carburant/${selected.id}/utiliser`, {
        quantite_livree:  parseFloat(form.quantite_livree),
        date_utilisation: form.date_utilisation,
        ...(form.prix_litre_fcfa ? { prix_litre_fcfa: parseFloat(form.prix_litre_fcfa) } : {}),
        ...(form.station_service  ? { station_service: form.station_service }              : {}),
        ...(form.observations     ? { observations: form.observations }                    : {}),
      });
      toast({ title: "Utilisation enregistrée ✓" });
      setSelected(null);
      load();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-green-700 text-white px-4 py-4">
        <h1 className="text-lg font-bold flex items-center gap-2"><Fuel className="h-5 w-5" /> Bons carburant</h1>
      </header>

      {/* Tabs */}
      <div className="flex border-b bg-white sticky top-0 z-10">
        {FILTER_TABS.map(t => (
          <button
            key={t.value}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              tab === t.value ? "border-green-700 text-green-700" : "border-transparent text-gray-400"
            }`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}</div>
        ) : bons.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Fuel className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun bon dans cette catégorie</p>
          </div>
        ) : (
          bons.map(bon => {
            const s = STATUT_BON[bon.statut] ?? { label: bon.statut, color: "bg-gray-100 text-gray-600", icon: null };
            return (
              <Card key={bon.id} className={bon.statut === "approuve" ? "border-green-300 bg-green-50" : ""}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-bold text-green-700">{bon.numero}</p>
                      <p className="text-xs text-gray-500">{bon.immatriculation ?? "—"} · {TYPE_CARB[bon.type_carburant] ?? bon.type_carburant}</p>
                    </div>
                    <Badge className={`${s.color} flex items-center gap-1 text-xs`}>{s.icon}{s.label}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <div className="text-gray-400">Qté autorisée</div>
                    <div className="font-semibold">{bon.quantite_autorisee} L</div>
                    {bon.quantite_livree != null && <>
                      <div className="text-gray-400">Qté livrée</div>
                      <div className="font-semibold text-emerald-700">{bon.quantite_livree} L</div>
                    </>}
                    {bon.montant_fcfa != null && <>
                      <div className="text-gray-400">Montant</div>
                      <div className="font-semibold">{bon.montant_fcfa.toLocaleString("fr-FR")} FCFA</div>
                    </>}
                    <div className="text-gray-400">Date émission</div>
                    <div>{fmt(bon.date_emission)}</div>
                    {bon.station_service && <>
                      <div className="text-gray-400">Station</div>
                      <div className="truncate">{bon.station_service}</div>
                    </>}
                    {bon.motif && <>
                      <div className="text-gray-400">Motif</div>
                      <div className="truncate italic">{bon.motif}</div>
                    </>}
                  </div>

                  {bon.statut === "approuve" && (
                    <div className="flex gap-2 mt-1">
                      <Button className="flex-1 bg-green-700 hover:bg-green-800" size="sm"
                        onClick={() => {
                          setSelected(bon);
                          setForm({ quantite_livree: "", prix_litre_fcfa: "",
                            date_utilisation: new Date().toISOString().split("T")[0]!,
                            station_service: bon.station_service ?? "", observations: "" });
                        }}>
                        <Droplets className="h-4 w-4 mr-1" /> Utilisation
                      </Button>
                      <Button variant="outline" size="sm" className="border-green-300 text-green-700"
                        disabled={qrLoading}
                        onClick={async () => {
                          setQrBon(bon);
                          setQrToken(null);
                          await fetchQrToken(bon);
                        }}>
                        <QrCode className="h-4 w-4 mr-1" /> QR
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog utilisation */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Retour station</DialogTitle>
            {selected && (
              <p className="text-xs text-gray-500">
                Bon {selected.numero} · Autorisé : <strong>{selected.quantite_autorisee} L</strong>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Quantité livrée (L) *</Label>
              <Input type="number" min={0} step="any" placeholder="Ex: 45"
                value={form.quantite_livree}
                onChange={e => setForm(f => ({ ...f, quantite_livree: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Prix au litre (FCFA)</Label>
                <Input type="number" min={0} step="any" placeholder="Prix/L"
                  value={form.prix_litre_fcfa}
                  onChange={e => setForm(f => ({ ...f, prix_litre_fcfa: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Montant estimé</Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-gray-50 text-sm font-semibold">
                  {montantEstime != null ? `${montantEstime.toLocaleString("fr-FR")} F` : "—"}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={form.date_utilisation}
                onChange={e => setForm(f => ({ ...f, date_utilisation: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Station-service</Label>
              <Input placeholder="Nom de la station" value={form.station_service}
                onChange={e => setForm(f => ({ ...f, station_service: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Observations</Label>
              <Input placeholder="Remarques éventuelles" value={form.observations}
                onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Annuler</Button>
            <Button onClick={handleUtiliser}
              disabled={!form.quantite_livree || !form.date_utilisation || submitting}>
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog QR code plein écran */}
      {qrBon && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6"
          onClick={() => setQrBon(null)}>
          <button
            className="absolute top-4 right-4 text-white"
            onClick={() => setQrBon(null)}
          >
            <X className="h-7 w-7" />
          </button>
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <p className="font-mono text-lg font-bold text-green-700">{qrBon.numero}</p>
            <p className="text-xs text-gray-500 text-center">
              Présentez ce QR à la station-service
            </p>
            {/* QR avec payload signé si disponible, sinon URL simple */}
            {(() => {
              const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;
              const stationUrl = qrToken
                ? `${base}/station/${encodeURIComponent(qrBon.numero)}?p=${qrToken.payload}&s=${qrToken.sig}`
                : `${base}/station/${encodeURIComponent(qrBon.numero)}`;
              return (
                <>
                  <div className="p-3 bg-white rounded-xl border border-gray-100 relative">
                    {qrLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
                        <div className="h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <QRCode value={stationUrl} size={220} level="M" />
                  </div>
                  {qrError ? (
                    <div className="flex items-center gap-1.5 text-red-600 text-xs text-center">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{qrError}</span>
                    </div>
                  ) : qrToken ? (
                    <p className="text-xs text-green-600 text-center flex items-center gap-1">
                      <span>🔒</span> QR signé — lisible hors connexion
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 text-center">
                      {qrLoading ? "Génération du QR sécurisé…" : "QR simple (connexion requise à la station)"}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={qrLoading}
                    onClick={async () => { await fetchQrToken(qrBon); }}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${qrLoading ? "animate-spin" : ""}`} />
                    Rafraîchir le QR
                  </Button>
                  <p className="text-xs text-gray-400 text-center font-mono">{qrBon.numero}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate(`/station/${encodeURIComponent(qrBon.numero)}`)}>
                    Ouvrir l'espace station →
                  </Button>
                  <Button
                    size="sm"
                    className="w-full bg-green-700 hover:bg-green-800"
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: `Bon carburant ${qrBon.numero}`,
                            text: `Bon carburant ${qrBon.numero} — ${qrBon.quantite_autorisee} L`,
                            url: stationUrl,
                          });
                        } catch {
                          // user cancelled or share failed silently
                        }
                      } else {
                        try {
                          await navigator.clipboard.writeText(stationUrl);
                          toast({ title: "Lien copié dans le presse-papiers ✓" });
                        } catch {
                          toast({ title: "Impossible de copier le lien", variant: "destructive" });
                        }
                      }
                    }}>
                    {"share" in navigator
                      ? <><Share2 className="h-4 w-4 mr-1" /> Partager</>
                      : <><Copy className="h-4 w-4 mr-1" /> Copier le lien</>}
                  </Button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <BottomNavChauffeur />
    </div>
  );
}
