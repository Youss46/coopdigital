import { describe, expect, it } from "vitest";
import {
  getBonReceptionTerrainDetails,
  getBonReceptionTerrainState,
} from "../services/terrainService.js";

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

  it("conserve les informations de choix pour plusieurs bons", () => {
    expect(getBonReceptionTerrainDetails([
      {
        id: 204,
        membreDelegueId: 12,
        poidsDeclaraKg: 245,
        nombreSacsDeclares: 5,
        typeTransport: "externe",
        createdAt: "2026-09-10T08:00:00.000Z",
      },
      {
        id: 205,
        membreDelegueId: 12,
        poidsDeclaraKg: null,
        nombreSacsDeclares: 8,
        typeTransport: "cooperatif",
        createdAt: "2026-09-11T08:00:00.000Z",
      },
    ], 12)).toEqual({
      bonReceptionId: null,
      bonReceptionEnAttenteCount: 2,
      bonsReception: [
        {
          id: 204,
          poidsDeclaraKg: 245,
          nombreSacsDeclares: 5,
          typeTransport: "externe",
          createdAt: "2026-09-10T08:00:00.000Z",
        },
        {
          id: 205,
          poidsDeclaraKg: null,
          nombreSacsDeclares: 8,
          typeTransport: "cooperatif",
          createdAt: "2026-09-11T08:00:00.000Z",
        },
      ],
    });
  });
});