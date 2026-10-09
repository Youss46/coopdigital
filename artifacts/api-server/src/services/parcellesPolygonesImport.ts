export type GeoJsonPosition = [number, number];

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: GeoJsonPosition[][];
}

export interface ParsedPolygonFeature {
  feature: number;
  code: string | null;
  polygon: GeoJsonPolygon | null;
  surfacePolygoneHa: number | null;
  distanceGpsM: number | null;
  statutPolygone: string | null;
  error: string | null;
}

export interface ParsedPolygonFile {
  total: number;
  features: ParsedPolygonFeature[];
}

export interface ExistingParcelle {
  id: number;
  cooperativeId: number;
  codeParcelle: string | null;
}

export interface ParcellePolygonUpdate {
  parcelleId: number;
  geometrie: GeoJsonPolygon;
  surfacePolygoneHa: number;
  distanceGpsM: number | null;
  statutPolygone: string;
}

export interface PolygoneImportRejet {
  feature: number;
  code: string | null;
  raison: string;
}

export interface PolygoneImportResult {
  total: number;
  mis_a_jour: number;
  non_rattaches: string[];
  rejetes: PolygoneImportRejet[];
  a_verifier: number;
}

export interface PolygoneImportPlan {
  cooperativeId: number;
  updates: ParcellePolygonUpdate[];
  result: PolygoneImportResult;
}

export const POLYGONE_IMPORT_BATCH_SIZE = 200;

const MAX_FEATURES = 20_000;
const MAX_CODE_LENGTH = 200;
const MAX_STATUS_LENGTH = 40;
const CI_BOUNDS = { minLongitude: -9, maxLongitude: -2, minLatitude: 4, maxLatitude: 11 };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function cleanCode(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const code = String(value).trim();
  return code.length > 0 && code.length <= MAX_CODE_LENGTH ? code : null;
}

function parseOptionalNonNegativeNumber(value: unknown): { value: number | null; valid: boolean } {
  if (value === undefined || value === null || value === "") return { value: null, valid: true };
  if (typeof value !== "number" && typeof value !== "string") return { value: null, valid: false };
  const parsed = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? { value: parsed, valid: true }
    : { value: null, valid: false };
}

function ringAreaHa(ring: GeoJsonPosition[]): number {
  const earthRadiusMeters = 6_378_137;
  const radians = Math.PI / 180;
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [longitude1, latitude1] = ring[index]!;
    const [longitude2, latitude2] = ring[index + 1]!;
    sum += (longitude2 - longitude1) * radians
      * (2 + Math.sin(latitude1 * radians) + Math.sin(latitude2 * radians));
  }
  return Math.abs(sum * earthRadiusMeters * earthRadiusMeters / 2) / 10_000;
}

function polygonAreaHa(rings: GeoJsonPosition[][]): number {
  const exterior = ringAreaHa(rings[0] ?? []);
  const holes = rings.slice(1).reduce((total, ring) => total + ringAreaHa(ring), 0);
  return Math.max(0, exterior - holes);
}

function parsePolygon(value: unknown): { polygon: GeoJsonPolygon } | { error: string } {
  const geometry = asRecord(value);
  if (!geometry || geometry["type"] !== "Polygon") {
    return { error: "La géométrie doit être de type Polygon." };
  }
  const rawRings = geometry["coordinates"];
  if (!Array.isArray(rawRings) || rawRings.length === 0) {
    return { error: "Le polygone ne contient aucun anneau." };
  }

  const coordinates: GeoJsonPosition[][] = [];
  for (let ringIndex = 0; ringIndex < rawRings.length; ringIndex += 1) {
    const rawRing = rawRings[ringIndex];
    if (!Array.isArray(rawRing) || rawRing.length < 4) {
      return { error: `L’anneau ${ringIndex + 1} doit contenir au moins trois sommets et être fermé.` };
    }

    const ring: GeoJsonPosition[] = [];
    for (const position of rawRing) {
      if (
        !Array.isArray(position)
        || position.length < 2
        || typeof position[0] !== "number"
        || typeof position[1] !== "number"
        || !Number.isFinite(position[0])
        || !Number.isFinite(position[1])
      ) {
        return { error: `L’anneau ${ringIndex + 1} contient une coordonnée invalide.` };
      }

      const [longitude, latitude] = position;
      if (
        longitude < CI_BOUNDS.minLongitude
        || longitude > CI_BOUNDS.maxLongitude
        || latitude < CI_BOUNDS.minLatitude
        || latitude > CI_BOUNDS.maxLatitude
      ) {
        return { error: "Les coordonnées doivent se trouver en Côte d’Ivoire (longitude -9 à -2, latitude 4 à 11)." };
      }
      ring.push([longitude, latitude]);
    }

    const first = ring[0]!;
    const last = ring.at(-1)!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return { error: `L’anneau ${ringIndex + 1} n’est pas fermé.` };
    }
    const distinctVertices = new Set(ring.slice(0, -1).map(([longitude, latitude]) => `${longitude},${latitude}`));
    if (distinctVertices.size < 3) {
      return { error: `L’anneau ${ringIndex + 1} doit contenir au moins trois sommets distincts.` };
    }
    coordinates.push(ring);
  }

  return { polygon: { type: "Polygon", coordinates } };
}

export function parsePolygonesGeoJson(buffer: Buffer): ParsedPolygonFile {
  let document: unknown;
  try {
    document = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new Error("Le fichier GeoJSON n’est pas un JSON valide.");
  }

  const root = asRecord(document);
  if (root?.["type"] !== "FeatureCollection" || !Array.isArray(root["features"])) {
    throw new Error("Le fichier doit contenir une FeatureCollection GeoJSON.");
  }
  if (root["features"].length === 0) throw new Error("La FeatureCollection ne contient aucun polygone.");
  if (root["features"].length > MAX_FEATURES) {
    throw new Error(`La FeatureCollection dépasse la limite de ${MAX_FEATURES} polygones.`);
  }

  const features: ParsedPolygonFeature[] = root["features"].map((featureValue, index) => {
    const feature = asRecord(featureValue);
    const properties = asRecord(feature?.["properties"]);
    const code = cleanCode(properties?.["code_parcelle"]);
    const reject = (error: string): ParsedPolygonFeature => ({
      feature: index + 1,
      code,
      polygon: null,
      surfacePolygoneHa: null,
      distanceGpsM: null,
      statutPolygone: null,
      error,
    });

    if (!feature || feature["type"] !== "Feature") return reject("L’objet GeoJSON n’est pas une Feature valide.");
    if (!code) return reject("Le champ properties.code_parcelle est absent ou invalide.");

    const parsedPolygon = parsePolygon(feature["geometry"]);
    if ("error" in parsedPolygon) return reject(parsedPolygon.error);

    const statusValue = properties?.["statut_import"];
    if (typeof statusValue !== "string" || statusValue.trim().length === 0 || statusValue.trim().length > MAX_STATUS_LENGTH) {
      return reject("Le champ properties.statut_import est absent ou invalide.");
    }
    const distance = parseOptionalNonNegativeNumber(properties?.["distance_gps_m"]);
    if (!distance.valid) return reject("Le champ properties.distance_gps_m doit être un nombre positif ou nul.");
    const surface = parseOptionalNonNegativeNumber(properties?.["surface_ha_polygone"]);
    if (!surface.valid) return reject("Le champ properties.surface_ha_polygone doit être un nombre positif ou nul.");

    return {
      feature: index + 1,
      code,
      polygon: parsedPolygon.polygon,
      surfacePolygoneHa: surface.value ?? polygonAreaHa(parsedPolygon.polygon.coordinates),
      distanceGpsM: distance.value,
      statutPolygone: statusValue.trim(),
      error: null,
    };
  });

  return { total: features.length, features };
}

export function createPolygoneImportPlan(
  parsed: ParsedPolygonFile,
  cooperativeId: number,
  existingParcelles: ExistingParcelle[],
): PolygoneImportPlan {
  const validFeatures = parsed.features.filter((feature) => feature.error === null && feature.code !== null);
  const fileCodeCounts = new Map<string, number>();
  for (const feature of validFeatures) {
    fileCodeCounts.set(feature.code!, (fileCodeCounts.get(feature.code!) ?? 0) + 1);
  }

  const parcelsByCode = new Map<string, ExistingParcelle[]>();
  for (const parcel of existingParcelles) {
    if (parcel.cooperativeId !== cooperativeId || !parcel.codeParcelle) continue;
    const code = parcel.codeParcelle.trim();
    parcelsByCode.set(code, [...(parcelsByCode.get(code) ?? []), parcel]);
  }

  const updates: ParcellePolygonUpdate[] = [];
  const nonRattaches = new Set<string>();
  const rejetes: PolygoneImportRejet[] = [];
  for (const feature of parsed.features) {
    if (feature.error || !feature.code || !feature.polygon || feature.surfacePolygoneHa === null) {
      rejetes.push({
        feature: feature.feature,
        code: feature.code,
        raison: feature.error ?? "La feature GeoJSON est invalide.",
      });
      continue;
    }
    if ((fileCodeCounts.get(feature.code) ?? 0) > 1) {
      rejetes.push({
        feature: feature.feature,
        code: feature.code,
        raison: "Le code de parcelle apparaît plusieurs fois dans le fichier.",
      });
      continue;
    }

    const matches = parcelsByCode.get(feature.code) ?? [];
    if (matches.length === 0) {
      nonRattaches.add(feature.code);
      continue;
    }
    if (matches.length > 1) {
      rejetes.push({
        feature: feature.feature,
        code: feature.code,
        raison: "Plusieurs parcelles de la coopérative correspondent à ce code.",
      });
      continue;
    }

    updates.push({
      parcelleId: matches[0]!.id,
      geometrie: feature.polygon,
      surfacePolygoneHa: feature.surfacePolygoneHa,
      distanceGpsM: feature.distanceGpsM,
      statutPolygone: feature.statutPolygone!,
    });
  }

  const result: PolygoneImportResult = {
    total: parsed.total,
    mis_a_jour: updates.length,
    non_rattaches: [...nonRattaches],
    rejetes: rejetes.sort((a, b) => a.feature - b.feature),
    a_verifier: updates.filter((update) => update.statutPolygone.toLowerCase() === "a_verifier").length,
  };
  return { cooperativeId, updates, result };
}

export async function persistPolygoneImportPlan(
  plan: PolygoneImportPlan,
  dryRun: boolean,
  updateBatch: (batch: ParcellePolygonUpdate[]) => Promise<void>,
): Promise<PolygoneImportResult> {
  if (!dryRun) {
    for (let offset = 0; offset < plan.updates.length; offset += POLYGONE_IMPORT_BATCH_SIZE) {
      await updateBatch(plan.updates.slice(offset, offset + POLYGONE_IMPORT_BATCH_SIZE));
    }
  }
  return plan.result;
}
