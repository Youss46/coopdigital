export interface FournisseurSearchFields {
  nom?: string | null;
  prenoms?: string | null;
  code?: string | null;
  telephone?: string | null;
}

export function matchesFournisseurSearch(
  fournisseur: FournisseurSearchFields,
  search: string,
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return [fournisseur.nom, fournisseur.prenoms, fournisseur.code, fournisseur.telephone]
    .some((value) => typeof value === "string" && value.toLowerCase().includes(query));
}