import { useState } from "react";
import { CalendarDays, Loader2, Printer, X } from "lucide-react";

type TypeRapportCarburant = "attente" | "effectues";

function dateLocale(date: Date): string {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function debutDuMois(date: Date): string {
  return `${dateLocale(date).slice(0, 7)}-01`;
}

export default function CarburantReglementsRapportModal({
  type,
  loading,
  onClose,
  onGenerate,
}: {
  type: TypeRapportCarburant;
  loading: boolean;
  onClose: () => void;
  onGenerate: (dateDebut: string, dateFin: string) => Promise<boolean>;
}) {
  const [dateFin, setDateFin] = useState(() => dateLocale(new Date()));
  const [dateDebut, setDateDebut] = useState(() => debutDuMois(new Date()));
  const periodeValide = !!dateDebut && !!dateFin && dateDebut <= dateFin;
  const titre = type === "attente"
    ? "Imprimer le carburant en attente"
    : "Imprimer le carburant réglé";
  const explication = type === "attente"
    ? "La période porte sur la date d’utilisation des bons."
    : "La période porte sur la date effective du règlement.";

  async function generer() {
    if (!periodeValide || loading) return;
    if (await onGenerate(dateDebut, dateFin)) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rapport-carburant-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
              <CalendarDays size={18} />
            </span>
            <div>
              <h2 id="rapport-carburant-title" className="font-bold text-gray-900">{titre}</h2>
              <p className="mt-1 text-xs text-gray-500">{explication} Choisissez une période puis ouvrez la fiche PDF.</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="button-close-rapport-carburant"
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
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
                data-testid="input-rapport-carburant-date-debut"
                value={dateDebut}
                max={dateFin || undefined}
                onChange={(event) => setDateDebut(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-600/30"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Au
              <input
                type="date"
                data-testid="input-rapport-carburant-date-fin"
                value={dateFin}
                min={dateDebut || undefined}
                onChange={(event) => setDateFin(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-600/30"
              />
            </label>
          </div>
          {!periodeValide && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Choisissez une période valide.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            data-testid={`button-print-rapport-carburant-${type}`}
            onClick={() => void generer()}
            disabled={!periodeValide || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1a4731] px-4 py-2 text-sm font-semibold text-white hover:bg-[#143a28] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            Imprimer / PDF
          </button>
        </footer>
      </section>
    </div>
  );
}
