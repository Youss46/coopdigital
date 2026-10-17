import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer, X } from "lucide-react";
import {
  construireFicheAvancesDeleguesHtml,
  type RapportAvancesDelegues,
} from "@/lib/avancesDeleguesPrint";

const BASE = import.meta.env.VITE_API_URL ?? "";

function fmtFcfa(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(value)} F`;
}

export default function AvancesDeleguesRapportModal({
  membreId,
  membreNom,
  onClose,
}: {
  membreId: number | null;
  membreNom: string | null;
  onClose: () => void;
}) {
  const query = useQuery<RapportAvancesDelegues>({
    queryKey: ["rapport-avances-delegues-localites", membreId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (membreId !== null) params.set("membre_id", String(membreId));
      const queryString = params.toString();
      const suffix = queryString ? `?${queryString}` : "";
      const response = await fetch(
        `${BASE}/api/delegues-localites/avances/rapport${suffix}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("coop_token") ?? ""}`,
          },
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { erreur?: string };
        throw new Error(body.erreur ?? `Erreur ${response.status}`);
      }
      return response.json() as Promise<RapportAvancesDelegues>;
    },
    retry: false,
  });

  const titrePerimetre = membreNom ?? "Tous les délégués de localités";
  const titre = membreNom
    ? `Imprimer les avances restant dues — ${membreNom}`
    : "Imprimer les avances restant dues";
  const [erreurImpression, setErreurImpression] = useState<string | null>(null);

  function imprimer() {
    if (!query.data) return;
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
    fenetre.document.write(
      construireFicheAvancesDeleguesHtml(query.data, titrePerimetre),
    );
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
        aria-labelledby="avances-rapport-title"
        data-testid="dialog-rapport-avances-delegues"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2
              id="avances-rapport-title"
              className="font-bold text-gray-900"
              data-testid="text-titre-rapport-avances"
            >
              {titre}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Les avances en cours et en retard seront imprimées. Vous pouvez aussi enregistrer la fiche en PDF.
            </p>
          </div>
          <button
            type="button"
            data-testid="button-close-rapport-avances"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {query.isLoading && (
            <div
              data-testid="status-chargement-rapport-avances"
              className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 py-8 text-sm text-gray-500"
            >
              <Loader2 size={17} className="animate-spin" />
              Chargement des avances…
            </div>
          )}
          {query.isError && (
            <p
              role="alert"
              data-testid="status-erreur-rapport-avances"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {query.error instanceof Error
                ? query.error.message
                : "Impossible de charger les avances pour l’impression."}
            </p>
          )}
          {query.data && (
            <>
              <section
                data-testid="summary-rapport-avances"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Avances restant dues</p>
                  <p className="mt-1 text-sm font-bold text-gray-900" data-testid="text-rapport-avances-count">{query.data.nombreAvances}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">En cours</p>
                  <p className="mt-1 text-sm font-bold text-gray-900" data-testid="text-rapport-avances-en-cours">{query.data.nombreEnCours}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">En retard</p>
                  <p className="mt-1 text-sm font-bold text-gray-900" data-testid="text-rapport-avances-en-retard">{query.data.nombreEnRetard}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Total octroyé</p>
                  <p className="mt-1 text-sm font-bold text-gray-900" data-testid="text-rapport-avances-octroye">{fmtFcfa(query.data.totalMontantOctroyeFcfa)}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Total remboursé</p>
                  <p className="mt-1 text-sm font-bold text-gray-900" data-testid="text-rapport-avances-rembourse">{fmtFcfa(query.data.totalMontantRembourseFcfa)}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-[11px] text-green-800">Solde restant</p>
                  <p className="mt-1 text-sm font-bold text-green-900" data-testid="text-rapport-avances-solde">{fmtFcfa(query.data.totalSoldeRestantFcfa)}</p>
                </div>
              </section>
              {query.data.nombreAvances === 0 && (
                <p
                  data-testid="text-rapport-avances-vide"
                  className="text-center text-sm text-gray-500"
                >
                  Aucune avance restant due pour ce périmètre.
                </p>
              )}
            </>
          )}
          {erreurImpression && (
            <p role="alert" data-testid="status-erreur-impression-avances" className="text-sm text-red-700">
              {erreurImpression}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            data-testid="button-cancel-rapport-avances"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
          <button
            type="button"
            data-testid="button-print-rapport-avances"
            onClick={imprimer}
            disabled={!query.data || query.isLoading}
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
