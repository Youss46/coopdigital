import { describe, expect, it } from "vitest";
import { parseParcellesGeoJson } from "../services/parcellesGeoJsonImport.js";

function feature(code: string | null, coordinates: number[][], property = "nom") {
  return {
    type: "Feature",
    properties: code === null ? {} : { [property]: code },
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

function asBuffer(features: unknown[]): Buffer {
  return Buffer.from(JSON.stringify({ type: "FeatureCollection", features }));
}

const square = [
  [-4, 5],
  [-3.999, 5],
  [-3.999, 5.001],
  [-4, 5.001],
  [-4, 5],
];

describe("parseParcellesGeoJson", () => {
  it("uses the nom field by default and converts GeoJSON longitude/latitude to latitude/longitude", () => {
    const parsed = parseParcellesGeoJson(asBuffer([feature(" P-001 ", square)]));

    expect(parsed.selectedField).toBe("nom");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]).toMatchObject({
      code: "P-001",
      polygon: [
        [5, -4],
        [5, -3.999],
        [5.001, -3.999],
        [5.001, -4],
      ],
      issue: null,
    });
  });

  it("collapses duplicate features only when their geometries are identical", () => {
    const identical = parseParcellesGeoJson(asBuffer([
      feature("P-001", square),
      feature("P-001", square),
    ]));
    expect(identical.groups[0]).toMatchObject({
      featureCount: 2,
      identicalDuplicates: 1,
      issue: null,
    });
    expect(identical.identicalDuplicates).toBe(1);

    const conflicting = parseParcellesGeoJson(asBuffer([
      feature("P-001", square),
      feature("P-001", [[-4, 5], [-3.998, 5], [-3.998, 5.001], [-4, 5.001], [-4, 5]]),
    ]));
    expect(conflicting.groups[0]).toMatchObject({
      featureCount: 2,
      issue: "duplicate_in_file",
      polygon: null,
    });
  });

  it("reports missing codes and unsupported geometries instead of dropping them", () => {
    const parsed = parseParcellesGeoJson(asBuffer([
      feature(null, square),
      {
        type: "Feature",
        properties: { nom: "P-002" },
        geometry: { type: "MultiPolygon", coordinates: [] },
      },
    ]));

    expect(parsed.missingCodeFeatureIndexes).toEqual([1]);
    expect(parsed.groups[0]).toMatchObject({
      code: "P-002",
      issue: "invalid_geometry",
    });
  });

  it("accepts an explicitly selected scalar code field", () => {
    const parsed = parseParcellesGeoJson(
      asBuffer([feature("COOP-001", square, "identifiant")]),
      "identifiant",
    );

    expect(parsed.codeFields).toContain("identifiant");
    expect(parsed.selectedField).toBe("identifiant");
    expect(parsed.groups[0]?.code).toBe("COOP-001");
  });

  it("does not merge parcel codes that differ by case or internal whitespace", () => {
    const parsed = parseParcellesGeoJson(asBuffer([
      feature("P 001", square),
      feature("P  001", square),
      feature("p 001", square),
    ]));

    expect(parsed.groups).toHaveLength(3);
    expect(parsed.groups.map((group) => group.normalizedCode)).toEqual(["P 001", "P  001", "p 001"]);
  });

  it("rejects malformed feature collections and absent code fields", () => {
    expect(() => parseParcellesGeoJson(Buffer.from("{}"))).toThrow("FeatureCollection");
    expect(() => parseParcellesGeoJson(asBuffer([feature("P-001", square)]), "absent"))
      .toThrow("Choisissez un champ GeoJSON");
  });
});
