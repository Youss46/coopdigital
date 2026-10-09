import { describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({
  db: mockDb,
  parcellesTable: {
    id: {},
    cooperativeId: {},
    polygone: {},
    geometrie: {},
    eudrStatut: {},
    eudrDansZoneProtegee: {},
    eudrRisqueDeforestation: {},
    eudrDateVerification: {},
    eudrCommentaire: {},
    updatedAt: {},
  },
  zonesRisqueEudrTable: { cooperativeId: {} },
  membresTable: {},
  campagnesTable: {},
  historiqueRendementsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

const { polygoneLatLngPourVerification, verifierEUDR } = await import("../services/parcelleService.js");

describe("polygoneLatLngPourVerification", () => {
  it("convertit la géométrie GeoJSON importée en coordonnées lat/lng pour le contrôle EUDR", () => {
    const geojson = {
      type: "Polygon" as const,
      coordinates: [[
        [-5.2, 6.4],
        [-5.1, 6.4],
        [-5.1, 6.5],
        [-5.2, 6.5],
        [-5.2, 6.4],
      ] as [number, number][]],
    };

    expect(polygoneLatLngPourVerification(null, geojson)).toEqual([
      [6.4, -5.2],
      [6.4, -5.1],
      [6.5, -5.1],
      [6.5, -5.2],
    ]);
  });

  it("conserve les polygones historiques déjà stockés en lat/lng", () => {
    const ancienPolygone: [number, number][] = [
      [6.4, -5.2],
      [6.4, -5.1],
      [6.5, -5.1],
    ];

    expect(polygoneLatLngPourVerification(ancienPolygone, null)).toBe(ancienPolygone);
  });

  it("retourne null quand aucun contour exploitable n’est disponible", () => {
    expect(polygoneLatLngPourVerification(null, null)).toBeNull();
  });

  it("exécute le contrôle EUDR avec le contour GeoJSON importé quand l’ancien champ est vide", async () => {
    const parcelle = {
      id: 12,
      cooperativeId: 4,
      polygone: null,
      geometrie: {
        type: "Polygon" as const,
        coordinates: [[
          [-5.2, 6.4],
          [-5.1, 6.4],
          [-5.1, 6.5],
          [-5.2, 6.5],
          [-5.2, 6.4],
        ] as [number, number][]],
      },
    };
    const zone = {
      polygoneZone: [
        [6.3, -5.3],
        [6.3, -5.0],
        [6.6, -5.0],
        [6.6, -5.3],
      ],
      nomZone: "Zone protégée de test",
    };

    const parcelLimit = vi.fn().mockResolvedValue([parcelle]);
    const parcelWhere = vi.fn().mockReturnValue({ limit: parcelLimit });
    const parcelFrom = vi.fn().mockReturnValue({ where: parcelWhere });
    const zonesWhere = vi.fn().mockResolvedValue([zone]);
    const zonesFrom = vi.fn().mockReturnValue({ where: zonesWhere });
    mockDb.select
      .mockReset()
      .mockReturnValueOnce({ from: parcelFrom })
      .mockReturnValueOnce({ from: zonesFrom });

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReset().mockReturnValue({ set: updateSet });

    await verifierEUDR(parcelle.id);

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      eudrStatut: "non_conforme",
      eudrDansZoneProtegee: true,
      eudrCommentaire: expect.stringContaining("Zone protégée de test"),
    }));
  });
});
