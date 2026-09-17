import { type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, membresTable, parcellesTable } from "@workspace/db";

type UnitRow = {
  code: string;
  superficie: number;
  lat: number;
  lng: number;
};

type ImportRow = {
  rowNumber: number;
  sourceId: string;
  nom: string;
  prenoms: string;
  telephone: string | null;
  telephoneKey: string | null;
  numeroCni: string | null;
  cniKey: string | null;
  village: string | null;
  superficieHa: number;
  anneeNaissance: number | null;
  sexe: "M" | "F" | null;
  nombreParcelles: number;
  superficieTotale: number;
  units: UnitRow[];
  blockingReasons: string[];
  warnings: string[];
};

type ExistingMember = {
  id: number;
  identifiantSource: string | null;
  telephone: string | null;
  numeroCni: string | null;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const membresImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    const accepted = file.originalname.toLowerCase().endsWith(".xlsx")
      || file.mimetype.includes("spreadsheet")
      || file.mimetype.includes("excel");
    if (!accepted) {
      callback(new Error("Format non supporté — fichier Excel .xlsx requis"));
      return;
    }
    callback(null, true);
  },
});

function clean(value: unknown): string {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function unavailable(value: unknown): boolean {
  return !clean(value) || /^(non disponible|n\/a|na|none|null|-+)$/i.test(clean(value));
}

function phoneKey(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

function cniKey(value: string | null): string | null {
  return value ? value.replace(/\s+/g, "").toUpperCase() : null;
}

function decimal(value: unknown): number {
  const parsed = Number(clean(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedLabel(value: unknown): string {
  return clean(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findSheet(workbook: XLSX.WorkBook, text: string): XLSX.WorkSheet {
  const normalized = normalizedLabel(text);
  const name = workbook.SheetNames.find((candidate) => {
    const current = normalizedLabel(candidate);
    return current.includes(normalized);
  });
  if (!name) throw new Error(`Onglet introuvable : ${text}`);
  return workbook.Sheets[name]!;
}

function tableRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null }) as unknown[][];
}

function columnIndex(header: unknown[], ...labels: string[]): number {
  const normalizedLabels = labels.map(normalizedLabel);
  return header.findIndex((value) => normalizedLabels.includes(normalizedLabel(value)));
}

function parseSexe(value: unknown): "M" | "F" | null {
  const sexeValue = normalizedLabel(value);
  if (["hommes", "homme", "masculin", "m"].includes(sexeValue)) return "M";
  if (["femmes", "femme", "feminin", "f"].includes(sexeValue)) return "F";
  return null;
}

function buildImportRow(
  rowNumber: number,
  sourceId: string,
  nom: string,
  prenoms: string,
  telephone: string | null,
  numeroCni: string | null,
  village: string | null,
  superficieHa: number,
  birthYear: number,
  sexe: "M" | "F" | null,
  memberUnits: UnitRow[],
): ImportRow {
  const superficieTotale = memberUnits.reduce((sum, unit) => sum + unit.superficie, 0);
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const currentYear = new Date().getFullYear();

  if (!sourceId) blockingReasons.push("Identifiant COOBEPA manquant");
  if (!nom || !prenoms) blockingReasons.push("Nom ou prénom manquant");
  if (!telephone) warnings.push("Téléphone manquant — à compléter ultérieurement");
  if (!(superficieHa > 0)) blockingReasons.push("Superficie totale invalide ou manquante");
  if (memberUnits.length === 0) warnings.push("Aucune parcelle GPS liée à cet identifiant");
  if (memberUnits.some((unit) => !(unit.superficie > 0) || !Number.isFinite(unit.lat) || !Number.isFinite(unit.lng))) {
    warnings.push("Une parcelle possède une superficie ou une coordonnée invalide");
  }
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > currentYear) {
    warnings.push("Année de naissance absente ou invalide");
  }
  if (!sexe) warnings.push("Sexe non reconnu");

  return {
    rowNumber,
    sourceId,
    nom,
    prenoms,
    telephone,
    telephoneKey: phoneKey(telephone),
    numeroCni,
    cniKey: cniKey(numeroCni),
    village,
    superficieHa,
    anneeNaissance: Number.isFinite(birthYear) && birthYear >= 1900 && birthYear <= currentYear ? birthYear : null,
    sexe,
    nombreParcelles: memberUnits.length,
    superficieTotale: Number(superficieTotale.toFixed(4)),
    units: memberUnits,
    blockingReasons,
    warnings,
  };
}

function parseReorganizedWorkbook(
  members: unknown[][],
  units: unknown[][],
): ImportRow[] {
  const memberHeader = members[0] ?? [];
  const unitHeader = units[0] ?? [];
  const memberSourceIndex = columnIndex(memberHeader, "Identifiant COOBEPA");
  const memberNameIndex = columnIndex(memberHeader, "Nom");
  const memberPrenomsIndex = columnIndex(memberHeader, "Prénoms", "Prenoms");
  const memberPhoneIndex = columnIndex(memberHeader, "Téléphone", "Telephone");
  const memberCniIndex = columnIndex(memberHeader, "Numéro CNI", "Numero CNI");
  const memberVillageIndex = columnIndex(memberHeader, "Village");
  const memberSurfaceIndex = columnIndex(memberHeader, "Superficie totale déclarée (ha)", "Superficie totale déclarée");
  const memberBirthYearIndex = columnIndex(memberHeader, "Année de naissance", "Annee de naissance");
  const memberSexIndex = columnIndex(memberHeader, "Sexe");
  const unitSourceIndex = columnIndex(unitHeader, "Identifiant COOBEPA");
  const unitCodeIndex = columnIndex(unitHeader, "Code parcelle");
  const unitSurfaceIndex = columnIndex(unitHeader, "Superficie (ha)", "Superficie");
  const unitLatIndex = columnIndex(unitHeader, "Latitude");
  const unitLngIndex = columnIndex(unitHeader, "Longitude");

  if (memberSourceIndex < 0 || memberNameIndex < 0 || memberPrenomsIndex < 0 || unitSourceIndex < 0 || unitCodeIndex < 0) {
    throw new Error("En-têtes COOBEPA non reconnus dans les onglets réorganisés");
  }

  const unitsBySource = new Map<string, UnitRow[]>();
  for (const row of units.slice(1)) {
    const sourceId = clean(row[unitSourceIndex]);
    const code = clean(row[unitCodeIndex]);
    if (!sourceId || !code) continue;
    const list = unitsBySource.get(sourceId) ?? [];
    list.push({
      code,
      superficie: decimal(row[unitSurfaceIndex]),
      lat: decimal(row[unitLatIndex]),
      lng: decimal(row[unitLngIndex]),
    });
    unitsBySource.set(sourceId, list);
  }

  return members.slice(1)
    .map((row, index) => {
      if (!row.some((value) => !unavailable(value))) return null;
      const sourceId = clean(row[memberSourceIndex]);
      const telephone = unavailable(row[memberPhoneIndex]) ? null : clean(row[memberPhoneIndex]);
      const numeroCni = unavailable(row[memberCniIndex]) ? null : clean(row[memberCniIndex]);
      const birthYear = Number.parseInt(clean(row[memberBirthYearIndex]), 10);
      return buildImportRow(
        index + 2,
        sourceId,
        clean(row[memberNameIndex]),
        clean(row[memberPrenomsIndex]),
        telephone,
        numeroCni,
        unavailable(row[memberVillageIndex]) ? null : clean(row[memberVillageIndex]),
        decimal(row[memberSurfaceIndex]),
        birthYear,
        parseSexe(row[memberSexIndex]),
        unitsBySource.get(sourceId) ?? [],
      );
    })
    .filter((row): row is ImportRow => row !== null);
}

function parseLegacyWorkbook(members: unknown[][], units: unknown[][]): ImportRow[] {
  const unitsBySource = new Map<string, UnitRow[]>();
  for (const row of units.slice(2)) {
    const sourceId = clean(row[0]);
    const code = clean(row[1]);
    if (!sourceId || !code) continue;
    const list = unitsBySource.get(sourceId) ?? [];
    list.push({
      code,
      superficie: decimal(row[2]),
      lat: decimal(row[3]),
      lng: decimal(row[4]),
    });
    unitsBySource.set(sourceId, list);
  }

  return members.slice(2)
    .map((row, index) => {
      if (!row.some((value) => !unavailable(value))) return null;
      const birthYear = Number.parseInt(clean(row[14]), 10);
      return buildImportRow(
        index + 3,
        clean(row[0]),
        clean(row[10]),
        clean(row[9]),
        unavailable(row[11]) ? null : clean(row[11]),
        unavailable(row[12]) ? null : clean(row[12]),
        unavailable(row[2]) ? null : clean(row[2]),
        decimal(row[5]),
        birthYear,
        parseSexe(row[13]),
        unitsBySource.get(clean(row[0])) ?? [],
      );
    })
    .filter((row): row is ImportRow => row !== null);
}

export function parseMembresImportWorkbook(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  const hasReorganizedMembers = workbook.SheetNames.some((name) => normalizedLabel(name) === "membres import");
  const members = tableRows(findSheet(workbook, hasReorganizedMembers ? "membres import" : "exploitation agricole"));
  const units = tableRows(findSheet(workbook, hasReorganizedMembers ? "parcelles import" : "unité agricole"));
  return hasReorganizedMembers
    ? parseReorganizedWorkbook(members, units)
    : parseLegacyWorkbook(members, units);
}

async function existingMembers(cooperativeId: number): Promise<ExistingMember[]> {
  return db
    .select({
      id: membresTable.id,
      identifiantSource: membresTable.identifiantSource,
      telephone: membresTable.telephone,
      numeroCni: membresTable.numeroCni,
    })
    .from(membresTable)
    .where(eq(membresTable.cooperativeId, cooperativeId));
}

function classifyRows(rows: ImportRow[], existing: ExistingMember[]) {
  const sources = new Set<string>();
  const phones = new Set<string>();
  const cnis = new Set<string>();
  const existingSources = new Map<string, ExistingMember>();
  const existingPhones = new Map<string, ExistingMember>();
  const existingCnis = new Map<string, ExistingMember>();

  for (const member of existing) {
    if (member.identifiantSource) existingSources.set(member.identifiantSource, member);
    const phone = phoneKey(member.telephone);
    if (phone) existingPhones.set(phone, member);
    const cni = cniKey(member.numeroCni);
    if (cni) existingCnis.set(cni, member);
  }

  return rows.map((row) => {
    const blockingReasons = [...row.blockingReasons];
    const warnings = [...row.warnings];
    const existingSource = row.sourceId ? existingSources.get(row.sourceId) : undefined;
    if (existingSource) {
      return { row, status: "existing" as const, blockingReasons, warnings, existingId: existingSource.id };
    }
    if (row.sourceId && sources.has(row.sourceId)) blockingReasons.push("Identifiant COOBEPA répété dans le fichier");
    if (row.telephoneKey && phones.has(row.telephoneKey)) blockingReasons.push("Téléphone répété dans le fichier");
    if (row.cniKey && cnis.has(row.cniKey)) blockingReasons.push("CNI répétée dans le fichier");
    if (row.telephoneKey && existingPhones.has(row.telephoneKey)) blockingReasons.push("Téléphone déjà utilisé par un membre");
    if (row.cniKey && existingCnis.has(row.cniKey)) warnings.push("CNI déjà présente dans la coopérative");
    if (row.sourceId) sources.add(row.sourceId);
    if (row.telephoneKey) phones.add(row.telephoneKey);
    if (row.cniKey) cnis.add(row.cniKey);
    return {
      row,
      status: blockingReasons.length > 0 ? "blocked" as const : "importable" as const,
      blockingReasons,
      warnings,
      existingId: null,
    };
  });
}

function responseRow(item: ReturnType<typeof classifyRows>[number]) {
  const { row } = item;
  return {
    rowNumber: row.rowNumber,
    sourceId: row.sourceId,
    nom: row.nom,
    prenoms: row.prenoms,
    telephone: row.telephone,
    village: row.village,
    superficieHa: row.superficieHa,
    nombreParcelles: row.nombreParcelles,
    status: item.status,
    blockingReasons: item.blockingReasons,
    warnings: item.warnings,
    existingId: item.existingId,
  };
}

export async function previewMembresImport(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    if (!req.file) { res.status(400).json({ erreur: "Fichier Excel requis" }); return; }
    const rows = parseMembresImportWorkbook(req.file.buffer);
    const classified = classifyRows(rows, await existingMembers(cooperativeId));
    const summary = {
      total: classified.length,
      importable: classified.filter((item) => item.status === "importable").length,
      existing: classified.filter((item) => item.status === "existing").length,
      blocked: classified.filter((item) => item.status === "blocked").length,
      parcels: rows.reduce((sum, row) => sum + row.units.length, 0),
    };
    res.json({
      fileName: req.file.originalname,
      summary,
      rows: classified.map(responseRow),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lecture du fichier";
    req.log.error({ err: error }, "previewMembresImport");
    res.status(400).json({ erreur: message });
  }
}

function validDate(value: unknown): string | null {
  const candidate = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

export async function importMembres(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    const userId = req.user?.id;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    if (!req.file) { res.status(400).json({ erreur: "Fichier Excel requis" }); return; }
    const dateAdhesion = validDate(req.body?.dateAdhesion);
    if (!dateAdhesion) { res.status(400).json({ erreur: "Une date d'adhésion valide est requise" }); return; }

    const rows = parseMembresImportWorkbook(req.file.buffer);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM cooperatives WHERE id = ${cooperativeId} FOR UPDATE`);
      const existing = await tx
        .select({
          id: membresTable.id,
          identifiantSource: membresTable.identifiantSource,
          telephone: membresTable.telephone,
          numeroCni: membresTable.numeroCni,
        })
        .from(membresTable)
        .where(eq(membresTable.cooperativeId, cooperativeId));
      const classified = classifyRows(rows, existing);
      const toImport = classified.filter((item) => item.status === "importable");
      const maxRow = await tx
        .select({ max: sql<number>`COALESCE(MAX(${membresTable.numeroMembre}), 0)` })
        .from(membresTable)
        .where(eq(membresTable.cooperativeId, cooperativeId));
      let numeroMembre = Number(maxRow[0]?.max ?? 0) + 1;
      let imported = 0;
      const importedSourceIds: string[] = [];

      for (const item of toImport) {
        const row = item.row;
        const [member] = await tx.insert(membresTable).values({
          cooperativeId,
          nom: row.nom,
          prenoms: row.prenoms,
          numeroCni: row.numeroCni,
           telephone: row.telephone,
          village: row.village,
          superficieHa: String(row.superficieHa),
          statut: "actif",
          dateAdhesion,
          sexe: row.sexe,
          anneeNaissance: row.anneeNaissance,
          identifiantSource: row.sourceId,
          rattachementType: "base_centrale",
          typeFournisseur: "membre",
          culturePrincipale: "cacao",
          nombreParcelles: row.nombreParcelles,
          superficieTotale: String(row.superficieTotale),
          gpsParcelles: row.units.map((unit, index) => ({
            parcelle: index + 1,
            code: unit.code,
            lat: unit.lat,
            lng: unit.lng,
            superficie: unit.superficie,
          })),
          creePar: "migration",
          statutMembre: "en_attente",
          numeroMembre,
        }).returning({ id: membresTable.id });
        if (!member) throw new Error(`Échec de création à la ligne ${row.rowNumber}`);

        for (const unit of row.units) {
          await tx.insert(parcellesTable).values({
            cooperativeId,
            membreId: member.id,
            codeParcelle: unit.code,
            nomParcelle: unit.code,
            village: row.village,
            coordonneesPoint: { lat: unit.lat, lng: unit.lng },
            superficieDeclareeHa: String(unit.superficie),
            culturePrincipale: "cacao",
            dateEnregistrement: dateAdhesion,
            enregistrePar: userId ?? null,
            eudrStatut: "non_verifie",
          }).onConflictDoNothing({ target: parcellesTable.codeParcelle });
        }
        numeroMembre += 1;
        imported += 1;
        importedSourceIds.push(row.sourceId);
      }

      return {
        imported,
        skippedExisting: classified.filter((item) => item.status === "existing").length,
        rejected: classified.filter((item) => item.status === "blocked").length,
        parcels: toImport.reduce((sum, item) => sum + item.row.units.length, 0),
        sourceIds: importedSourceIds,
      };
    });

    res.status(201).json({
      ...result,
      message: result.imported > 0
        ? `${result.imported} membre(s) importé(s) en attente de validation`
        : "Aucun nouveau membre importé",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant l'import";
    req.log.error({ err: error }, "importMembres");
    res.status(400).json({ erreur: message });
  }
}