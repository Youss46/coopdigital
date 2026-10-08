export type PolygonPoint = [number, number];
export type GeoJsonImportIssue = "invalid_geometry" | "duplicate_in_file";

export interface ParsedPolygonGroup {
  code: string;
  normalizedCode: string;
  featureIndex: number;
  featureCount: number;
  polygon: PolygonPoint[] | null;
  issue: GeoJsonImportIssue | null;
  detail: string | null;
  identicalDuplicates: number;
}

export interface ParsedGeoJsonImport {
  codeFields: string[];
  selectedField: string;
  totalFeatures: number;
  groups: ParsedPolygonGroup[];
  missingCodeFeatureIndexes: number[];
  identicalDuplicates: number;
}

const MAX_FEATURES = 15_000;
const MAX_COORDINATES = 1_000_000;
const MAX_RING_COORDINATES = 100_000;
const MAX_CODE_LENGTH = 200;

interface FeatureCandidate {
  featureIndex: number;
  code: string;
  polygon: PolygonPoint[] | null;
  fingerprint: string | null;
  detail: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanScalar(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}

export function normalizeParcelCode(value: string): string {
  return value.trim();
}

function discoverCodeFields(features: unknown[]): string[] {
  const fields = new Set<string>();
  for (const feature of features) {
    const properties = asRecord(asRecord(feature)?.["properties"]);
    if (!properties) continue;
    for (const [key, value] of Object.entries(properties)) {
      if (cleanScalar(value)) fields.add(key);
    }
  }
  return [...fields].sort((a, b) => a.localeCompare(b));
}

function parsePolygonGeometry(
  geometryValue: unknown,
  coordinateBudget: { used: number },
): { polygon: PolygonPoint[]; fingerprint: string } | { error: string } {
  const geometry = asRecord(geometryValue);
  if (!geometry) return { error: "Géométrie absente ou invalide." };
  if (geometry["type"] !== "Polygon") {
    return { error: "Seuls les polygones simples (type Polygon) sont pris en charge." };
  }

  const rings = geometry["coordinates"];
  if (!Array.isArray(rings) || rings.length === 0 || !Array.isArray(rings[0])) {
    return { error: "Anneau de coordonnées manquant." };
  }
  if (rings.length !== 1) {
    return { error: "Les polygones avec des trous ne sont pas pris en charge." };
  }

  const ring = rings[0];
  if (ring.length > MAX_RING_COORDINATES) {
    return { error: "Le contour dépasse la limite de coordonnées autorisée." };
  }
  coordinateBudget.used += ring.length;
  if (coordinateBudget.used > MAX_COORDINATES) {
    return { error: "Le fichier dépasse la limite totale de coordonnées autorisée." };
  }

  const points: PolygonPoint[] = [];
  for (const position of ring) {
    if (
      !Array.isArray(position)
      || position.length < 2
      || typeof position[0] !== "number"
      || typeof position[1] !== "number"
      || !Number.isFinite(position[0])
      || !Number.isFinite(position[1])
    ) {
      return { error: "Le contour contient une coordonnée non numérique." };
    }

    const [longitude, latitude] = position;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return { error: "Le contour contient une coordonnée GPS hors limites." };
    }
    points.push([latitude, longitude]);
  }

  if (
    points.length > 3
    && points[0]![0] === points.at(-1)![0]
    && points[0]![1] === points.at(-1)![1]
  ) {
    points.pop();
  }

  const distinctPoints = new Set(points.map(([latitude, longitude]) => `${latitude},${longitude}`));
  if (points.length < 3 || distinctPoints.size < 3) {
    return { error: "Le contour doit contenir au moins trois points distincts." };
  }

  return { polygon: points, fingerprint: JSON.stringify(points) };
}

export function parseParcellesGeoJson(
  buffer: Buffer,
  requestedField?: string,
): ParsedGeoJsonImport {
  let document: unknown;
  try {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    document = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Le fichier n’est pas un GeoJSON ou un JSON valide.");
  }

  const root = asRecord(document);
  if (root?.["type"] !== "FeatureCollection" || !Array.isArray(root["features"])) {
    throw new Error("Le fichier doit contenir une FeatureCollection GeoJSON.");
  }

  const features = root["features"];
  if (features.length === 0) throw new Error("Le fichier ne contient aucun polygone.");
  if (features.length > MAX_FEATURES) {
    throw new Error(`Le fichier dépasse la limite de ${MAX_FEATURES} objets.`);
  }

  const codeFields = discoverCodeFields(features);
  const selectedField = requestedField?.trim()
    || (codeFields.includes("nom") ? "nom" : codeFields[0]);
  if (!selectedField || !codeFields.includes(selectedField)) {
    throw new Error("Choisissez un champ GeoJSON contenant le code de la parcelle.");
  }

  const groups = new Map<string, FeatureCandidate[]>();
  const missingCodeFeatureIndexes: number[] = [];
  const coordinateBudget = { used: 0 };

  features.forEach((featureValue, index) => {
    const feature = asRecord(featureValue);
    const properties = asRecord(feature?.["properties"]);
    const code = cleanScalar(properties?.[selectedField]);
    if (!code) {
      missingCodeFeatureIndexes.push(index + 1);
      return;
    }
    if (code.length > MAX_CODE_LENGTH) {
      const key = normalizeParcelCode(code);
      const candidate: FeatureCandidate = {
        featureIndex: index + 1,
        code,
        polygon: null,
        fingerprint: null,
        detail: `Le code dépasse ${MAX_CODE_LENGTH} caractères.`,
      };
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
      return;
    }

    const parsedGeometry = feature?.["type"] === "Feature"
      ? parsePolygonGeometry(feature["geometry"], coordinateBudget)
      : { error: "L’objet GeoJSON n’est pas une Feature valide." };
    const candidate: FeatureCandidate = "error" in parsedGeometry
      ? {
          featureIndex: index + 1,
          code,
          polygon: null,
          fingerprint: null,
          detail: parsedGeometry.error,
        }
      : {
          featureIndex: index + 1,
          code,
          polygon: parsedGeometry.polygon,
          fingerprint: parsedGeometry.fingerprint,
          detail: null,
        };
    const key = normalizeParcelCode(code);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  });

  let identicalDuplicates = 0;
  const parsedGroups: ParsedPolygonGroup[] = [];
  for (const [normalizedCode, candidates] of groups) {
    const invalid = candidates.find((candidate) => candidate.detail !== null);
    if (invalid) {
      parsedGroups.push({
        code: candidates[0]!.code,
        normalizedCode,
        featureIndex: candidates[0]!.featureIndex,
        featureCount: candidates.length,
        polygon: null,
        issue: "invalid_geometry",
        detail: invalid.detail,
        identicalDuplicates: 0,
      });
      continue;
    }

    const fingerprints = new Set(candidates.map((candidate) => candidate.fingerprint));
    if (fingerprints.size > 1) {
      parsedGroups.push({
        code: candidates[0]!.code,
        normalizedCode,
        featureIndex: candidates[0]!.featureIndex,
        featureCount: candidates.length,
        polygon: null,
        issue: "duplicate_in_file",
        detail: "Le même code désigne plusieurs géométries différentes.",
        identicalDuplicates: 0,
      });
      continue;
    }

    const duplicateCount = candidates.length - 1;
    identicalDuplicates += duplicateCount;
    parsedGroups.push({
      code: candidates[0]!.code,
      normalizedCode,
      featureIndex: candidates[0]!.featureIndex,
      featureCount: candidates.length,
      polygon: candidates[0]!.polygon,
      issue: null,
      detail: null,
      identicalDuplicates: duplicateCount,
    });
  }

  return {
    codeFields,
    selectedField,
    totalFeatures: features.length,
    groups: parsedGroups,
    missingCodeFeatureIndexes,
    identicalDuplicates,
  };
}
