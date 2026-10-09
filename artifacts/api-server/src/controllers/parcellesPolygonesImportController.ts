import { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, membresTable, parcellesTable } from "@workspace/db";
import {
  createPolygoneImportPlan,
  parsePolygonesGeoJson,
  persistPolygoneImportPlan,
  type ExistingParcelle,
  type ParcellePolygonUpdate,
} from "../services/parcellesPolygonesImport";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const parcellesPolygonesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    if (!/\.(geojson|json)$/i.test(file.originalname)) {
      callback(new Error("Format invalide : sélectionnez un fichier GeoJSON."));
      return;
    }
    callback(null, true);
  },
});

export const parcellesPolygonesUploadErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      erreur: error.code === "LIMIT_FILE_SIZE"
        ? "Le fichier GeoJSON dépasse la limite de 10 Mo."
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

export function requireParcellesAdminRole(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (!role) {
    res.status(401).json({ erreur: "Authentification requise." });
    return;
  }
  if (role !== "pca" && role !== "directeur") {
    res.status(403).json({ erreur: "Seuls le PCA et le Directeur peuvent importer les polygones." });
    return;
  }
  next();
}

type SelectExecutor = Pick<typeof db, "select">;
type SqlExecutor = Pick<typeof db, "execute">;

async function findExistingParcelles(
  executor: SelectExecutor,
  cooperativeId: number,
  codes: string[],
): Promise<ExistingParcelle[]> {
  if (codes.length === 0) return [];
  return executor
    .select({
      id: parcellesTable.id,
      cooperativeId: parcellesTable.cooperativeId,
      codeParcelle: parcellesTable.codeParcelle,
    })
    .from(parcellesTable)
    .innerJoin(membresTable, eq(parcellesTable.membreId, membresTable.id))
    .where(and(
      eq(parcellesTable.cooperativeId, cooperativeId),
      eq(membresTable.cooperativeId, cooperativeId),
      inArray(sql`trim(${parcellesTable.codeParcelle})`, codes),
    ));
}

async function updateParcellesBatch(
  executor: SqlExecutor,
  cooperativeId: number,
  batch: ParcellePolygonUpdate[],
): Promise<void> {
  if (batch.length === 0) return;
  const values = batch.map((update) => sql`(
    ${update.parcelleId}::integer,
    ${JSON.stringify(update.geometrie)}::jsonb,
    ${update.surfacePolygoneHa}::numeric,
    ${update.distanceGpsM}::numeric,
    ${update.statutPolygone}::varchar
  )`);
  await executor.execute(sql`
    UPDATE "parcelles" AS p
    SET
      "geometrie" = v.geometrie,
      "surface_polygone_ha" = v.surface_polygone_ha,
      "distance_gps_m" = v.distance_gps_m,
      "statut_polygone" = v.statut_polygone
    FROM (VALUES ${sql.join(values, sql`, `)}) AS v(
      id, geometrie, surface_polygone_ha, distance_gps_m, statut_polygone
    )
    WHERE p."id" = v.id
      AND p."cooperative_id" = ${cooperativeId}
  `);
}

function getRequestedDryRun(value: unknown): boolean | null {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  return null;
}

export async function importParcellesPolygones(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (cooperativeId === null || cooperativeId === undefined || !Number.isInteger(cooperativeId)) {
    res.status(401).json({ erreur: "Coopérative non associée au compte." });
    return;
  }

  const dryRun = getRequestedDryRun(req.query["dry_run"]);
  if (dryRun === null) {
    res.status(400).json({ erreur: "Le paramètre dry_run doit valoir true ou false." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ erreur: "Fichier GeoJSON requis dans le champ « fichier »." });
    return;
  }

  let parsed;
  try {
    parsed = parsePolygonesGeoJson(req.file.buffer);
  } catch (error) {
    res.status(400).json({
      erreur: error instanceof Error ? error.message : "Impossible de lire le fichier GeoJSON.",
    });
    return;
  }

  const codes = [...new Set(parsed.features
    .filter((feature) => feature.code !== null && feature.error === null)
    .map((feature) => feature.code!))];

  try {
    if (dryRun) {
      const matches = await findExistingParcelles(db, cooperativeId, codes);
      const plan = createPolygoneImportPlan(parsed, cooperativeId, matches);
      const result = await persistPolygoneImportPlan(plan, true, async () => undefined);
      res.json(result);
      return;
    }

    const result = await db.transaction(async (tx) => {
      const matches = await findExistingParcelles(tx, cooperativeId, codes);
      const plan = createPolygoneImportPlan(parsed, cooperativeId, matches);
      return persistPolygoneImportPlan(
        plan,
        false,
        (batch) => updateParcellesBatch(tx, cooperativeId, batch),
      );
    });
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Erreur importParcellesPolygones");
    res.status(500).json({ erreur: "L’import des polygones a échoué; aucune modification partielle n’a été conservée." });
  }
}
