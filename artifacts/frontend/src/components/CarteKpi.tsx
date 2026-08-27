import { useCountUp } from "@/hooks/use-count-up";

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
  onClick?: () => void;
  actionLabel?: string;
  compactValue?: boolean;
}

const badgeClasses: Record<Badge["type"], string> = {
  danger:  "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  success: "bg-emerald-100 text-emerald-700",
};

export function CarteKpi({
  titre,
  valeur,
  icone: Icone,
  couleur,
  sousTitre,
  badge,
  onClick,
  actionLabel,
  compactValue = false,
}: CarteKpiProps) {
  const valeurAnimee = useCountUp(valeur);

  return (
    <div
      className={`bg-white rounded-xl border p-3 sm:p-5 flex items-start gap-2 sm:gap-4 transition-all duration-200 hover:shadow-md ${onClick ? "cursor-pointer border-blue-200 hover:border-blue-400 hover:shadow-blue-100/70 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2" : "border-gray-200"}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="rounded-lg p-2 sm:p-2.5 flex-shrink-0" style={{ backgroundColor: couleur + "18" }}>
        <Icone size={18} style={{ color: couleur }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm text-gray-500 font-medium leading-snug">{titre}</p>
        <p className={`${compactValue ? "text-sm sm:text-lg" : "text-sm sm:text-2xl"} font-bold text-gray-900 mt-0.5 leading-tight break-words tabular-nums`}>{valeurAnimee}</p>
        {sousTitre && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sousTitre}</p>}
        {badge && (
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${badgeClasses[badge.type]}`}>
            {badge.texte}
          </span>
        )}
        {onClick && actionLabel && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-blue-600">
            {actionLabel} <span aria-hidden="true">→</span>
          </span>
        )}
      </div>
    </div>
  );
}
