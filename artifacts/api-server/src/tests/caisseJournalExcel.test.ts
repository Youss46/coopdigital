import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const mockDb = {
  execute: vi.fn(),
};

const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
  strings: Array.from(strings),
  values,
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    _: { name },
    id: {},
    cooperativeId: {},
    caisseId: {},
    sessionId: {},
    actif: {},
  });

  return {
    db: mockDb,
    caissesTable: table("caisses"),
    sessionsCaisseTable: table("sessions_caisse"),
    mouvementsCaisseTable: table("mouvements_caisse"),
    comptesMobilesMarchandsTable: table("comptes_mobiles_marchands"),
    mouvementsMobileMarchandTable: table("mouvements_mobile_marchand"),
    comptesBancairesTable: table("comptes_bancaires"),
    mouvementsBanqueTable: table("mouvements_banque"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  sql,
}));

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcriture: vi.fn(),
  proposerEcrituresDansTransaction: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../services/pdfHeaderService.js", () => ({
  drawHeader: vi.fn(),
  drawFooter: vi.fn(),
}));

const { genererJournalExcel } = await import("../services/caisseService.js");

const mouvements = [
  {
    id: 17,
    type: "entree",
    motif: "retrait_banque",
    montant_fcfa: "125000",
    libelle: "Retrait du compte principal",
    reference_operation: null,
    solde_apres_fcfa: "625000",
    date_operation: "2026-08-28",
    created_at: "2026-08-28T08:00:00.000Z",
    enregistre_par_nom: "Kouassi",
    session_id: 4,
    session_statut: "fermee",
    date_session: "2026-08-28",
  },
  {
    id: 18,
    type: "entree",
    motif: "remboursement",
    montant_fcfa: "43210.50",
    libelle: "Remboursement avance AVA-42",
    reference_operation: "AVA-42-RMB-7",
    solde_apres_fcfa: "668210.50",
    date_operation: "2026-08-29",
    created_at: "2026-08-29T09:00:00.000Z",
    enregistre_par_nom: "Auteur Intégration",
    session_id: 5,
    session_statut: "ouverte",
    date_session: "2026-08-29",
  },
  {
    id: 19,
    type: "entree",
    motif: "remboursement",
    montant_fcfa: "25",
    libelle: "Remboursement historique",
    reference_operation: "HIST-AVA-42",
    solde_apres_fcfa: "668235.50",
    date_operation: "2026-08-30",
    created_at: "2026-08-30T09:00:00.000Z",
    enregistre_par_nom: null,
    session_id: 6,
    session_statut: "fermee",
    date_session: "2026-08-30",
  },
];

function rowValues(worksheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  return Array.from({ length: 7 }, (_, index) => worksheet.getCell(rowNumber, index + 1).value);
}

describe("export tableur du journal de caisse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.execute.mockResolvedValue({
      rows: mouvements,
    });
  });

  it("respecte le filtre de date et le tri du journal", async () => {
    const buffer = await genererJournalExcel(12, {
      dateDebut: "2026-08-28",
      dateFin: "2026-08-30",
    });

    expect(mockDb.execute).toHaveBeenCalledOnce();
    const query = mockDb.execute.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const queryText = query.strings.join("?");
    expect(queryText).toContain("m.date_operation BETWEEN");
    expect(queryText).toContain("LEFT JOIN users u ON u.id = m.enregistre_par");
    expect(queryText).toContain("u.nom AS enregistre_par_nom");
    expect(queryText).toContain("ORDER BY m.date_operation, m.id");
    expect(query.values).toEqual([12, "2026-08-28", "2026-08-30"]);

    const workbook = new ExcelJS.Workbook();
    await (workbook.xlsx.load as (input: any) => Promise<ExcelJS.Workbook>)(buffer);
    const worksheet = workbook.getWorksheet("Journal de caisse");

    expect(worksheet).toBeDefined();
    expect(rowValues(worksheet!, 1)).toEqual([
      "Date comptable",
      "Type",
      "Motif",
      "Libellé",
      "Opérateur",
      "Montant FCFA",
      "Solde après FCFA",
    ]);
    expect(rowValues(worksheet!, 2)).toEqual([
      "2026-08-28",
      "Entrée",
      "retrait banque",
      "Retrait du compte principal",
      "Kouassi",
      125000,
      625000,
    ]);
    expect(rowValues(worksheet!, 3)).toEqual([
      "2026-08-29",
      "Entrée",
      "remboursement",
      "Remboursement avance AVA-42",
      "Auteur Intégration",
      43210.5,
      668210.5,
    ]);
    expect(rowValues(worksheet!, 4)).toEqual([
      "2026-08-30",
      "Entrée",
      "remboursement",
      "Remboursement historique",
      "Système",
      25,
      668235.5,
    ]);
  });
});