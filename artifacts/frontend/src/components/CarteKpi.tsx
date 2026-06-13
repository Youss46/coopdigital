import { formaterFCFACourt } from "@/lib/formatters";

interface Badge {
  texte: string;
  type: "danger" | "warning" | "success";
}

interface CarteKpiProps {
  titre: string;
  valeur: string;
  montantFcfa?: number;
  icone: React.ElementType;
  couleur: string;
  sousTitre?: string;
  badge?: Badge;
}

const badgeClasses: Record<Badge["type"], string> = {
  danger:  "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  success: "bg-emerald-100 text-emerald-700",
};

export function CarteKpi({
  titre,
  valeur,
  montantFcfa,
  icone: Icone,
  couleur,
  sousTitre,
  badge,
}: CarteKpiProps) {
  const valeurMobile = montantFcfa !== undefined ? formaterFCFACourt(montantFcfa) : undefined;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 flex items-start gap-2 sm:gap-4">
      <div className="rounded-lg p-2 sm:p-2.5 flex-shrink-0" style={{ backgroundColor: couleur + "18" }}>
        <Icone size={18} style={{ color: couleur }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm text-gray-500 font-medium leading-snug">{titre}</p>
        {valeurMobile ? (
          <>
            <p className="sm:hidden text-base font-bold text-gray-900 mt-0.5 leading-tight">{valeurMobile}</p>
            <p className="hidden sm:block text-2xl font-bold text-gray-900 mt-0.5 leading-tight">{valeur}</p>
          </>
        ) : (
          <p className="text-base sm:text-2xl font-bold text-gray-900 mt-0.5 leading-tight break-words">{valeur}</p>
        )}
        {sousTitre && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sousTitre}</p>}
        {badge && (
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${badgeClasses[badge.type]}`}>
            {badge.texte}
          </span>
        )}
      </div>
    </div>
  );
}
