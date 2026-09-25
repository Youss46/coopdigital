import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import zlib from "zlib";

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(),
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

const { genererJournalExcel, genererRapportPdf, listSessions } = await import("../services/caisseService.js");

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
    enregistre_par_nom: "Kouassi Awa",
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
  {
    id: 20,
    type: "sortie",
    motif: "paiement_producteur",
    montant_fcfa: "25000",
    libelle: "Paiement producteur — règlement REC-20",
    reference_operation: "PAI-20",
    solde_apres_fcfa: "643235.50",
    date_operation: "2026-08-30",
    created_at: "2026-08-30T10:00:00.000Z",
    enregistre_par_nom: "Koffi Awa",
    session_id: 6,
    beneficiaire_nom: "Coulibaly Amani",
    session_statut: "fermee",
    date_session: "2026-08-30",
  },
  {
    id: 21,
    type: "sortie",
    motif: "avance",
    montant_fcfa: "15000",
    libelle: "Avance – Koffi Mariam",
    reference_operation: "AVA-43",
    solde_apres_fcfa: "628235.50",
    date_operation: "2026-08-30",
    created_at: "2026-08-30T11:00:00.000Z",
    enregistre_par_nom: "Koffi Awa",
    session_id: 6,
    beneficiaire_nom: "Koffi Mariam",
    session_statut: "fermee",
    date_session: "2026-08-30",
  },
  {
    id: 22,
    type: "sortie",
    motif: "avance",
    montant_fcfa: "10000",
    libelle: "Avance délégué – Yao Serge (AVD-8)",
    reference_operation: "AVD-8",
    solde_apres_fcfa: "618235.50",
    date_operation: "2026-08-30",
    created_at: "2026-08-30T12:00:00.000Z",
    enregistre_par_nom: "Koffi Awa",
    session_id: 6,
    beneficiaire_nom: "Yao Serge",
    session_statut: "fermee",
    date_session: "2026-08-30",
  },
  {
    id: 23,
    type: "sortie",
    motif: "paiement_producteur",
    montant_fcfa: "8000",
    libelle: "Paiement producteur — règlement REC-21",
    reference_operation: "PAI-21",
    solde_apres_fcfa: "610235.50",
    date_operation: "2026-08-30",
    created_at: "2026-08-30T13:00:00.000Z",
    enregistre_par_nom: "Koffi Awa",
    session_id: 6,
    beneficiaire_nom: "Fournisseur Externe Issa",
    session_statut: "fermee",
    date_session: "2026-08-30",
  },
];

function rowValues(worksheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  return Array.from({ length: 8 }, (_, index) => worksheet.getCell(rowNumber, index + 1).value);
}

function extractPdfText(buffer: Buffer): string {
  const text: string[] = [buffer.toString("latin1")];
  let position = 0;
  while (position < buffer.length) {
    let marker = buffer.indexOf(Buffer.from("stream\r\n"), position);
    let delimiterLength = 8;
    const unixMarker = buffer.indexOf(Buffer.from("stream\n"), position);
    if (marker === -1 || (unixMarker !== -1 && unixMarker < marker)) {
      marker = unixMarker;
      delimiterLength = 7;
    }
    if (marker === -1) break;
    const end = buffer.indexOf(Buffer.from("endstream"), marker + delimiterLength);
    if (end === -1) break;
    try {
      const stream = zlib.inflateSync(buffer.subarray(marker + delimiterLength, end)).toString("latin1");
      for (const match of stream.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
        const chunks = [...match[1]!.matchAll(/<([0-9A-Fa-f]+)>/g)]
          .map((chunk) => Buffer.from(chunk[1]!, "hex").toString("latin1"));
        text.push(chunks.join(""));
      }
      for (const match of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        text.push(Buffer.from(match[1]!, "hex").toString("latin1"));
      }
    } catch {
      // Les flux non compressés sont déjà couverts par le contenu brut.
    }
    position = end + 9;
  }
  return text.join("");
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
    expect(queryText).toContain(
      "concat_ws(' ', NULLIF(BTRIM(u.nom), ''), NULLIF(BTRIM(u.prenoms), '')) AS enregistre_par_nom",
    );
    expect(queryText).toContain(
      "NULLIF(concat_ws(' ', NULLIF(BTRIM(beneficiaire.nom), ''), NULLIF(BTRIM(beneficiaire.prenoms), '')), '')",
    );
    expect(queryText).toContain("beneficiaire.id = p.membre_id");
    expect(queryText).toContain("beneficiaire.cooperative_id = m.cooperative_id");
    expect(queryText).toContain("livraison_paiement.id = p.livraison_id");
    expect(queryText).toContain("livraison_paiement.cooperative_id = m.cooperative_id");
    expect(queryText).toContain("beneficiaire_livraison_membre.id = livraison_paiement.membre_id");
    expect(queryText).toContain("beneficiaire_fournisseur.id = livraison_paiement.fournisseur_id");
    expect(queryText).toContain("beneficiaire_fournisseur.cooperative_id = m.cooperative_id");
    expect(queryText).toContain("m.reference_operation = ('AVA-' || avance_membre.id::text)");
    expect(queryText).toContain("m.reference_operation = ('AVD-' || avance_delegue.id::text)");
    expect(queryText).toContain("avance_delegue.cooperative_id = m.cooperative_id");
    expect(queryText).toContain("beneficiaire_avance_delegue.cooperative_id = m.cooperative_id");
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
      "Bénéficiaire",
      "Libellé",
      "Opérateur",
      "Montant FCFA",
      "Solde après FCFA",
    ]);
    expect(rowValues(worksheet!, 2)).toEqual([
      "2026-08-28",
      "Entrée",
      "retrait banque",
      "",
      "Retrait du compte principal",
      "Kouassi Awa",
      125000,
      625000,
    ]);
    expect(rowValues(worksheet!, 3)).toEqual([
      "2026-08-29",
      "Entrée",
      "remboursement",
      "",
      "Remboursement avance AVA-42",
      "Auteur Intégration",
      43210.5,
      668210.5,
    ]);
    expect(rowValues(worksheet!, 4)).toEqual([
      "2026-08-30",
      "Entrée",
      "remboursement",
      "",
      "Remboursement historique",
      "Système",
      25,
      668235.5,
    ]);
    expect(rowValues(worksheet!, 5)).toEqual([
      "2026-08-30",
      "Sortie",
      "paiement producteur",
      "Coulibaly Amani",
      "Paiement producteur — règlement REC-20",
      "Koffi Awa",
      25000,
      643235.5,
    ]);
    expect(rowValues(worksheet!, 6)).toEqual([
      "2026-08-30",
      "Sortie",
      "avance",
      "Koffi Mariam",
      "Avance – Koffi Mariam",
      "Koffi Awa",
      15000,
      628235.5,
    ]);
    expect(rowValues(worksheet!, 7)).toEqual([
      "2026-08-30",
      "Sortie",
      "avance",
      "Yao Serge",
      "Avance délégué – Yao Serge (AVD-8)",
      "Koffi Awa",
      10000,
      618235.5,
    ]);
    expect(rowValues(worksheet!, 8)).toEqual([
      "2026-08-30",
      "Sortie",
      "paiement producteur",
      "Fournisseur Externe Issa",
      "Paiement producteur — règlement REC-21",
      "Koffi Awa",
      8000,
      610235.5,
    ]);
  });
});

describe("noms des opérateurs des sessions de caisse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie les noms et prénoms des opérateurs d'ouverture et de fermeture", async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [{
        id: 21,
        ouvert_par_nom: "Kouassi Awa",
        ferme_par_nom: "Yao Serge",
      }],
    });

    const sessions = await listSessions(12);
    const query = mockDb.execute.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const queryText = query.strings.join("?");

    expect(queryText).toContain(
      "concat_ws(' ', NULLIF(BTRIM(u1.nom), ''), NULLIF(BTRIM(u1.prenoms), '')) AS ouvert_par_nom",
    );
    expect(queryText).toContain(
      "concat_ws(' ', NULLIF(BTRIM(u2.nom), ''), NULLIF(BTRIM(u2.prenoms), '')) AS ferme_par_nom",
    );
    expect(queryText).toContain("GROUP BY s.id, u1.nom, u1.prenoms, u2.nom, u2.prenoms");
    expect(sessions[0]).toMatchObject({
      ouvert_par_nom: "Kouassi Awa",
      ferme_par_nom: "Yao Serge",
    });
  });
});

describe("bénéficiaire du paiement dans le rapport PDF de caisse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inclut le nom complet du producteur dans le PDF", async () => {
    const caisseQuery = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    caisseQuery.from.mockReturnValue(caisseQuery);
    caisseQuery.where.mockReturnValue(caisseQuery);
    caisseQuery.limit.mockResolvedValue([{
      id: 12,
      cooperativeId: 9,
      nom: "Caisse centrale",
      soldeActuelFcfa: "48000",
    }]);
    mockDb.select.mockReturnValue(caisseQuery);
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 51,
            type: "sortie",
            motif: "paiement_producteur",
            montant_fcfa: "2000",
            libelle: "Paiement producteur — règlement REC-51",
            reference_operation: "PAI-51",
            solde_apres_fcfa: "48000",
            date_operation: "2026-09-24",
            created_at: "2026-09-24T08:00:00.000Z",
            enregistre_par_nom: "Operateur Test",
            session_id: 6,
            beneficiaire_nom: "Fofana Awa",
            session_statut: "ouverte",
            date_session: "2026-09-24",
          },
          {
            id: 52,
            type: "sortie",
            motif: "avance",
            montant_fcfa: "5000",
            libelle: "Avance – Toure Issa",
            reference_operation: "AVA-52",
            solde_apres_fcfa: "43000",
            date_operation: "2026-09-24",
            created_at: "2026-09-24T08:30:00.000Z",
            enregistre_par_nom: "Operateur Test",
            session_id: 6,
            beneficiaire_nom: "Toure Issa",
            session_statut: "ouverte",
            date_session: "2026-09-24",
          },
          {
            id: 53,
            type: "sortie",
            motif: "paiement_producteur",
            montant_fcfa: "3000",
            libelle: "Paiement producteur — règlement REC-53",
            reference_operation: "PAI-53",
            solde_apres_fcfa: "40000",
            date_operation: "2026-09-24",
            created_at: "2026-09-24T09:00:00.000Z",
            enregistre_par_nom: "Operateur Test",
            session_id: 6,
            beneficiaire_nom: "Fournisseur Toure",
            session_statut: "ouverte",
            date_session: "2026-09-24",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ nom: "Cooperative Test" }] })
      .mockResolvedValueOnce({ rows: [] });

    const pdf = await genererRapportPdf(12, {
      dateDebut: "2026-09-24",
      dateFin: "2026-09-24",
    });
    const text = extractPdfText(pdf);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(text).toContain("Bénéficiaire");
    expect(text).toContain("paiement producteur");
    expect(text).toContain("Fofana");
    expect(text).toContain("Awa");
    expect(text).toContain("Toure");
    expect(text).toContain("Issa");
    expect(text).toContain("Fournisseur");
  });
});