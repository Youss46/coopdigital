export type SacherieMovementType = "entree" | "attribution" | "retour" | "perte" | "ajustement";
export type SacherieAdjustmentDirection = "plus" | "moins";

export interface SacherieMovementLike {
  type: SacherieMovementType;
  sens: SacherieAdjustmentDirection | null;
  quantite: number;
  membreId: number | null;
}

export function calculateSacherieCentralStock(movements: SacherieMovementLike[]): number {
  return movements.reduce((total, movement) => {
    if (movement.type === "entree" || movement.type === "retour") return total + movement.quantite;
    if (movement.type === "attribution") return total - movement.quantite;
    if (movement.type === "perte") return movement.membreId === null ? total - movement.quantite : total;
    if (movement.type === "ajustement") return total + (movement.sens === "plus" ? movement.quantite : -movement.quantite);
    return total;
  }, 0);
}

export function calculateSacherieMemberBalance(movements: SacherieMovementLike[], membreId: number): number {
  return movements.reduce((total, movement) => {
    if (movement.membreId !== membreId) return total;
    if (movement.type === "attribution") return total + movement.quantite;
    if (movement.type === "retour" || movement.type === "perte") return total - movement.quantite;
    return total;
  }, 0);
}