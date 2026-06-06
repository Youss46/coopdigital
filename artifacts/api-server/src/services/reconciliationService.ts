import { db, relevesBancairesTable, lignesReleveTable, ecrituresComptablesTable } from "@workspace/db";
import { eq, and, sql, between, or, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";

const COOP_ID = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LigneImportee {
  date_operation: string;
  libelle_banque: string;
  montant_fcfa: number;
  type: "debit" | "credit";
  reference_banque?: string;
}

// ─── Détection colonnes CSV/Excel ─────────────────────────────────────────────

function detecterColonnes(headers: string[]): Record<string, number> {
  const h = headers.map(h => String(h ?? "").toLowerCase().trim());

  const find = (...patterns: string[]): number =>
    h.findIndex(col => patterns.some(p => col.includes(p)));

  return {
    date:      find("date", "dt", "jour"),
    libelle:   find("libellé", "libelle", "description", "motif", "detail", "opération", "operation"),
    debit:     find("débit", "debit", "retrait", "sortie", "dépense"),
    credit:    find("crédit", "credit", "versement", "entrée", "recette"),
    montant:   find("montant", "valeur", "amount"),
    reference: find("référence", "reference", "ref", "n°", "numero", "num"),
    type:      find("type", "sens", "nature"),
  };
}

// ─── Parser CSV ───────────────────────────────────────────────────────────────

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const sep = content.includes(";") ? ";" : ",";
  const lines = content
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n")
    .filter(l => l.trim());

  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let inQuote = false, current = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === '"') { inQuote = !inQuote; }
      else if (c === sep && !inQuote) { result.push(current.trim()); current = ""; }
      else { current += c; }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]!);
  const rows    = lines.slice(1).map(parseRow);
  return { headers, rows };
}

// ─── Normaliser une valeur monétaire ─────────────────────────────────────────

function parseMontant(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const s = String(v).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Math.abs(parseFloat(s) || 0);
}

// ─── Normaliser une date ──────────────────────────────────────────────────────

function parseDate(v: string | number | undefined): string | null {
  if (!v && v !== 0) return null;
  // Excel serial → Date
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // dd/mm/yyyy ou dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${String(m1[2]).padStart(2,"0")}-${String(m1[1]).padStart(2,"0")}`;
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  // mm/dd/yyyy
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m3) {
    const yr = m3[3]!.length === 2 ? "20" + m3[3] : m3[3];
    return `${yr}-${String(m3[1]).padStart(2,"0")}-${String(m3[2]).padStart(2,"0")}`;
  }
  // Try native parser
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// ─── Convertir lignes brutes → LigneImportee[] ───────────────────────────────

function convertirLignes(
  headers: string[],
  rows: (string | number | undefined)[][],
  colMap: Record<string, number>,
  userMapping?: Record<string, string>,
): { lignes: LigneImportee[]; erreurs: string[] } {
  const erreurs: string[] = [];
  const lignes: LigneImportee[] = [];

  // Résoudre le mapping (auto ou manuel)
  const col = (key: string): number => {
    if (userMapping?.[key] !== undefined) {
      return headers.findIndex(h => h === userMapping[key]);
    }
    return colMap[key] ?? -1;
  };

  const dateIdx    = col("date");
  const libelleIdx = col("libelle");
  const debitIdx   = col("debit");
  const creditIdx  = col("credit");
  const montantIdx = col("montant");
  const refIdx     = col("reference");
  const typeIdx    = col("type");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rawDate = dateIdx >= 0 ? row[dateIdx] : undefined;
    const dateStr = parseDate(rawDate);
    if (!dateStr) { erreurs.push(`Ligne ${i + 2}: date invalide (${rawDate})`); continue; }

    const libelle = libelleIdx >= 0 ? String(row[libelleIdx] ?? "").trim() : "";
    if (!libelle) { erreurs.push(`Ligne ${i + 2}: libellé vide`); continue; }

    let montant = 0;
    let type: "debit" | "credit" = "credit";

    if (debitIdx >= 0 && creditIdx >= 0) {
      const debit  = parseMontant(row[debitIdx]);
      const credit = parseMontant(row[creditIdx]);
      if (debit > 0)  { montant = debit;  type = "debit"; }
      else            { montant = credit; type = "credit"; }
    } else if (montantIdx >= 0) {
      montant = parseMontant(row[montantIdx]);
      if (typeIdx >= 0) {
        const t = String(row[typeIdx] ?? "").toLowerCase();
        type = t.includes("deb") || t.includes("ret") || t.includes("sor") ? "debit" : "credit";
      }
    }

    if (montant === 0) continue; // ligne vide / entête intermédiaire

    lignes.push({
      date_operation:  dateStr,
      libelle_banque:  libelle,
      montant_fcfa:    Math.round(montant),
      type,
      reference_banque: refIdx >= 0 ? String(row[refIdx] ?? "").trim() || undefined : undefined,
    });
  }

  return { lignes, erreurs };
}

// ─── Import CSV ───────────────────────────────────────────────────────────────

export function parseFileBuffer(buffer: Buffer, mimetype: string, originalname: string)
  : { headers: string[]; preview: (string | number | undefined)[][]; rows: (string | number | undefined)[][] } {

  const isXlsx = mimetype.includes("excel") || mimetype.includes("spreadsheet")
    || originalname.endsWith(".xlsx") || originalname.endsWith(".xls");

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    const raw = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(ws, {
      header: 1, defval: undefined, blankrows: false,
    });
    const headers = (raw[0] ?? []).map(v => String(v ?? ""));
    const rows    = raw.slice(1) as (string | number | undefined)[][];
    return { headers, preview: rows.slice(0, 5), rows };
  }

  // CSV
  const content = buffer.toString("utf8");
  const { headers, rows } = parseCsv(content);
  const typedRows = rows.map(r => r.map(v => v as string | number | undefined));
  return { headers, preview: typedRows.slice(0, 5), rows: typedRows };
}

// ─── Importer relevé ─────────────────────────────────────────────────────────

export async function importerReleve(opts: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  banque?: string;
  numeroCompte?: string;
  importePar?: number;
  userMapping?: Record<string, string>;
}) {
  const { headers, rows } = parseFileBuffer(opts.buffer, opts.mimetype, opts.originalname);
  const colMap = detecterColonnes(headers);
  const { lignes, erreurs } = convertirLignes(headers, rows, colMap, opts.userMapping);

  if (lignes.length === 0) {
    throw new Error(`Aucune ligne valide importée. ${erreurs.slice(0, 3).join(" | ")}`);
  }

  const dates = lignes.map(l => l.date_operation).sort();
  const debut = dates[0]!;
  const fin   = dates[dates.length - 1]!;

  const [releve] = await db.insert(relevesBancairesTable).values({
    cooperativeId: COOP_ID,
    banque:        opts.banque ?? "Banque",
    numeroCompte:  opts.numeroCompte ?? null,
    periodeDebut:  debut,
    periodeFin:    fin,
    statut:        "importe",
    importePar:    opts.importePar ?? null,
  }).returning();

  if (!releve) throw new Error("Erreur création relevé");

  // Insérer les lignes par batch
  const BATCH = 50;
  for (let i = 0; i < lignes.length; i += BATCH) {
    const batch = lignes.slice(i, i + BATCH);
    await db.insert(lignesReleveTable).values(
      batch.map(l => ({
        releveId:             releve.id,
        dateOperation:        l.date_operation,
        libelleBanque:        l.libelle_banque,
        montantFcfa:          l.montant_fcfa.toString(),
        type:                 l.type,
        referenceBanque:      l.reference_banque ?? null,
        statutReconciliation: "non_reconciliee" as const,
      }))
    );
  }

  return { releve, nb_lignes_importees: lignes.length, erreurs };
}

// ─── Réconciliation automatique ───────────────────────────────────────────────

export async function reconcilierAutomatiquement(releveId: number) {
  const lignes = await db.select().from(lignesReleveTable)
    .where(and(
      eq(lignesReleveTable.releveId, releveId),
      inArray(lignesReleveTable.statutReconciliation, ["non_reconciliee", "a_justifier"]),
    ));

  let nbReconciliees = 0, nbAJustifier = 0, nbNonReconciliees = 0;

  for (const ligne of lignes) {
    const montant    = Math.round(parseFloat(ligne.montantFcfa as string));
    const dateOp     = new Date(ligne.dateOperation + "T00:00:00");
    const dateMoins3 = new Date(dateOp); dateMoins3.setDate(dateMoins3.getDate() - 3);
    const datePlus3  = new Date(dateOp); datePlus3.setDate(datePlus3.getDate() + 3);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Recherche écriture par montant exact + compte banque
    const ecritures = await db.execute<{
      id: number; date_ecriture: string; libelle: string;
      compte_debit: string; compte_credit: string; montant_fcfa: number;
    }>(sql`
      SELECT id, date_ecriture::text, libelle, compte_debit, compte_credit, montant_fcfa
      FROM ecritures_comptables
      WHERE cooperative_id = ${COOP_ID}
        AND ABS(montant_fcfa) = ${montant}
        AND (compte_debit IN ('521','522') OR compte_credit IN ('521','522'))
        AND id NOT IN (
          SELECT ecriture_id FROM lignes_releve
          WHERE ecriture_id IS NOT NULL AND releve_id != ${releveId}
        )
      ORDER BY ABS(date_ecriture::date - ${fmt(dateOp)}::date) ASC
    `);

    if (ecritures.rows.length === 0) {
      await db.update(lignesReleveTable)
        .set({ statutReconciliation: "non_reconciliee" })
        .where(eq(lignesReleveTable.id, ligne.id));
      nbNonReconciliees++;
      continue;
    }

    const premiere = ecritures.rows[0]!;
    const dateEcr  = new Date(premiere.date_ecriture + "T00:00:00");
    const inRange  = dateEcr >= dateMoins3 && dateEcr <= datePlus3;

    if (inRange && ecritures.rows.length === 1) {
      // Correspondance unique dans l'intervalle
      const ecartFcfa = Math.abs(montant - Math.abs(premiere.montant_fcfa));
      await db.update(lignesReleveTable).set({
        statutReconciliation: "reconciliee",
        ecritureId:           premiere.id,
        ecartFcfa:            ecartFcfa.toString(),
      }).where(eq(lignesReleveTable.id, ligne.id));
      nbReconciliees++;
    } else {
      // Montant identique mais plusieurs correspondances ou date décalée
      await db.update(lignesReleveTable).set({
        statutReconciliation: "a_justifier",
        ecritureId:           premiere.id,
      }).where(eq(lignesReleveTable.id, ligne.id));
      nbAJustifier++;
    }
  }

  // Mettre à jour statut du relevé
  const statut = nbNonReconciliees === 0 && nbAJustifier === 0 ? "reconcilie" : "en_cours";
  await db.update(relevesBancairesTable).set({ statut })
    .where(eq(relevesBancairesTable.id, releveId));

  logger.info({ releveId, nbReconciliees, nbAJustifier, nbNonReconciliees }, "Réconciliation automatique");
  return { nb_reconciliees: nbReconciliees, nb_a_justifier: nbAJustifier, nb_non_reconciliees: nbNonReconciliees };
}

// ─── Liste des relevés ────────────────────────────────────────────────────────

export async function listReleves() {
  const result = await db.execute<{
    id: number; banque: string; numero_compte: string; statut: string;
    periode_debut: string; periode_fin: string;
    solde_debut_fcfa: string; solde_fin_fcfa: string;
    created_at: string; importeur_nom: string | null;
    nb_lignes: string; nb_reconciliees: string; nb_non_reconciliees: string;
  }>(sql`
    SELECT
      r.*,
      r.periode_debut::text, r.periode_fin::text, r.created_at::text,
      u.nom || ' ' || u.prenoms AS importeur_nom,
      COUNT(l.id)::text                                                  AS nb_lignes,
      COUNT(l.id) FILTER (WHERE l.statut_reconciliation = 'reconciliee')::text AS nb_reconciliees,
      COUNT(l.id) FILTER (WHERE l.statut_reconciliation = 'non_reconciliee')::text AS nb_non_reconciliees
    FROM releves_bancaires r
    LEFT JOIN users u ON u.id = r.importe_par
    LEFT JOIN lignes_releve l ON l.releve_id = r.id
    WHERE r.cooperative_id = ${COOP_ID}
    GROUP BY r.id, u.nom, u.prenoms
    ORDER BY r.created_at DESC
  `);
  return result.rows;
}

// ─── Détail d'un relevé avec ses lignes ──────────────────────────────────────

export async function getReleve(id: number) {
  const releves = await db.select().from(relevesBancairesTable)
    .where(and(eq(relevesBancairesTable.id, id), eq(relevesBancairesTable.cooperativeId, COOP_ID)));
  if (!releves[0]) return null;

  const lignes = await db.execute<{
    id: number; date_operation: string; libelle_banque: string;
    montant_fcfa: string; type: string; reference_banque: string | null;
    statut_reconciliation: string; ecriture_id: number | null; ecart_fcfa: string;
    motif_ignore: string | null;
    ecriture_libelle: string | null; ecriture_date: string | null;
  }>(sql`
    SELECT
      l.*,
      l.date_operation::text, l.created_at::text,
      e.libelle AS ecriture_libelle,
      e.date_ecriture::text AS ecriture_date
    FROM lignes_releve l
    LEFT JOIN ecritures_comptables e ON e.id = l.ecriture_id
    WHERE l.releve_id = ${id}
    ORDER BY l.date_operation, l.id
  `);

  return { releve: releves[0], lignes: lignes.rows };
}

// ─── Réconciliation manuelle d'une ligne ─────────────────────────────────────

export async function reconcilierManuel(ligneId: number, ecritureId: number) {
  const [ecriture] = await db.execute<{ montant_fcfa: number }>(sql`
    SELECT montant_fcfa FROM ecritures_comptables WHERE id = ${ecritureId}
  `).then(r => r.rows);

  const [ligne] = await db.select().from(lignesReleveTable)
    .where(eq(lignesReleveTable.id, ligneId));
  if (!ligne) throw new Error("Ligne introuvable");

  const montantLigne   = Math.round(parseFloat(ligne.montantFcfa as string));
  const montantEcr     = ecriture ? Math.abs(ecriture.montant_fcfa) : montantLigne;
  const ecart          = Math.abs(montantLigne - montantEcr);

  await db.update(lignesReleveTable).set({
    statutReconciliation: "reconciliee",
    ecritureId,
    ecartFcfa: ecart.toString(),
  }).where(eq(lignesReleveTable.id, ligneId));

  return db.select().from(lignesReleveTable).where(eq(lignesReleveTable.id, ligneId)).then(r => r[0]);
}

// ─── Ignorer une ligne ────────────────────────────────────────────────────────

export async function ignorerLigne(ligneId: number, motif?: string) {
  const [updated] = await db.update(lignesReleveTable).set({
    statutReconciliation: "ignoree",
    motifIgnore: motif ?? null,
    ecritureId:  null,
  }).where(eq(lignesReleveTable.id, ligneId)).returning();
  return updated;
}

// ─── Recherche d'écritures pour autocomplete ─────────────────────────────────

export async function rechercherEcritures(q: string, montant?: number) {
  const result = await db.execute<{
    id: number; date_ecriture: string; libelle: string;
    compte_debit: string; compte_credit: string; montant_fcfa: number;
  }>(sql`
    SELECT id, date_ecriture::text, libelle, compte_debit, compte_credit, montant_fcfa
    FROM ecritures_comptables
    WHERE cooperative_id = ${COOP_ID}
      AND (compte_debit IN ('521','522') OR compte_credit IN ('521','522'))
      ${q ? sql`AND LOWER(libelle) LIKE ${"%" + q.toLowerCase() + "%"}` : sql``}
      ${montant ? sql`AND ABS(montant_fcfa) = ${montant}` : sql``}
    ORDER BY date_ecriture DESC
    LIMIT 20
  `);
  return result.rows;
}

// ─── Rapport PDF ──────────────────────────────────────────────────────────────

export async function genererRapportPdf(releveId: number): Promise<Buffer> {
  const data = await getReleve(releveId);
  if (!data) throw new Error("Relevé introuvable");
  const { releve, lignes } = data;

  const coopNom = await db.execute<{ nom: string }>(
    sql`SELECT nom FROM cooperatives WHERE id = ${COOP_ID} LIMIT 1`
  ).then(r => r.rows[0]?.nom ?? "CoopDigital");

  const FCFA = (n: number | string) =>
    new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

  const doc    = new PDFDocument({ margin: 45, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  await drawHeader(doc, COOP_ID, {
    titre_document: "RAPPORT DE RÉCONCILIATION BANCAIRE",
    reference:      `Relevé #${releve.id} — ${releve.banque ?? "Banque"}`,
    hauteur_reservee: 90,
  });

  const margin = 45, pageW = doc.page.width, cW = pageW - margin * 2;

  doc.moveDown(0.4)
    .font("Helvetica-Bold").fontSize(10).fillColor("#1a4731")
    .text(`Réconciliation bancaire — ${releve.banque ?? "Banque"}${releve.numeroCompte ? ` N°${releve.numeroCompte}` : ""}`, margin, doc.y, { width: cW });
  doc.font("Helvetica").fontSize(8).fillColor("#666666")
    .text(`Période : ${releve.periodeDebut ?? "—"} → ${releve.periodeFin ?? "—"} | Généré le ${new Date().toLocaleDateString("fr-FR")}`, margin, doc.y, { width: cW });
  doc.moveDown(0.5);

  // KPIs
  const nbTotal      = lignes.length;
  const nbReconc     = lignes.filter(l => l.statut_reconciliation === "reconciliee").length;
  const nbAJust      = lignes.filter(l => l.statut_reconciliation === "a_justifier").length;
  const nbNonReconc  = lignes.filter(l => l.statut_reconciliation === "non_reconciliee").length;
  const nbIgnore     = lignes.filter(l => l.statut_reconciliation === "ignoree").length;
  const tauxReconc   = nbTotal > 0 ? Math.round((nbReconc / nbTotal) * 100) : 0;

  const resY = doc.y;
  const col4 = cW / 4;
  [
    { label: "Total lignes", val: String(nbTotal), color: "#1e3a5f" },
    { label: `Réconciliées (${tauxReconc}%)`, val: String(nbReconc), color: "#166534" },
    { label: "À vérifier", val: String(nbAJust), color: "#b45309" },
    { label: "Non réconciliées", val: String(nbNonReconc + nbIgnore), color: "#991b1b" },
  ].forEach(({ label, val, color }, i) => {
    const x = margin + i * col4;
    doc.save().rect(x, resY, col4 - 4, 36).fillColor(color).fill().restore();
    doc.font("Helvetica").fontSize(7).fillColor("#ffffff")
      .text(label, x + 4, resY + 5, { width: col4 - 12, align: "center", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff")
      .text(val, x + 4, resY + 14, { width: col4 - 12, align: "center", lineBreak: false });
  });
  doc.y = resY + 44;
  doc.moveDown(0.8);

  // Tableau lignes
  const headers = ["Date", "Libellé banque", "Type", "Montant", "Statut", "Écriture liée"];
  const colW    = [55, 185, 40, 85, 75, 105];
  let tableY = doc.y;

  const ROWS_PER_PAGE = 32;
  let rowCount = 0;

  doc.save().rect(margin, tableY, cW, 15).fillColor("#1a4731").fill().restore();
  let cx = margin + 3;
  headers.forEach((h, i) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff")
      .text(h, cx, tableY + 4, { width: colW[i]! - 4, lineBreak: false });
    cx += colW[i]!;
  });
  tableY += 15;

  const STATUT_COLOR: Record<string, string> = {
    reconciliee: "#166534", a_justifier: "#b45309",
    non_reconciliee: "#991b1b", ignoree: "#6b7280",
  };
  const STATUT_LABEL: Record<string, string> = {
    reconciliee: "Réconciliée", a_justifier: "À vérifier",
    non_reconciliee: "Non réconciliée", ignoree: "Ignorée",
  };

  for (const [idx, l] of lignes.entries()) {
    if (rowCount > 0 && rowCount % ROWS_PER_PAGE === 0) {
      doc.addPage();
      await drawHeader(doc, COOP_ID, { titre_document: "RÉCONCILIATION (suite)", hauteur_reservee: 60 });
      tableY = doc.y + 8;
    }

    const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
    doc.save().rect(margin, tableY, cW, 13).fillColor(bg).fill().restore();
    const montant = parseFloat(l.montant_fcfa);
    const cols = [
      l.date_operation ?? "—",
      l.libelle_banque.slice(0, 55),
      l.type === "debit" ? "Débit" : "Crédit",
      FCFA(montant),
      STATUT_LABEL[l.statut_reconciliation] ?? l.statut_reconciliation,
      l.ecriture_libelle ? l.ecriture_libelle.slice(0, 30) : "—",
    ];
    cx = margin + 3;
    cols.forEach((v, i) => {
      const color = i === 4 ? STATUT_COLOR[l.statut_reconciliation] ?? "#222" : "#222222";
      const bold  = i === 4;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(6.5).fillColor(color)
        .text(String(v), cx, tableY + 3, { width: colW[i]! - 4, lineBreak: false });
      cx += colW[i]!;
    });
    doc.moveTo(margin, tableY + 13).lineTo(margin + cW, tableY + 13)
      .strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    tableY += 13;
    rowCount++;
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    await drawFooter(doc, COOP_ID, i + 1, range.count);
  }

  doc.end();
  return new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));
}
