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

import { getPaiementsRapportEnAttente } from "../controllers/paiementsRapportController.js";

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
  return {
    query,
    user,
    log: { error: vi.fn() },
  } as unknown as Request;
}

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

describe("rapport des règlements de livraisons en attente", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("refuse une période impossible avant toute requête", async () => {
    const res = response();

    await getPaiementsRapportEnAttente(
      request({ date_debut: "2026-02-30", date_fin: "2026-03-01" }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erreur: "Sélectionnez une période valide avec les dates au format AAAA-MM-JJ.",
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("retourne les lignes en attente et les totaux sans pagination", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{
        cooperativeNom: "COOBEPA",
        livraisonId: 15,
        numeroLivraison: "LIV-2026-15",
        dateLivraison: "2026-01-12",
        producteur: "Awa Kouassi",
        village: "Abbé",
        montantNetFcfa: "12000",
        montantRegleFcfa: "4500",
        montantRestantFcfa: "7500",
      }],
    });
    const res = response();

    await getPaiementsRapportEnAttente(
      request({
        date_debut: "2026-01-01",
        date_fin: "2026-01-31",
        cooperative_id: "99",
      }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      cooperativeNom: "COOBEPA",
      dateDebut: "2026-01-01",
      dateFin: "2026-01-31",
      nombreLivraisons: 1,
      totalMontantNetFcfa: 12000,
      totalMontantRegleFcfa: 4500,
      totalMontantRestantFcfa: 7500,
      items: [{
        livraisonId: 15,
        numeroLivraison: "LIV-2026-15",
        dateLivraison: "2026-01-12",
        producteur: "Awa Kouassi",
        village: "Abbé",
        montantNetFcfa: 12000,
        montantRegleFcfa: 4500,
        montantRestantFcfa: 7500,
      }],
    }));

    const query = mocks.execute.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const sqlText = query.strings.join("");
    expect(sqlText).toContain("DISTINCT ON (l.id)");
    expect(sqlText).toContain("p.statut = 'en_attente'");
    expect(sqlText).toContain("p.bon_carburant_id IS NULL");
    expect(sqlText).toContain("l.date_livraison >= ");
    expect(sqlText).toContain("l.cooperative_id = ");
    expect(query.values).toContain(42);
    expect(query.values).not.toContain(99);
    expect(query.values).toContain("2026-01-01");
    expect(query.values).toContain("2026-01-31");
  });

  it("applique le périmètre du délégué et renvoie un rapport vide avec ses totaux", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{
        cooperativeNom: "COOBEPA",
        livraisonId: null,
        numeroLivraison: null,
        dateLivraison: null,
        producteur: null,
        village: null,
        montantNetFcfa: null,
        montantRegleFcfa: null,
        montantRestantFcfa: null,
      }],
    });
    const res = response();

    await getPaiementsRapportEnAttente(
      request(undefined, { id: 19, role: "delegue", cooperativeId: 42 }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      cooperativeNom: "COOBEPA",
      nombreLivraisons: 0,
      totalMontantNetFcfa: 0,
      totalMontantRegleFcfa: 0,
      totalMontantRestantFcfa: 0,
      items: [],
    }));
    const query = mocks.execute.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join("")).toContain("m.delegue_id");
    expect(query.strings.join("")).toContain("f.cree_par_delegue_id");
    expect(query.strings.join("")).toContain("::integer IS NOT NULL");
    expect(query.values).toContain(true);
    expect(query.values).toContain(19);
  });
});
