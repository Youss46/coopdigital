import { beforeEach, describe, expect, it } from "vitest";
import { getHistoryKey, loadHistory, saveToHistory } from "./GlobalSearch";

describe("historique de recherche globale", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("isole les recherches entre deux utilisateurs", () => {
    saveToHistory(11, "Pes");
    saveToHistory(22, "Sess");

    expect(loadHistory(11)).toEqual(["Pes"]);
    expect(loadHistory(22)).toEqual(["Sess"]);
    expect(loadHistory(33)).toEqual([]);
    expect(getHistoryKey(11)).not.toBe(getHistoryKey(22));
  });

  it("n'utilise pas l'ancienne clé de stockage partagée", () => {
    localStorage.setItem("coop_search_history", JSON.stringify(["Recherche d'un autre compte"]));

    expect(loadHistory(11)).toEqual([]);
  });
});