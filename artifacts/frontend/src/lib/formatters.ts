export function formaterFCFA(montant: number): string {
  return new Intl.NumberFormat("fr-FR").format(montant) + " FCFA";
}

export function formaterFCFACourt(montant: number): string {
  if (montant >= 1_000_000) return `${(montant / 1_000_000).toFixed(1).replace(/\.0$/, "")} M FCFA`;
  if (montant >= 1_000)     return `${Math.round(montant / 1_000)} k FCFA`;
  return `${montant} FCFA`;
}

export function formaterDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
