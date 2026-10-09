import { describe, expect, it, vi } from "vitest";

const { mockDb, parcelleFields, membreFields, mockSql, mockGetConfig } = vi.hoisted(() => {
  const field = (name: string) => ({ name });
  return {
    mockDb: { select: vi.fn() },
    parcelleFields: {
      cooperativeId: field("cooperative_id"),
      actif: field("actif"),
      eudrStatut: field("eudr_statut"),
      section: field("section"),
      village: field("village"),
      polygone: field("polygone"),
      geometrie: field("geometrie"),
      coordonneesPoint: field("coordonnees_point"),
      eudrDateVerification: field("eudr_date_verification"),
      codeParcelle: field("code_parcelle"),
      superficieCalculeeHa: field("superficie_calculee_ha"),
      superficieDeclareeHa: field("superficie_declaree_ha"),
      membreId: field("membre_id"),
    },
    membreFields: {
      id: field("id"),
      nom: field("nom"),
      prenoms: field("prenoms"),
    },
    mockSql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    mockGetConfig: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  parcellesTable: parcelleFields,
  membresTable: membreFields,
  historiqueRendementsTable: {},
  zonesRisqueEudrTable: {},
  campagnesTable: {},
  missionsMembresTable: {},
  missionsTerrainTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  sql: mockSql,
}));

vi.mock("../services/parcelleService", () => ({
  calculerSuperficie: vi.fn(),
  genererCodeParcelle: vi.fn(),
  verifierEUDR: vi.fn(),
  exportGeoJSON: vi.fn(),
  calculerConformiteGlobale: vi.fn(),
  polygoneLatLngPourVerification: vi.fn(),
}));

vi.mock("../services/configService", () => ({
  getConfig: mockGetConfig,
}));

vi.mock("../services/portailService", () => ({
  computeCodeMembre: vi.fn(),
}));

const { exportEudrData } = await import("../controllers/parcellesController.js");

describe("exportEudrData", () => {
  it("considère les géométries GeoJSON importées comme un contour présent", async () => {
    const rows = [{
      membreNom: "Kone",
      membrePrenoms: "Awa",
      section: null,
      village: null,
      eudrStatut: "non_verifie",
      superficieCalculeeHa: null,
      superficieDeclareeHa: "2.5",
      hasPolygone: true,
      hasPoint: false,
      eudrDateVerification: null,
      codeParcelle: "P-001",
    }];
    const query = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    mockDb.select.mockReset().mockReturnValue(query);
    mockSql.mockClear();
    mockGetConfig.mockResolvedValue({ nomComplet: "Coopérative test" });

    const response = { json: vi.fn() };
    const request = {
      query: {},
      user: { cooperativeId: 7 },
      log: { error: vi.fn() },
    };

    await exportEudrData(request as never, response as never);

    const selectedFields = mockDb.select.mock.calls[0]?.[0] as {
      hasPolygone: { strings: TemplateStringsArray; values: unknown[] };
    };
    expect(selectedFields.hasPolygone.strings.join("")).toContain("IS NOT NULL OR ");
    expect(selectedFields.hasPolygone.values).toEqual([
      parcelleFields.polygone,
      parcelleFields.geometrie,
    ]);
    expect(response.json).toHaveBeenCalledWith({
      parcelles: rows,
      nomCooperative: "Coopérative test",
    });
  });
});
