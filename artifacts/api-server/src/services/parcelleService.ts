import { db, parcellesTable, zonesRisqueEudrTable, membresTable, campagnesTable, historiqueRendementsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Géographie ────────────────────────────────────────────────────────────────

export function calculerSuperficie(polygone: [number, number][]): number {
  if (polygone.length < 3) return 0;

  const EARTH_RADIUS = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const latCenter = toRad(polygone.reduce((s, p) => s + p[0]!, 0) / polygone.length);
  let area = 0;
  const n = polygone.length;

  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = polygone[i]!;
    const [lat2, lng2] = polygone[(i + 1) % n]!;
    const x1 = toRad(lng1) * EARTH_RADIUS * Math.cos(latCenter);
    const y1 = toRad(lat1) * EARTH_RADIUS;
    const x2 = toRad(lng2) * EARTH_RADIUS * Math.cos(latCenter);
    const y2 = toRad(lat2) * EARTH_RADIUS;
    area += x1 * y2 - x2 * y1;
  }

  const m2 = Math.abs(area) / 2;
  return Math.round((m2 / 10000) * 100) / 100;
}

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = polygon[i]!;
    const [yj, xj] = polygon[j]!;
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonsIntersect(parcelle: [number, number][], zone: [number, number][]): boolean {
  for (const [lat, lng] of parcelle) {
    if (pointInPolygon(lat, lng, zone)) return true;
  }
  const centerLat = parcelle.reduce((s, p) => s + p[0]!, 0) / parcelle.length;
  const centerLng = parcelle.reduce((s, p) => s + p[1]!, 0) / parcelle.length;
  return pointInPolygon(centerLat, centerLng, zone);
}

// ── Code parcelle ─────────────────────────────────────────────────────────────

export async function genererCodeParcelle(membreId: number): Promise<string> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(parcellesTable)
    .where(eq(parcellesTable.membreId, membreId));
  const n = (row?.count ?? 0) + 1;
  return `PAR-${String(membreId).padStart(4, "0")}-${String(n).padStart(3, "0")}`;
}

// ── Vérification EUDR ─────────────────────────────────────────────────────────

export async function verifierEUDR(parcelleId: number): Promise<void> {
  const [parcelle] = await db
    .select()
    .from(parcellesTable)
    .where(eq(parcellesTable.id, parcelleId))
    .limit(1);

  if (!parcelle) throw new Error("Parcelle introuvable");

  const zones = await db
    .select()
    .from(zonesRisqueEudrTable)
    .where(eq(zonesRisqueEudrTable.cooperativeId, parcelle.cooperativeId));

  const poly = parcelle.polygone;
  const today = new Date().toISOString().slice(0, 10);

  if (!poly || poly.length < 3) {
    await db
      .update(parcellesTable)
      .set({
        eudrStatut: "non_verifie",
        eudrDateVerification: today,
        eudrCommentaire: "Polygone absent ou incomplet — vérification manuelle requise",
        updatedAt: new Date(),
      })
      .where(eq(parcellesTable.id, parcelleId));
    return;
  }

  let dansZoneProtegee = false;
  let nomZone: string | undefined;

  for (const zone of zones) {
    if (polygonsIntersect(poly, zone.polygoneZone as [number, number][])) {
      dansZoneProtegee = true;
      nomZone = zone.nomZone;
      break;
    }
  }

  await db
    .update(parcellesTable)
    .set({
      eudrDansZoneProtegee: dansZoneProtegee,
      eudrStatut: dansZoneProtegee ? "non_conforme" : "conforme",
      eudrRisqueDeforestation: dansZoneProtegee ? "eleve" : "faible",
      eudrDateVerification: today,
      eudrCommentaire: dansZoneProtegee
        ? `Intersection avec zone protégée : ${nomZone}`
        : "Aucune intersection avec zone protégée",
      updatedAt: new Date(),
    })
    .where(eq(parcellesTable.id, parcelleId));

  logger.info({ parcelleId, dansZoneProtegee }, "Vérification EUDR terminée");
}

// ── Export GeoJSON ────────────────────────────────────────────────────────────

export async function exportGeoJSON(cooperativeId: number, campagneId?: number): Promise<object> {
  const parcelles = await db
    .select({
      id:                    parcellesTable.id,
      codeParcelle:          parcellesTable.codeParcelle,
      polygone:              parcellesTable.polygone,
      coordonneesPoint:      parcellesTable.coordonneesPoint,
      superficieCalculeeHa:  parcellesTable.superficieCalculeeHa,
      superficieDeclareeHa:  parcellesTable.superficieDeclareeHa,
      culturePrincipale:     parcellesTable.culturePrincipale,
      village:               parcellesTable.village,
      region:                parcellesTable.region,
      eudrStatut:            parcellesTable.eudrStatut,
      eudrRisqueDeforestation: parcellesTable.eudrRisqueDeforestation,
      certificationStatut:   parcellesTable.certificationStatut,
      organismeCertificateur: parcellesTable.organismeCertificateur,
      dateExpirationCert:    parcellesTable.dateExpirationCert,
      derniereCampagneKg:    parcellesTable.derniereCampagneKg,
      membreNom:             membresTable.nom,
      membrePrenoms:         membresTable.prenoms,
      membreId:              membresTable.id,
      dateAdhesion:          membresTable.dateAdhesion,
    })
    .from(parcellesTable)
    .innerJoin(membresTable, eq(parcellesTable.membreId, membresTable.id))
    .where(and(
      eq(parcellesTable.cooperativeId, cooperativeId),
      eq(parcellesTable.actif, true),
    ));

  let campagneLibelle = "";
  if (campagneId) {
    const [camp] = await db.select({ libelle: campagnesTable.libelle }).from(campagnesTable).where(eq(campagnesTable.id, campagneId)).limit(1);
    campagneLibelle = camp?.libelle ?? "";
  }

  const features = parcelles
    .filter(p => p.polygone && (p.polygone as [number, number][]).length >= 3)
    .map(p => {
      const poly = p.polygone as [number, number][];
      const superficie = p.superficieCalculeeHa ?? p.superficieDeclareeHa;
      const membreCode = `MBR-${p.dateAdhesion?.slice(0, 4) ?? "0000"}-${String(p.membreId).padStart(4, "0")}`;

      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[...poly.map(([lat, lng]) => [lng, lat]), [poly[0]![1], poly[0]![0]]]],
        },
        properties: {
          farmer_id: membreCode,
          farmer_name: `${p.membreNom} ${p.membrePrenoms}`.toUpperCase(),
          plot_id: p.codeParcelle,
          area_ha: parseFloat(String(superficie ?? 0)),
          culture: p.culturePrincipale ?? "cacao",
          village: p.village ?? "",
          region: p.region ?? "",
          country: "CI",
          eudr_status: p.eudrStatut ?? "non_verifie",
          deforestation_risk: p.eudrRisqueDeforestation ?? "inconnu",
          certification: p.organismeCertificateur ?? "",
          cert_expiry: p.dateExpirationCert ?? "",
          production_kg: parseFloat(String(p.derniereCampagneKg ?? 0)),
          campaign: campagneLibelle,
        },
      };
    });

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      generated_at: new Date().toISOString(),
      cooperative_id: cooperativeId,
      regulation: "EUDR (EU) 2023/1115",
      total_features: features.length,
    },
  };
}

// ── Conformité globale ────────────────────────────────────────────────────────

export interface ConformiteStats {
  nb_parcelles_total: number;
  nb_conformes: number;
  nb_non_conformes: number;
  nb_en_cours: number;
  nb_non_verifiees: number;
  superficie_totale_ha: number;
  superficie_conforme_ha: number;
  pct_superficie_conforme: number;
  membres_avec_parcelle: number;
  membres_sans_parcelle: number;
  par_section: { section: string; total: number; conformes: number; pct: number }[];
}

export async function calculerConformiteGlobale(cooperativeId: number): Promise<ConformiteStats> {
  const rows = await db
    .select({
      eudrStatut:           parcellesTable.eudrStatut,
      section:              parcellesTable.section,
      superficieCalculeeHa: parcellesTable.superficieCalculeeHa,
      superficieDeclareeHa: parcellesTable.superficieDeclareeHa,
      membreId:             parcellesTable.membreId,
    })
    .from(parcellesTable)
    .where(and(eq(parcellesTable.cooperativeId, cooperativeId), eq(parcellesTable.actif, true)));

  const total = rows.length;
  const conformes = rows.filter(r => r.eudrStatut === "conforme");
  const nonConformes = rows.filter(r => r.eudrStatut === "non_conforme");
  const enCours = rows.filter(r => r.eudrStatut === "en_cours");
  const nonVerifiees = rows.filter(r => r.eudrStatut === "non_verifie" || !r.eudrStatut);

  const ha = (r: typeof rows[0]) => parseFloat(String(r.superficieCalculeeHa ?? r.superficieDeclareeHa ?? 0));
  const superfTotale = rows.reduce((s, r) => s + ha(r), 0);
  const superfConforme = conformes.reduce((s, r) => s + ha(r), 0);

  const membresAvecParcelle = new Set(rows.map(r => r.membreId)).size;

  const [{ totalMembres }] = await db
    .select({ totalMembres: sql<number>`count(*)::int` })
    .from(membresTable)
    .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif")));

  const sectionMap = new Map<string, { total: number; conformes: number }>();
  for (const r of rows) {
    const sec = r.section ?? "Non définie";
    const s = sectionMap.get(sec) ?? { total: 0, conformes: 0 };
    s.total++;
    if (r.eudrStatut === "conforme") s.conformes++;
    sectionMap.set(sec, s);
  }

  const par_section = [...sectionMap.entries()]
    .map(([section, s]) => ({
      section,
      total: s.total,
      conformes: s.conformes,
      pct: s.total > 0 ? Math.round((s.conformes / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    nb_parcelles_total: total,
    nb_conformes: conformes.length,
    nb_non_conformes: nonConformes.length,
    nb_en_cours: enCours.length,
    nb_non_verifiees: nonVerifiees.length,
    superficie_totale_ha: Math.round(superfTotale * 100) / 100,
    superficie_conforme_ha: Math.round(superfConforme * 100) / 100,
    pct_superficie_conforme: superfTotale > 0 ? Math.round((superfConforme / superfTotale) * 100) : 0,
    membres_avec_parcelle: membresAvecParcelle,
    membres_sans_parcelle: Math.max(0, (totalMembres ?? 0) - membresAvecParcelle),
    par_section,
  };
}
