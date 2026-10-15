import { useState } from "react";
import { CalendarDays, Loader2, Printer, X } from "lucide-react";
import {
  getGetPaiementsRapportEnAttenteQueryKey,
  useGetPaiementsRapportEnAttente,
} from "@workspace/api-client-react";
import { construireFicheReglementsEnAttenteHtml } from "@/lib/reglementsPrint";

function dateLocale(date: Date): string {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function debutDuMois(date: Date): string {
  return `${dateLocale(date).slice(0, 7)}-01`;
}

function fmtFcfa(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
}

export default function ReglementsImpayesModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [dateFin, setDateFin] = useState(() => dateLocale(new Date()));
  const [dateDebut, setDateDebut] = useState(() => debutDuMois(new Date()));
  const [erreurImpression, setErreurImpression] = useState<string | null>(null);
  const periodeValide = !!dateDebut && !!dateFin && dateDebut <= dateFin;
  const params = { date_debut: dateDebut, date_fin: dateFin };
  const { data, error, isError, isLoading } = useGetPaiementsRapportEnAttente(params, {
    query: {
      queryKey: getGetPaiementsRapportEnAttenteQueryKey(params),
      enabled: periodeValide,
      retry: false,
    },
  });

  function imprimer() {
    if (!data) return;
    setErreurImpression(null);
    const fenetre = window.open("", "_blank");
    if (!fenetre) {
      setErreurImpression("Autorisez les fenêtres pop-up pour imprimer cette fiche.");
      return;
    }

    let impressionLancee = false;
    const lancerImpression = () => {
      if (impressionLancee || fenetre.closed) return;
      impressionLancee = true;
      fenetre.focus();
      fenetre.print();
    };
    fenetre.addEventListener("load", lancerImpression, { once: true });
    fenetre.document.open();
    fenetre.document.write(construireFicheReglementsEnAttenteHtml(data));
    fenetre.document.close();
    window.setTimeout(lancerImpression, 700);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reglements-impayes-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-800">
              <CalendarDays size={18} />
            </span>
            <div>
              <h2 id="reglements-impayes-title" className="font-bold text-gray-900">
                Imprimer les règlements en attente
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                La période porte sur la date de livraison. Vous pourrez imprimer ou enregistrer la fiche en PDF.
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="button-close-reglements-impayes"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-600">
              Du
              <input
                type="date"
                data-testid="input-rapport-date-debut"
                value={dateDebut}
                max={dateFin || undefined}
                onChange={(event) => setDateDebut(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600/30"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Au
              <input
                type="date"
                data-testid="input-rapport-date-fin"
                value={dateFin}
                min={dateDebut || undefined}
                onChange={(event) => setDateFin(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600/30"
              />
            </label>
          </div>

          {!periodeValide && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Choisissez une période valide.
            </p>
          )}
          {isLoading && periodeValide && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 py-8 text-sm text-gray-500">
              <Loader2 size={17} className="animate-spin" />
              Chargement des règlements…
            </div>
          )}
          {isError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error instanceof Error ? error.message : "Impossible de charger les règlements en attente."}
            </p>
          )}
          {data && (
            <section
              data-testid="summary-rapport-reglements-impayes"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-[11px] text-gray-500">Livraisons</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{data.nombreLivraisons}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-[11px] text-gray-500">Montant net</p>
                <p className="mt-1 text-xs font-bold text-gray-900">{fmtFcfa(data.totalMontantNetFcfa)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-[11px] text-gray-500">Déjà réglé</p>
                <p className="mt-1 text-xs font-bold text-gray-900">{fmtFcfa(data.totalMontantRegleFcfa)}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-[11px] text-green-800">Total restant</p>
                <p className="mt-1 text-xs font-bold text-green-900">{fmtFcfa(data.totalMontantRestantFcfa)}</p>
              </div>
            </section>
          )}
          {data?.nombreLivraisons === 0 && (
            <p className="text-center text-sm text-gray-500">
              Aucun règlement en attente pour cette période.
            </p>
          )}
          {erreurImpression && (
            <p role="alert" className="text-sm text-red-700">{erreurImpression}</p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            data-testid="button-cancel-reglements-impayes"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
          <button
            type="button"
            data-testid="button-print-reglements-impayes"
            onClick={imprimer}
            disabled={!data || isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1a4731] px-4 py-2 text-sm font-semibold text-white hover:bg-[#143a28] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={15} />
            Imprimer / PDF
          </button>
        </footer>
      </section>
    </div>
  );
}
