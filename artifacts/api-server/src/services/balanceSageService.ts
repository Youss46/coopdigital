import crypto from "node:crypto";
import * as XLSX from "xlsx";

export type BalanceSageMapping = {
  numeroCompte: number;
  libelle: number;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur?: number;
  soldeCrediteur?: number;
};

export type BalanceSageRow = {
  numeroLigne: number;
  numeroCompte: string;
  libelle: string;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
  erreur: string | null;
};

const clean = (value: unknown): string => String(value ?? "").trim();

function amount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = clean(value).replace(/\u00a0/g, " ").replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") && raw.includes(".")
    ? (raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""))
    : raw.replace(",", ".");
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normaliseRows(rawRows: unknown[][], mapping: BalanceSageMapping): BalanceSageRow[] {
  const result: BalanceSageRow[] = [];
  rawRows.forEach((raw, index) => {
    const values = raw.map(clean);
    if (values.every((value) => !value)) return;
    const numeroCompte = clean(raw[mapping.numeroCompte]);
    const libelle = clean(raw[mapping.libelle]);
    if (index === 0 && /compte|account|num[ée]ro/i.test(numeroCompte) && /libell[ée]|intitul[ée]|description/i.test(libelle)) return;
    const totalDebit = amount(raw[mapping.totalDebit]);
    const totalCredit = amount(raw[mapping.totalCredit]);
    const debitMapped = mapping.soldeDebiteur !== undefined ? amount(raw[mapping.soldeDebiteur]) : null;
    const creditMapped = mapping.soldeCrediteur !== undefined ? amount(raw[mapping.soldeCrediteur]) : null;
    const erreurs: string[] = [];
    if (!numeroCompte) erreurs.push("Numéro de compte manquant");
    if (numeroCompte.length > 20) erreurs.push("Numéro de compte trop long");
    if (!libelle) erreurs.push("Libellé manquant");
    if (totalDebit === null) erreurs.push("Mouvement débit invalide");
    if (totalCredit === null) erreurs.push("Mouvement crédit invalide");
    const debit = totalDebit ?? 0;
    const credit = totalCredit ?? 0;
    const soldeDebiteur = debitMapped ?? Math.max(debit - credit, 0);
    const soldeCrediteur = creditMapped ?? Math.max(credit - debit, 0);
    if (debitMapped === null && mapping.soldeDebiteur !== undefined) erreurs.push("Solde débiteur invalide");
    if (creditMapped === null && mapping.soldeCrediteur !== undefined) erreurs.push("Solde créditeur invalide");
    if (debit < 0 || credit < 0 || soldeDebiteur < 0 || soldeCrediteur < 0) erreurs.push("Les montants ne peuvent pas être négatifs");
    result.push({
      numeroLigne: index + 1,
      numeroCompte,
      libelle,
      totalDebit: debit,
      totalCredit: credit,
      soldeDebiteur,
      soldeCrediteur,
      erreur: erreurs.length ? erreurs.join(" ; ") : null,
    });
  });
  const seen = new Set<string>();
  for (const row of result) {
    if (row.numeroCompte && seen.has(row.numeroCompte)) {
      row.erreur = [row.erreur, "Compte en doublon dans la balance"].filter(Boolean).join(" ; ");
    }
    if (row.numeroCompte) seen.add(row.numeroCompte);
  }
  return result;
}

export function parseBalanceSage(
  buffer: Buffer,
  originalname: string,
  mapping?: BalanceSageMapping,
): {
  empreinte: string;
  feuille: string;
  headers: string[];
  preview: unknown[][];
  rows: BalanceSageRow[];
  rawRows: unknown[][];
  mappingSuggere: BalanceSageMapping;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const feuille = workbook.SheetNames[0];
  if (!feuille) throw new Error("Le fichier ne contient aucune feuille");
  const rawRows = (XLSX.utils.sheet_to_json(workbook.Sheets[feuille]!, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][]).filter((row) => row.some((cell) => clean(cell)));
  if (!rawRows.length) throw new Error("La feuille Sage est vide");
  const headers = rawRows[0]!.map((_value, index) => `Colonne ${index + 1}`);
  const mappingSuggere: BalanceSageMapping = {
    numeroCompte: 0,
    libelle: 1,
    totalDebit: Math.min(4, Math.max(0, headers.length - 4)),
    totalCredit: Math.min(5, Math.max(0, headers.length - 3)),
    soldeDebiteur: headers.length > 6 ? 6 : undefined,
    soldeCrediteur: headers.length > 7 ? 7 : undefined,
  };
  const selected = mapping ?? mappingSuggere;
  const rows = normaliseRows(rawRows, selected);
  return {
    empreinte: crypto.createHash("sha256").update(buffer).digest("hex"),
    feuille,
    headers,
    preview: rawRows.slice(0, 12),
    rows,
    rawRows,
    mappingSuggere,
  };
}