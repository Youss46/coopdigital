import { type Request, type Response } from "express";
import { db, parcellesTable, membresTable, historiqueRendementsTable, zonesRisqueEudrTable, campagnesTable, missionsMembresTable, missionsTerrainTable } from "@workspace/db";
import { eq, and, sql, desc, ilike, or } from "drizzle-orm";
import {
  calculerSuperficie,
  genererCodeParcelle,
  verifierEUDR,
  exportGeoJSON,
  calculerConformiteGlobale,
} from "../services/parcelleService";

class TenantError extends Error {
  readonly status = 401;
  readonly erreur = "Coopérative non associée au compte";
  constructor() { super("TENANT_REQUIRED"); }
}

const COOP_ID = (req: Request): number => {
  const id = req.user?.cooperativeId;
  if (!id) throw new TenantError();
  return id;
};

// ── Liste ─────────────────────────────────────────────────────────────────────

export async function listParcelles(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const page  = Math.max(1, parseInt(String(req.query["page"]  ?? "1")));
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    const membreIdQ         = req.query["membre_id"]            ? parseInt(String(req.query["membre_id"])) : undefined;
    const eudrStatutQ       = req.query["eudr_statut"]          as string | undefined;
    const cultureQ          = req.query["culture"]              as string | undefined;
    const sectionQ          = req.query["section"]              as string | undefined;
    const certStatutQ       = req.query["certification_statut"] as string | undefined;
    const search            = String(req.query["search"] ?? "").trim();

    const conditions: ReturnType<typeof eq>[] = [
      eq(parcellesTable.cooperativeId, coopId),
      eq(parcellesTable.actif, true),
    ];
    if (membreIdQ)   conditions.push(eq(parcellesTable.membreId, membreIdQ));
    if (eudrStatutQ) conditions.push(eq(parcellesTable.eudrStatut, eudrStatutQ));
    if (cultureQ)    conditions.push(eq(parcellesTable.culturePrincipale, cultureQ));
    if (sectionQ)    conditions.push(eq(parcellesTable.section, sectionQ));
    if (certStatutQ) conditions.push(eq(parcellesTable.certificationStatut, certStatutQ));

    const where = and(...conditions);

    const [parcelles, [{ count }]] = await Promise.all([
      db.select({
        parcelle:    parcellesTable,
        membreNom:   membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        telephone:   membresTable.telephone,
      })
        .from(parcellesTable)
        .innerJoin(membresTable, eq(parcellesTable.membreId, membresTable.id))
        .where(search
          ? and(where, or(
              ilike(membresTable.nom, `%${search}%`),
              ilike(membresTable.prenoms, `%${search}%`),
              ilike(parcellesTable.codeParcelle, `%${search}%`),
              ilike(parcellesTable.village, `%${search}%`),
            )!)
          : where)
        .orderBy(desc(parcellesTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(parcellesTable).where(where),
    ]);

    res.json({
      parcelles: parcelles.map(r => ({
        ...r.parcelle,
        membre_nom: `${r.membreNom} ${r.membrePrenoms}`,
        telephone: r.telephone,
      })),
      total: count,
      page,
      limit,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur listParcelles");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Carte (allégé) ────────────────────────────────────────────────────────────

export async function getParcellesCarte(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const eudrStatutQ = req.query["eudr_statut"] as string | undefined;
    const cultureQ    = req.query["culture"]     as string | undefined;
    const sectionQ    = req.query["section"]     as string | undefined;
    const villageQ    = req.query["village"]     as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [
      eq(parcellesTable.cooperativeId, coopId),
      eq(parcellesTable.actif, true),
    ];
    if (eudrStatutQ) conditions.push(eq(parcellesTable.eudrStatut, eudrStatutQ));
    if (cultureQ)    conditions.push(eq(parcellesTable.culturePrincipale, cultureQ));
    if (sectionQ)    conditions.push(eq(parcellesTable.section, sectionQ));
    if (villageQ)    conditions.push(eq(parcellesTable.village, villageQ));

    const rows = await db.select({
      id:               parcellesTable.id,
      codeParcelle:     parcellesTable.codeParcelle,
      polygone:         parcellesTable.polygone,
      coordonneesPoint: parcellesTable.coordonneesPoint,
      eudrStatut:       parcellesTable.eudrStatut,
      culturePrincipale: parcellesTable.culturePrincipale,
      superficieCalculeeHa: parcellesTable.superficieCalculeeHa,
      superficieDeclareeHa: parcellesTable.superficieDeclareeHa,
      membreNom:        membresTable.nom,
      membrePrenoms:    membresTable.prenoms,
      membreId:         membresTable.id,
    })
      .from(parcellesTable)
      .innerJoin(membresTable, eq(parcellesTable.membreId, membresTable.id))
      .where(and(...conditions));

    const zones = await db
      .select()
      .from(zonesRisqueEudrTable)
      .where(eq(zonesRisqueEudrTable.cooperativeId, coopId));

    res.json({ parcelles: rows, zones });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getParcellesCarte");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Détail ────────────────────────────────────────────────────────────────────

export async function getParcelleById(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [row] = await db
      .select({ parcelle: parcellesTable, membreNom: membresTable.nom, membrePrenoms: membresTable.prenoms })
      .from(parcellesTable)
      .innerJoin(membresTable, eq(parcellesTable.membreId, membresTable.id))
      .where(and(eq(parcellesTable.id, id), eq(parcellesTable.cooperativeId, coopId)))
      .limit(1);

    if (!row) { res.status(404).json({ erreur: "Parcelle introuvable" }); return; }
    res.json({ ...row.parcelle, membre_nom: `${row.membreNom} ${row.membrePrenoms}` });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getParcelleById");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Création ──────────────────────────────────────────────────────────────────

export async function createParcelle(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const body = req.body as Record<string, unknown>;

    const membreId = parseInt(String(body["membre_id"] ?? "0"));
    if (!membreId) { res.status(400).json({ erreur: "membre_id requis" }); return; }

    const [membre] = await db.select({ id: membresTable.id }).from(membresTable)
      .where(and(eq(membresTable.id, membreId), eq(membresTable.cooperativeId, coopId))).limit(1);
    if (!membre) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    const polygone = body["polygone"] as [number, number][] | undefined;
    const superficieCalculee = polygone && polygone.length >= 3 ? calculerSuperficie(polygone) : null;
    const coordonneesPoint = body["coordonnees_point"] as { lat: number; lng: number } | undefined;

    const codeParcelle = await genererCodeParcelle(membreId);

    const [nouvelle] = await db.insert(parcellesTable).values({
      cooperativeId:           coopId,
      membreId,
      codeParcelle,
      nomParcelle:             String(body["nom_parcelle"] ?? ""),
      village:                 body["village"]                  as string | undefined,
      section:                 body["section"]                  as string | undefined,
      region:                  body["region"]                   as string | undefined,
      coordonneesPoint:        coordonneesPoint ?? null,
      polygone:                polygone ?? null,
      superficieDeclareeHa:    body["superficie_declaree_ha"]   ? String(body["superficie_declaree_ha"]) : null,
      superficieCalculeeHa:    superficieCalculee !== null      ? String(superficieCalculee) : null,
      culturePrincipale:       body["culture_principale"]       as string | undefined,
      cultureSecondaire:       body["culture_secondaire"]       as string | undefined,
      anneePlantation:         body["annee_plantation"]         ? parseInt(String(body["annee_plantation"])) : null,
      variete:                 body["variete"]                  as string | undefined,
      certificationStatut:     body["certification_statut"]     as string | undefined,
      organismeCertificateur:  body["organisme_certificateur"]  as string | undefined,
      dateCertification:       body["date_certification"]       as string | undefined,
      dateExpirationCert:      body["date_expiration_cert"]     as string | undefined,
      numeroCertificat:        body["numero_certificat"]        as string | undefined,
      dateEnregistrement:      new Date().toISOString().slice(0, 10),
      enregistrePar:           req.user?.id,
    }).returning();

    if (!nouvelle) { res.status(500).json({ erreur: "Erreur création" }); return; }

    if (polygone && polygone.length >= 3) {
      verifierEUDR(nouvelle.id).catch(e =>
        req.log.warn({ err: e, parcelleId: nouvelle.id }, "Vérification EUDR différée échouée")
      );
    }

    res.status(201).json(nouvelle);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur createParcelle");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Mise à jour ───────────────────────────────────────────────────────────────

export async function updateParcelle(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const id = parseInt(String(req.params["id"] ?? "0"));
    const body = req.body as Record<string, unknown>;

    const [existing] = await db.select().from(parcellesTable)
      .where(and(eq(parcellesTable.id, id), eq(parcellesTable.cooperativeId, coopId))).limit(1);
    if (!existing) { res.status(404).json({ erreur: "Parcelle introuvable" }); return; }

    const polygone = body["polygone"] as [number, number][] | undefined;
    const polygoneChanged = polygone !== undefined;
    const superficieCalculee = polygone && polygone.length >= 3 ? calculerSuperficie(polygone) : undefined;

    const updates: Partial<typeof parcellesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if ("nom_parcelle"           in body) updates.nomParcelle            = String(body["nom_parcelle"]);
    if ("village"                in body) updates.village                = body["village"]                 as string;
    if ("section"                in body) updates.section                = body["section"]                 as string;
    if ("region"                 in body) updates.region                 = body["region"]                  as string;
    if ("coordonnees_point"      in body) updates.coordonneesPoint       = body["coordonnees_point"] as { lat: number; lng: number };
    if (polygoneChanged)                  updates.polygone               = polygone!;
    if (superficieCalculee !== undefined) updates.superficieCalculeeHa   = String(superficieCalculee);
    if ("superficie_declaree_ha" in body) updates.superficieDeclareeHa   = String(body["superficie_declaree_ha"]);
    if ("culture_principale"     in body) updates.culturePrincipale      = body["culture_principale"]      as string;
    if ("culture_secondaire"     in body) updates.cultureSecondaire      = body["culture_secondaire"]      as string;
    if ("annee_plantation"       in body) updates.anneePlantation        = parseInt(String(body["annee_plantation"]));
    if ("variete"                in body) updates.variete                = body["variete"]                 as string;
    if ("certification_statut"   in body) updates.certificationStatut    = body["certification_statut"]    as string;
    if ("organisme_certificateur"in body) updates.organismeCertificateur = body["organisme_certificateur"] as string;
    if ("date_certification"     in body) updates.dateCertification      = body["date_certification"]      as string;
    if ("date_expiration_cert"   in body) updates.dateExpirationCert     = body["date_expiration_cert"]    as string;
    if ("numero_certificat"      in body) updates.numeroCertificat       = body["numero_certificat"]       as string;
    if ("rendement_moyen_kg_ha"  in body) updates.rendementMoyenKgHa    = String(body["rendement_moyen_kg_ha"]);
    if ("derniere_campagne_kg"   in body) updates.derniereCampagneKg     = String(body["derniere_campagne_kg"]);
    if ("actif"                  in body) updates.actif                  = Boolean(body["actif"]);

    const [updated] = await db.update(parcellesTable).set(updates)
      .where(and(eq(parcellesTable.id, id), eq(parcellesTable.cooperativeId, coopId))).returning();

    if (polygoneChanged && polygone && polygone.length >= 3) {
      verifierEUDR(id).catch(e =>
        req.log.warn({ err: e, parcelleId: id }, "Re-vérification EUDR différée échouée")
      );
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur updateParcelle");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Statistiques GPS des parcelles ───────────────────────────────────────────

export async function getStatsGps(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const [row] = await db
      .select({
        total:           sql<number>`count(*)::int`,
        avecGps:         sql<number>`count(superficie_calculee_ha)::int`,
        superficieGpsHa: sql<string>`coalesce(sum(superficie_calculee_ha::numeric), 0)`,
        superficieTotaleHa: sql<string>`sum(coalesce(superficie_calculee_ha::numeric, superficie_declaree_ha::numeric, 0))`,
      })
      .from(parcellesTable)
      .where(and(eq(parcellesTable.cooperativeId, coopId), eq(parcellesTable.actif, true)));

    const total   = row?.total   ?? 0;
    const avecGps = row?.avecGps ?? 0;
    res.json({
      nbParcellesTotal:    total,
      nbParcellesAvecGps:  avecGps,
      pctParcellesAvecGps: total > 0 ? Math.round((avecGps / total) * 100) : 0,
      superficieGpsTotaleHa:    parseFloat(row?.superficieGpsHa     ?? "0") || 0,
      superficieCombineeTotaleHa: parseFloat(row?.superficieTotaleHa ?? "0") || 0,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getStatsGps");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Parcelles d'un membre ─────────────────────────────────────────────────────

export async function getParcellesMembre(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const membreId = parseInt(String(req.params["membre_id"] ?? "0"));
    const parcelles = await db
      .select()
      .from(parcellesTable)
      .where(and(eq(parcellesTable.membreId, membreId), eq(parcellesTable.cooperativeId, coopId), eq(parcellesTable.actif, true)))
      .orderBy(desc(parcellesTable.createdAt));
    res.json(parcelles);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getParcellesMembre");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Historique rendements ─────────────────────────────────────────────────────

export async function getHistoriqueRendements(req: Request, res: Response): Promise<void> {
  try {
    const parcelleId = parseInt(String(req.params["id"] ?? "0"));
    const rows = await db
      .select({
        hist: historiqueRendementsTable,
        campagneLibelle: campagnesTable.libelle,
      })
      .from(historiqueRendementsTable)
      .leftJoin(campagnesTable, eq(historiqueRendementsTable.campagneId, campagnesTable.id))
      .where(eq(historiqueRendementsTable.parcelleId, parcelleId))
      .orderBy(desc(historiqueRendementsTable.createdAt));

    res.json(rows.map(r => ({ ...r.hist, campagne_libelle: r.campagneLibelle })));
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getHistoriqueRendements");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Export GeoJSON ────────────────────────────────────────────────────────────

export async function exportGeoJSONController(req: Request, res: Response): Promise<void> {
  try {
    const coopId    = COOP_ID(req);
    const campagneId = req.query["campagne_id"] ? parseInt(String(req.query["campagne_id"])) : undefined;
    const geojson = await exportGeoJSON(coopId, campagneId);

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    res.setHeader("Content-Type", "application/geo+json");
    res.setHeader("Content-Disposition", `attachment; filename="eudr_export_coop${coopId}_${date}.geojson"`);
    res.json(geojson);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur exportGeoJSON");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Conformité EUDR ───────────────────────────────────────────────────────────

export async function getConformite(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const stats = await calculerConformiteGlobale(coopId);
    res.json(stats);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getConformite");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Import zones de risque ────────────────────────────────────────────────────

export async function importZonesRisque(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const body = req.body as { features?: unknown[]; zones?: unknown[] };

    const zones = (body.features ?? body.zones ?? []) as Array<{
      properties?: { nom?: string; type?: string; source?: string; date?: string };
      geometry?: { coordinates?: [number, number][][] };
      nom_zone?: string;
      type_zone?: string;
      polygone_zone?: [number, number][];
      source?: string;
      date_import?: string;
    }>;

    if (!zones.length) { res.status(400).json({ erreur: "Aucune zone fournie" }); return; }

    const values = zones.map(z => ({
      cooperativeId: coopId,
      nomZone:       z.properties?.nom ?? z.nom_zone ?? "Zone importée",
      typeZone:      z.properties?.type ?? z.type_zone ?? "zone_surveillance",
      polygoneZone:  (z.geometry?.coordinates?.[0]?.map(([lng, lat]: [number, number]) => [lat, lng]) ?? z.polygone_zone ?? []) as [number, number][],
      source:        z.properties?.source ?? z.source,
      dateImport:    z.properties?.date ?? z.date_import ?? new Date().toISOString().slice(0, 10),
    }));

    const inserted = await db.insert(zonesRisqueEudrTable).values(values).returning();
    res.status(201).json({ importees: inserted.length, zones: inserted });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur importZonesRisque");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Vérifier EUDR manuellement ────────────────────────────────────────────────

export async function verifierEUDRController(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [check] = await db.select({ id: parcellesTable.id }).from(parcellesTable)
      .where(and(eq(parcellesTable.id, id), eq(parcellesTable.cooperativeId, coopId))).limit(1);
    if (!check) { res.status(404).json({ erreur: "Parcelle introuvable" }); return; }
    await verifierEUDR(id);
    const [updated] = await db.select().from(parcellesTable).where(eq(parcellesTable.id, id)).limit(1);
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur verifierEUDR");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── GPS Terrain collecte ──────────────────────────────────────────────────────

interface GpsPoint { lat: number; lon: number; accuracy?: number; ts: number; }

export async function getGpsTerrain(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);

    const rows = await db
      .select({
        membreId:      membresTable.id,
        membreNom:     membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        village:       membresTable.village,
        section:       membresTable.section,
        missionId:     missionsTerrainTable.id,
        missionTitre:  missionsTerrainTable.titre,
        statut:        missionsMembresTable.statut,
        dateCollecte:  missionsMembresTable.dateCollecte,
        superficieHa:  membresTable.superficieHa,
        gpsCollecte:   missionsMembresTable.gpsCollecte,
      })
      .from(missionsMembresTable)
      .innerJoin(membresTable, eq(membresTable.id, missionsMembresTable.membreId))
      .innerJoin(missionsTerrainTable, eq(missionsTerrainTable.id, missionsMembresTable.missionId))
      .where(
        and(
          eq(missionsTerrainTable.cooperativeId, coopId),
          sql`${missionsMembresTable.gpsCollecte} IS NOT NULL`,
          sql`${missionsMembresTable.statut} IN ('collecte', 'valide')`,
        ),
      )
      .orderBy(desc(missionsMembresTable.dateCollecte));

    const result = rows
      .map(row => {
        const pts = row.gpsCollecte as GpsPoint[] | null;
        if (!pts || pts.length < 3) return null;
        const polygone: [number, number][] = pts
          .filter(p => typeof p.lat === "number" && typeof p.lon === "number")
          .map(p => [p.lat, p.lon] as [number, number]);
        if (polygone.length < 3) return null;
        return {
          membreId:      row.membreId,
          membreNom:     row.membreNom,
          membrePrenoms: row.membrePrenoms,
          village:       row.village,
          section:       row.section,
          missionId:     row.missionId,
          missionTitre:  row.missionTitre,
          statut:        row.statut,
          dateCollecte:  row.dateCollecte ? new Date(row.dateCollecte as Date).toISOString() : null,
          superficieHa:  row.superficieHa,
          polygone,
        };
      })
      .filter(Boolean);

    res.json({ polygones: result });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getGpsTerrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Zones / filtres disponibles ───────────────────────────────────────────────

export async function getZonesFiltres(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const [villages, sections, typesZone] = await Promise.all([
      db.selectDistinct({ village: parcellesTable.village })
        .from(parcellesTable)
        .where(and(
          eq(parcellesTable.cooperativeId, coopId),
          eq(parcellesTable.actif, true),
          sql`${parcellesTable.village} IS NOT NULL`,
        ))
        .orderBy(parcellesTable.village),
      db.selectDistinct({ section: parcellesTable.section })
        .from(parcellesTable)
        .where(and(
          eq(parcellesTable.cooperativeId, coopId),
          eq(parcellesTable.actif, true),
          sql`${parcellesTable.section} IS NOT NULL`,
        ))
        .orderBy(parcellesTable.section),
      db.selectDistinct({ typeZone: zonesRisqueEudrTable.typeZone })
        .from(zonesRisqueEudrTable)
        .where(eq(zonesRisqueEudrTable.cooperativeId, coopId))
        .orderBy(zonesRisqueEudrTable.typeZone),
    ]);
    res.json({
      villages:   villages.map(r => r.village).filter(Boolean) as string[],
      sections:   sections.map(r => r.section).filter(Boolean) as string[],
      typesZone:  typesZone.map(r => r.typeZone).filter(Boolean) as string[],
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getZonesFiltres");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Vérifier toutes les parcelles non vérifiées ───────────────────────────────

export async function verifierTout(req: Request, res: Response): Promise<void> {
  try {
    const coopId = COOP_ID(req);
    const nonVerifiees = await db
      .select({ id: parcellesTable.id })
      .from(parcellesTable)
      .where(and(
        eq(parcellesTable.cooperativeId, coopId),
        eq(parcellesTable.actif, true),
        eq(parcellesTable.eudrStatut, "non_verifie"),
      ));

    let ok = 0;
    for (const { id } of nonVerifiees) {
      try { await verifierEUDR(id); ok++; } catch { /* continue */ }
    }

    res.json({ verifiees: ok, total: nonVerifiees.length });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur verifierTout");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
