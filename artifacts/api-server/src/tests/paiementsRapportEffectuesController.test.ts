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

  it("retourne les règlements des livraisons, du carburant et des véhicules avec leur total", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          cooperativeNom: "COOBEPA",
          itemId: "paiement-ligne-10",
          dateReglement: "2026-01-05",
          typeOperation: "livraison",
          dateOperation: "2025-12-20",
          referenceOperation: "LIV-2025-10",
          beneficiaire: "Awa Kouassi",
          description: null,
          village: "Abbé",
          modePaiement: "especes",
          referencePaiement: "REC-10",
          montantFcfa: "6000",
        },
        {
          cooperativeNom: "COOBEPA",
          itemId: "paiement-ligne-12",
          dateReglement: "2026-01-08",
          typeOperation: "carburant",
          dateOperation: "2026-01-06",
          referenceOperation: "BON-12",
          beneficiaire: "Station Abidjan",
          description: "gasoil · mission",
          village: null,
          modePaiement: "orange_money",
          referencePaiement: "REC-12",
          montantFcfa: "4000",
        },
        {
          cooperativeNom: "COOBEPA",
          itemId: "paiement-ligne-13",
          dateReglement: "2026-01-10",
          typeOperation: "depense_vehicule",
          dateOperation: "2026-01-09",
          referenceOperation: "PIECE-13",
          beneficiaire: "Garage K",
          description: "Réparation",
          village: null,
          modePaiement: "virement",
          referencePaiement: "VIR-13",
          montantFcfa: "5000",
        },
        {
          cooperativeNom: "COOBEPA",
          itemId: "cheque-11",
          dateReglement: "2026-01-20",
          typeOperation: "livraison",
          dateOperation: "2025-12-20",
          referenceOperation: "LIV-2025-10",
          beneficiaire: "Awa Kouassi",
          description: null,
          village: "Abbé",
          modePaiement: "cheque",
          referencePaiement: "CHQ-11",
          montantFcfa: "2500",
        },
      ],
    });
    const res = response();

    await getPaiementsRapportEffectues(
      request({
        date_debut: "2026-01-01",
        date_fin: "2026-01-31",
        cooperative_id: "999",
      }, { id: 19, role: "directeur", cooperativeId: 42 }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      cooperativeNom: "COOBEPA",
      dateDebut: "2026-01-01",
      dateFin: "2026-01-31",
      nombreReglements: 4,
      totalMontantRegleFcfa: 17500,
      items: [
        {
          id: "paiement-ligne-10",
          dateReglement: "2026-01-05",
          typeOperation: "livraison",
          dateOperation: "2025-12-20",
          referenceOperation: "LIV-2025-10",
          beneficiaire: "Awa Kouassi",
          description: null,
          village: "Abbé",
          modePaiement: "especes",
          referencePaiement: "REC-10",
          montantFcfa: 6000,
        },
        {
          id: "paiement-ligne-12",
          dateReglement: "2026-01-08",
          typeOperation: "carburant",
          dateOperation: "2026-01-06",
          referenceOperation: "BON-12",
          beneficiaire: "Station Abidjan",
          description: "gasoil · mission",
          village: null,
          modePaiement: "orange_money",
          referencePaiement: "REC-12",
          montantFcfa: 4000,
        },
        {
          id: "paiement-ligne-13",
          dateReglement: "2026-01-10",
          typeOperation: "depense_vehicule",
          dateOperation: "2026-01-09",
          referenceOperation: "PIECE-13",
          beneficiaire: "Garage K",
          description: "Réparation",
          village: null,
          modePaiement: "virement",
          referencePaiement: "VIR-13",
          montantFcfa: 5000,
        },
        {
          id: "cheque-11",
          dateReglement: "2026-01-20",
          typeOperation: "livraison",
          dateOperation: "2025-12-20",
          referenceOperation: "LIV-2025-10",
          beneficiaire: "Awa Kouassi",
          description: null,
          village: "Abbé",
          modePaiement: "cheque",
          referencePaiement: "CHQ-11",
          montantFcfa: 2500,
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
    expect(sqlText).toContain("p.bon_carburant_id IS NOT NULL");
    expect(sqlText).toContain("p.depense_vehicule_id IS NOT NULL");
    expect(sqlText).toContain("b.date_utilisation");
    expect(sqlText).toContain("d.reference_piece");
    expect(sqlText).toContain("ch.date_encaissement");
    expect(sqlText).toContain("COALESCE(l.cooperative_id, b.cooperative_id, d.cooperative_id) = ");
    expect(sqlText).toContain('reglement_event."referenceOperation" ASC NULLS LAST');
    expect(sqlText).not.toContain('reglement_event."numeroLivraison"');
    expect(sqlText).toContain("m.delegue_id");
    expect(query.values).toContain(42);
    expect(query.values).not.toContain(999);
  });

  it("conserve le périmètre du délégué et renvoie un rapport vide", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{
        cooperativeNom: "COOBEPA",
        itemId: null,
        dateReglement: null,
        typeOperation: null,
        dateOperation: null,
        referenceOperation: null,
        beneficiaire: null,
        description: null,
        village: null,
        modePaiement: null,
        referencePaiement: null,
        montantFcfa: null,
      }],
    });
    const res = response();

    await getPaiementsRapportEffectues(
      request(undefined, { id: 19, role: "delegue", cooperativeId: 42 }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      cooperativeNom: "COOBEPA",
      nombreReglements: 0,
      totalMontantRegleFcfa: 0,
      items: [],
    }));
    const query = mocks.execute.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join("")).toContain("m.delegue_id");
    expect(query.strings.join("")).toContain("::integer IS NOT NULL");
    expect(query.values).toContain(true);
    expect(query.values).toContain(19);
  });
});
