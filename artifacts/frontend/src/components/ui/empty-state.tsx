import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icone: LucideIcon;
  titre: string;
  description?: string;
  colSpan?: number;
  action?: React.ReactNode;
}

export function EmptyState({ icone: Icone, titre, description, colSpan, action }: EmptyStateProps) {
  const contenu = (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full p-4 mb-3" style={{ backgroundColor: "#1a473112" }}>
        <Icone size={32} style={{ color: "#1a4731" }} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-gray-700">{titre}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );

  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan}>{contenu}</td>
      </tr>
    );
  }

  return contenu;
}
