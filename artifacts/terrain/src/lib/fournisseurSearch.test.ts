import { describe, expect, it } from "vitest";
import { matchesFournisseurSearch } from "./fournisseurSearch";

describe("matchesFournisseurSearch", () => {
  const producer = {
    nom: "Kouassi",
    prenoms: "Awa",
    code: "MEM-001",
    telephone: null,
  };

  it("matches producer names when the phone number is missing", () => {
    expect(matchesFournisseurSearch(producer, "Kouassi")).toBe(true);
    expect(matchesFournisseurSearch(producer, "Awa")).toBe(true);
  });

  it("returns no match without throwing when optional search fields are missing", () => {
    expect(() => matchesFournisseurSearch(producer, "inconnu")).not.toThrow();
    expect(matchesFournisseurSearch(producer, "inconnu")).toBe(false);
  });
});