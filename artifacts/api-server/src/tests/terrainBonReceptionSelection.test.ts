import { describe, expect, it } from "vitest";
import { getBonReceptionTerrainState } from "../services/terrainService.js";

describe("sélection du bon de réception depuis Terrain", () => {
  const bons = [
    { id: 204, membreDelegueId: 12 },
    { id: 205, membreDelegueId: 12 },
    { id: 206, membreDelegueId: 19 },
  ];

  it("ne rattache aucun bon quand plusieurs bons sont encore en attente", () => {
    expect(getBonReceptionTerrainState(bons, 12)).toEqual({
      bonReceptionId: null,
      bonReceptionEnAttenteCount: 2,
    });
  });

  it("pré-rattache le seul bon en attente", () => {
    expect(getBonReceptionTerrainState(bons, 19)).toEqual({
      bonReceptionId: 206,
      bonReceptionEnAttenteCount: 1,
    });
  });
});