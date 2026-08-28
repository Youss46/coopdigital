import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { db } from "@workspace/db";

const { anthropicCreate } = vi.hoisted(() => ({ anthropicCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: anthropicCreate };
    constructor(_options: unknown) {}
  },
}));

import { suggestRegularisations } from "../controllers/comptabiliteController.js";

function chain<T>(rows: T[]) {
  const value: Record<string, unknown> = {};
  value.from = vi.fn(() => value);
  value.where = vi.fn(() => value);
  value.orderBy = vi.fn(() => value);
  value.then = (resolve: (result: T[]) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return value;
}

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function request(body: Record<string, unknown> = {}) {
  return {
    body: { exercice: 2025, situation: "Facture d’électricité de décembre reçue en janvier.", ...body },
    user: { cooperativeId: 42, id: 7 },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Request;
}

function setupDatabase() {
  vi.mocked(db.select)
    .mockReturnValueOnce(chain([{ statut: "ouvert" }]) as never)
    .mockReturnValueOnce(chain([
      { numeroCompte: "408", libelle: "Fournisseurs, factures non parvenues", type: "passif", classe: 4, soldeNormal: "crediteur" },
      { numeroCompte: "601", libelle: "Achats de matières", type: "charge", classe: 6, soldeNormal: "debiteur" },
      { numeroCompte: "476", libelle: "Charges constatées d’avance", type: "actif", classe: 4, soldeNormal: "debiteur" },
      { numeroCompte: "999", libelle: "Compte de test", type: "actif", classe: 9, soldeNormal: "debiteur" },
    ]) as never);
}

describe("suggestRegularisations", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    anthropicCreate.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "managed-test-key");
  });

  it("ne conserve que les écritures dont les deux comptes existent dans le plan actif", async () => {
    setupDatabase();
    anthropicCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify([
          {
            type: "408",
            compteRegul: "408",
            compteContrepartie: "601",
            libelle: "Facture énergie décembre",
            montantFcfa: 125000,
            justification: "La charge concerne décembre et la facture a été reçue après la clôture.",
            score: 91,
          },
          {
            type: "408",
            compteRegul: "9999",
            compteContrepartie: "601",
            libelle: "Compte inventé",
            montantFcfa: 125000,
            justification: "Cette proposition doit être filtrée.",
            score: 99,
          },
          {
            type: "invalide",
            compteRegul: "408",
            compteContrepartie: "601",
            libelle: "Type invalide",
            montantFcfa: 125000,
            justification: "Cette proposition doit être filtrée.",
            score: 80,
          },
          {
            type: "408",
            compteRegul: "408",
            compteContrepartie: "601",
            libelle: "Doublon",
            montantFcfa: 125000,
            justification: "Doublon à exclure.",
            score: 70,
          },
        ]),
      }],
    });
    const res = response();

    await suggestRegularisations(request({ montantFcfa: 125000, periode: "décembre 2025" }), res);

    expect(res.json).toHaveBeenCalledWith({
      disponible: true,
      suggestions: [{
        type: "408",
        typeLibelle: "Charges à payer",
        compteRegul: "408",
        compteRegulLibelle: "Fournisseurs, factures non parvenues",
        compteContrepartie: "601",
        compteContrepartieLibelle: "Achats de matières",
        libelle: "Facture énergie décembre",
        montantFcfa: 125000,
        justification: "La charge concerne décembre et la facture a été reçue après la clôture.",
        score: 91,
      }],
    });
    expect(anthropicCreate).toHaveBeenCalledOnce();
    const prompt = anthropicCreate.mock.calls[0]?.[0] as {
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(prompt.system).toContain("ne jamais en inventer");
    expect(prompt.messages[0]?.content).toContain("408 — Fournisseurs, factures non parvenues");
    expect(prompt.messages[0]?.content).toContain("décembre 2025");
  });

  it("refuse une proposition dont le montant diffère du montant fourni", async () => {
    setupDatabase();
    anthropicCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify([{
          type: "408",
          compteRegul: "408",
          compteContrepartie: "601",
          libelle: "Facture énergie",
          montantFcfa: 100000,
          justification: "Proposition avec un montant différent.",
          score: 85,
        }]),
      }],
    });
    const res = response();

    await suggestRegularisations(request({ montantFcfa: 125000 }), res);

    expect(res.json).toHaveBeenCalledWith({
      disponible: false,
      suggestions: [],
      message: "Claude n’a proposé aucune écriture compatible avec le plan comptable actif. Vous pouvez saisir la régularisation manuellement.",
    });
  });

  it("laisse la saisie manuelle disponible sans clé Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    setupDatabase();
    const res = response();

    await suggestRegularisations(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      disponible: false,
      suggestions: [],
      message: "Suggestion Claude indisponible dans cet environnement. Vous pouvez saisir la régularisation manuellement.",
    });
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("gère une réponse Claude invalide sans bloquer la saisie manuelle", async () => {
    setupDatabase();
    anthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "pas du json" }] });
    const res = response();

    await suggestRegularisations(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      disponible: false,
      suggestions: [],
      message: "La suggestion Claude n’a pas pu aboutir. Vous pouvez saisir la régularisation manuellement.",
    });
  });
});