import { type ErrorRequestHandler, type Request, type Response } from "express";
import multer from "multer";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, membresTable, parcellesTable } from "@workspace/db";
import { calculerSuperficie } from "../services/parcelleService";
import {
  normalizeParcelCode,
  parseParcellesGeoJson,
  type ParsedGeoJsonImport,
  type ParsedPolygonGroup,
} from "../services/parcellesGeoJsonImport";

const MAX_FILE_SIZE = 30 * 1024 * 1024;

export const parcellesGeoJsonUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".geojson") && !name.endsWith(".json")) {
      callback(new Error("Format non supporté — fichier GeoJSON .geojson ou .json requis."));
      return;
    }
    callback(null, true);
  },
});

export const parcellesGeoJsonUploadErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({
      erreur: error.code === "LIMIT_FILE_SIZE"
        ? "Le fichier dépasse la limite de 30 Mo."
        : "Le fichier envoyé est invalide.",
    });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ erreur: error.message });
    return;
  }
  next(error);
};

interface MatchedParcel {
  id: number;
  codeParcelle: string | null;
  hasPolygon: boolean;
  actif: boolean | null;
  membreNom: string;
  membrePrenoms: string;
}

type ImportRowStatus =
  | "importable"
  | "already_has_polygon"
  | "not_matched"
  | "duplicate_in_file"
  | "duplicate_database"
  | "missing_code"
  | "invalid_geometry"
  | "inactive_parcel";

interface ImportRow {
  featureIndex: number;
  featureCount: number;
  code: string | null;
  memberName: string | null;
  status: ImportRowStatus;
  detail: string;
  superficieHa: number | null;
  parcelId: number | null;
  polygon: [number, number][] | null;
}

const STATUS_DETAILS: Record<ImportRowStatus, string> = {
  importable: "Code retrouvé; aucun contour existant ne sera remplacé.",
  already_has_polygon: "Un contour est déjà enregistré; il sera conservé.",
  not_matched: "Aucune parcelle de cette coopérative ne porte ce code.",
  duplicate_in_file: "Plusieurs contours différents portent ce même code dans le fichier.",
  duplicate_database: "Plusieurs parcelles de cette coopérative correspondent au même code normalisé.",
  missing_code: "Le champ choisi ne contient pas de code pour cette feature.",
  invalid_geometry: "La géométrie ne peut pas être stockée comme contour simple.",
  inactive_parcel: "La parcelle correspondante est inactive; elle ne sera pas modifiée.",
};

function getUniqueCodes(parsed: ParsedGeoJsonImport): string[] {
  return [...new Set(parsed.groups.map((group) => group.normalizedCode))];
}

function classifyRows(
  parsed: ParsedGeoJsonImport,
  matches: MatchedParcel[],
): ImportRow[] {
  const matchesByCode = new Map<string, MatchedParcel[]>();
  for (const match of matches) {
    if (!match.codeParcelle) continue;
    const key = normalizeParcelCode(match.codeParcelle);
    matchesByCode.set(key, [...(matchesByCode.get(key) ?? []), match]);
  }

  const rows = parsed.groups.map((group: ParsedPolygonGroup): ImportRow => {
    const area = group.polygon ? calculerSuperficie(group.polygon) : null;
    let status: ImportRowStatus;
    let matched: MatchedParcel | undefined;
    let detail: string;

    if (group.issue === "duplicate_in_file") {
      status = "duplicate_in_file";
      detail = group.detail ?? STATUS_DETAILS[status];
    } else if (group.issue === "invalid_geometry" || !group.polygon || area === null || area <= 0) {
      status = "invalid_geometry";
      detail = group.detail ?? "La superficie calculée est nulle.";
    } else {
      const parcelMatches = matchesByCode.get(group.normalizedCode) ?? [];
      if (parcelMatches.length === 0) {
        status = "not_matched";
        detail = STATUS_DETAILS[status];
      } else if (parcelMatches.length > 1) {
        status = "duplicate_database";
        detail = STATUS_DETAILS[status];
      } else {
        matched = parcelMatches[0];
        if (!matched.actif) {
          status = "inactive_parcel";
          detail = STATUS_DETAILS[status];
        } else if (matched.hasPolygon) {
          status = "already_has_polygon";
          detail = STATUS_DETAILS[status];
        } else {
          status = "importable";
          detail = STATUS_DETAILS[status];
        }
      }
    }

    return {
      featureIndex: group.featureIndex,
      featureCount: group.featureCount,
      code: group.code,
      memberName: matched ? `${matched.membreNom} ${matched.membrePrenoms}`.trim() : null,
      status,
      detail,
      superficieHa: area !== null && area > 0 ? area : null,
      parcelId: matched?.id ?? null,
      polygon: status === "importable" ? group.polygon : null,
    };
  });

  for (const featureIndex of parsed.missingCodeFeatureIndexes) {
    rows.push({
      featureIndex,
      featureCount: 1,
      code: null,
      memberName: null,
      status: "missing_code",
      detail: STATUS_DETAILS.missing_code,
      superficieHa: null,
      parcelId: null,
      polygon: null,
    });
  }
  return rows.sort((a, b) => a.featureIndex - b.featureIndex);
}

function buildSummary(parsed: ParsedGeoJsonImport, rows: ImportRow[]) {
  const count = (status: ImportRowStatus) => rows.filter((row) => row.status === status).length;
  return {
    totalFeatures: parsed.totalFeatures,
    codesFound: parsed.groups.length,
    importable: count("importable"),
    alreadyHasPolygon: count("already_has_polygon"),
    notMatched: count("not_matched"),
    duplicateInFile: count("duplicate_in_file"),
    duplicateInDatabase: count("duplicate_database"),
    missingCode: count("missing_code"),
    invalidGeometry: count("invalid_geometry"),
    inactiveParcel: count("inactive_parcel"),
    identicalDuplicates: parsed.identicalDuplicates,
  };
}

function publicRows(rows: ImportRow[]) {
  return rows.map(({ parcelId: _parcelId, polygon: _polygon, ...row }) => row);
}

async function findMatches(cooperativeId: number, parsed: ParsedGeoJsonImport): Promise<MatchedParcel[]> {
  const codes = getUniqueCodes(parsed);
  if (codes.length === 0) return [];

  return db
    .select({
      id: parcellesTable.id,
      codeParcelle: parcellesTable.codeParcelle,
      hasPolygon: sql<boolean>`${parcellesTable.polygone} IS NOT NULL`,
      actif: parcellesTable.actif,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
    })
    .from(parcellesTable)
    .innerJoin(membresTable, eq(membresTable.id, parcellesTable.membreId))
    .where(and(
      eq(parcellesTable.cooperativeId, cooperativeId),
      eq(membresTable.cooperativeId, cooperativeId),
      inArray(sql`trim(${parcellesTable.codeParcelle})`, codes),
    ));
}

function parseRequestFile(req: Request, res: Response): ParsedGeoJsonImport | null {
  if (!req.file) {
    res.status(400).json({ erreur: "Fichier GeoJSON requis." });
    return null;
  }
  try {
    return parseParcellesGeoJson(req.file.buffer, String(req.body?.champCode ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de lire le fichier GeoJSON.";
    res.status(400).json({ erreur: message });
    return null;
  }
}

export async function previewParcellesGeoJsonImport(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte." });
    return;
  }
  const parsed = parseRequestFile(req, res);
  if (!parsed || !req.file) return;

  try {
    const rows = classifyRows(parsed, await findMatches(cooperativeId, parsed));
    res.json({
      fileName: req.file.originalname,
      codeFields: parsed.codeFields,
      selectedField: parsed.selectedField,
      summary: buildSummary(parsed, rows),
      rows: publicRows(rows),
    });
  } catch (error) {
    req.log.error({ err: error }, "Erreur previewParcellesGeoJsonImport");
    res.status(500).json({ erreur: "Impossible de rapprocher les codes de parcelle." });
  }
}

export async function importParcellesGeoJson(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte." });
    return;
  }
  const parsed = parseRequestFile(req, res);
  if (!parsed) return;

  try {
    const result = await db.transaction(async (tx) => {
      const codes = getUniqueCodes(parsed);
      const matches: MatchedParcel[] = codes.length === 0
        ? []
        : await tx
            .select({
              id: parcellesTable.id,
              codeParcelle: parcellesTable.codeParcelle,
              hasPolygon: sql<boolean>`${parcellesTable.polygone} IS NOT NULL`,
              actif: parcellesTable.actif,
              membreNom: membresTable.nom,
              membrePrenoms: membresTable.prenoms,
            })
            .from(parcellesTable)
            .innerJoin(membresTable, eq(membresTable.id, parcellesTable.membreId))
            .where(and(
              eq(parcellesTable.cooperativeId, cooperativeId),
              eq(membresTable.cooperativeId, cooperativeId),
              inArray(sql`trim(${parcellesTable.codeParcelle})`, codes),
            ))
            .for("update");

      const rows = classifyRows(parsed, matches);
      let imported = 0;
      let skippedExisting = 0;

      for (const row of rows) {
        if (row.status !== "importable" || row.parcelId === null || row.polygon === null) continue;
        const updated = await tx
          .update(parcellesTable)
          .set({
            polygone: row.polygon,
            superficieCalculeeHa: String(row.superficieHa),
            updatedAt: new Date(),
          })
          .where(and(
            eq(parcellesTable.id, row.parcelId),
            eq(parcellesTable.cooperativeId, cooperativeId),
            isNull(parcellesTable.polygone),
          ))
          .returning({ id: parcellesTable.id });
        if (updated.length > 0) imported += 1;
        else skippedExisting += 1;
      }

      return {
        imported,
        skippedExisting,
        summary: buildSummary(parsed, rows),
      };
    });

    res.status(200).json({
      ...result,
      eudrVerificationRequired: result.imported > 0,
      message: result.imported > 0
        ? "Contours importés. Relancez le contrôle EUDR pour actualiser la conformité."
        : "Aucun nouveau contour n’a été importé.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Erreur importParcellesGeoJson");
    res.status(500).json({ erreur: "L’import des contours a échoué; aucune modification partielle n’a été conservée." });
  }
}
