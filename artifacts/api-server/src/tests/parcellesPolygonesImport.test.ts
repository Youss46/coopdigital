import { describe, expect, it, vi } from "vitest";
import {
  createPolygoneImportPlan,
  parsePolygonesGeoJson,
  persistPolygoneImportPlan,
  type ExistingParcelle,
} from "../services/parcellesPolygonesImport.js";

function makeGeoJson() {
  return Buffer.from(JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          code_parcelle: "LOCAL-1",
          surface_ha_polygone: 1.25,
          distance_gps_m: 5.5,
          statut_import: "a_verifier",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[-4.1, 5.1], [-4.09, 5.1], [-4.09, 5.11], [-4.1, 5.11], [-4.1, 5.1]]],
        },
      },
      {
        type: "Feature",
        properties: {
          code_parcelle: "OTHER-COOP-ONLY",
          surface_ha_polygone: 0.8,
          distance_gps_m: 2,
          statut_import: "ok",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[-4.2, 5.2], [-4.19, 5.2], [-4.19, 5.21], [-4.2, 5.21], [-4.2, 5.2]]],
        },
      },
      {
        type: "Feature",
        properties: {
          code_parcelle: "BAD-GEOMETRY",
          surface_ha_polygone: 0.4,
          distance_gps_m: 1,
          statut_import: "ok",
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[-12, 5], [-11.9, 5], [-11.9, 5.1], [-12, 5.1], [-12, 5]]],
        },
      },
    ],
  }));
}

describe("import des polygones GeoJSON", () => {
  it("produit le rapport dry-run, rattache uniquement dans la coopérative et ne déclenche aucune écriture", async () => {
    const parsed = parsePolygonesGeoJson(makeGeoJson());
    const parcelles: ExistingParcelle[] = [
      { id: 10, cooperativeId: 7, codeParcelle: "LOCAL-1" },
      { id: 20, cooperativeId: 22, codeParcelle: "OTHER-COOP-ONLY" },
    ];
    const plan = createPolygoneImportPlan(parsed, 7, parcelles);
    const updateBatch = vi.fn(async () => undefined);
    const report = await persistPolygoneImportPlan(plan, true, updateBatch);

    expect(report).toEqual({
      total: 3,
      mis_a_jour: 1,
      non_rattaches: ["OTHER-COOP-ONLY"],
      rejetes: [{
        feature: 3,
        code: "BAD-GEOMETRY",
        raison: "Les coordonnées doivent se trouver en Côte d’Ivoire (longitude -9 à -2, latitude 4 à 11).",
      }],
      a_verifier: 1,
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.parcelleId).toBe(10);
    expect(updateBatch).not.toHaveBeenCalled();
  });

  it("répartit les mises à jour par lots de 200 et conserve le même rapport lors d’une relance", async () => {
    const parsed = parsePolygonesGeoJson(makeGeoJson());
    const plan = createPolygoneImportPlan(parsed, 7, [
      { id: 10, cooperativeId: 7, codeParcelle: "LOCAL-1" },
    ]);
    const batches: number[] = [];
    const report = await persistPolygoneImportPlan(plan, false, async (batch) => {
      batches.push(batch.length);
    });
    const repeatedReport = createPolygoneImportPlan(parsed, 7, [
      { id: 10, cooperativeId: 7, codeParcelle: "LOCAL-1" },
    ]).result;

    expect(batches).toEqual([1]);
    expect(report).toEqual(repeatedReport);
  });
});
