import { describe, expect, it } from "vitest";
import {
  getFournisseurForSession,
  isIncompleteMemberDelegateSession,
} from "./sessionPesee";

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