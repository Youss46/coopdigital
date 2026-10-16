import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values,
  }),
}));

import { getPaiementsRapportEffectues } from "../controllers/paiementsRapportEffectuesController.js";

function request(
  query: Record<string, string> = {
    date_debut: "2026-01-01",
    date_fin: "2026-01-31",
  },
  user: { id: number; role: string; cooperativeId: number | null } = {
    id: 7,
    role: "directeur",
    cooperativeId: 42,
  },
): Request {
  return { query, user, log: { error: vi.fn() } } as unknown as Request;
}

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

describe("rapport des règlements effectivement réalisés", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("refuse une période invalide avant toute requête", async () => {
    const res = response();

    await getPaiementsRapportEffectues(
      request({ date_debut: "2026-01-31", date_fin: "2026-01-01" }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erreur: "Sélectionnez une période valide avec les dates au format AAAA-MM-JJ.",
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("retourne les paiements immédiats et les chèques encaissés avec leur total", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          cooperativeNom: "COOBEPA",
          itemId: "paiement-10",
          dateReglement: "2026-01-05",
          dateLivraison: "2025-12-20",
          numeroLivraison: "LIV-2025-10",
          producteur: "Awa Kouassi",
          village: "Abbé",
          modePaiement: "especes",
          referencePaiement: "REC-10",
          montantFcfa: "6000",
        },
        {
          cooperativeNom: "COOBEPA",
          itemId: "cheque-11",
          dateReglement: "2026-01-20",
          dateLivraison: "2025-12-20",
          numeroLivraison: "LIV-2025-10",
          producteur: "Awa Kouassi",
          village: "Abbé",
          modePaiement: "cheque",
          referencePaiement: "CHQ-11",
          montantFcfa: "3000",
        },
      ],
    });
    const res = response();

    await getPaiementsRapportEffectues(
      request({
        date_debut: "2026-01-01",
        date_fin: "2026-01-31",
        cooperative_id: "999",
      }, { id: 19, role: "delegue", cooperativeId: 42 }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      cooperativeNom: "COOBEPA",
      dateDebut: "2026-01-01",
      dateFin: "2026-01-31",
      nombreReglements: 2,
      totalMontantRegleFcfa: 9000,
      items: [
        {
          id: "paiement-10",
          dateReglement: "2026-01-05",
          dateLivraison: "2025-12-20",
          numeroLivraison: "LIV-2025-10",
          producteur: "Awa Kouassi",
          village: "Abbé",
          modePaiement: "especes",
          referencePaiement: "REC-10",
          montantFcfa: 6000,
        },
        {
          id: "cheque-11",
          dateReglement: "2026-01-20",
          dateLivraison: "2025-12-20",
          numeroLivraison: "LIV-2025-10",
          producteur: "Awa Kouassi",
          village: "Abbé",
          modePaiement: "cheque",
          referencePaiement: "CHQ-11",
          montantFcfa: 3000,
        },
      ],
    }));

    const query = mocks.execute.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const sqlText = query.strings.join("");
    expect(sqlText).toContain("p.statut IN ('confirme', 'effectue', 'en_cours')");
    expect(sqlText).toContain("pl.mode_paiement <> 'cheque'");
    expect(sqlText).toContain("ch.statut = 'encaisse'");
    expect(sqlText).toContain("COALESCE(p.date_validation, p.created_at)::date");
    expect(sqlText).toContain("ch.date_encaissement");
    expect(sqlText).toContain("l.cooperative_id = ");
    expect(sqlText).toContain("m.delegue_id");
    expect(query.values).toContain(42);
    expect(query.values).toContain(19);
    expect(query.values).not.toContain(999);
  });
});
