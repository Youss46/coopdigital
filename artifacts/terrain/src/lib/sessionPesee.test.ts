import { describe, expect, it } from "vitest";
import {
  getFournisseurForSession,
  isIncompleteMemberDelegateSession,
  tareFromNombreSacs,
} from "./sessionPesee";

describe("calcul de la tare à partir des sacs", () => {
  it("utilise un kilogramme par sac", () => {
    expect(tareFromNombreSacs("2")).toBe("2");
    expect(tareFromNombreSacs("12")).toBe("12");
  });

  it("revient à zéro pour une saisie vide ou invalide", () => {
    expect(tareFromNombreSacs("")).toBe("0");
    expect(tareFromNombreSacs("abc")).toBe("0");
  });
});

describe("reprise d'une session de pesée membre délégué", () => {
  it("efface le membre précédent et bloque une session de bon mal liée", () => {
    const sessionValide = {
      membreId: 8,
      numeroSession: "PSE-2026-00001",
      membreNom: "Kouassi",
      membrePrenoms: "Awa",
      operation: "reception_membre_delegue",
    } as const;
    const sessionInvalide = {
      membreId: null,
      numeroSession: "PSE-2026-00002",
      membreNom: null,
      membrePrenoms: null,
      operation: "reception_membre_delegue",
    } as const;

    let fournisseurAffiche = getFournisseurForSession(sessionValide);
    expect(fournisseurAffiche?.id).toBe(8);
    expect(isIncompleteMemberDelegateSession(sessionValide)).toBe(false);

    fournisseurAffiche = getFournisseurForSession(sessionInvalide);
    expect(fournisseurAffiche).toBeNull();
    expect(isIncompleteMemberDelegateSession(sessionInvalide)).toBe(true);
  });
});