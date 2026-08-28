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

import { suggestBalanceSageCounterparties } from "../controllers/balanceSageController.js";

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

function request() {
  return {
    params: { id: "12" },
    user: { cooperativeId: 42, id: 7 },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Request;
}

function setupDatabase() {
  vi.mocked(db.select)
    .mockReturnValueOnce(chain([{ id: 12, cooperativeId: 42, exercice: 2025, mode: "reprise" }]) as never)
    .mockReturnValueOnce(chain([
      { numeroCompte: "101", libelle: "Capital", soldeDebiteur: 0, soldeCrediteur: 100000, compteConnu: true, erreur: null },
    ]) as never)
    .mockReturnValueOnce(chain([
      { numeroCompte: "101", libelle: "Capital" },
      { numeroCompte: "110", libelle: "Report à nouveau" },
      { numeroCompte: "999", libelle: "Compte de test" },
    ]) as never);
}

describe("suggestBalanceSageCounterparties", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    anthropicCreate.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "managed-test-key");
  });

  it("ne conserve que les comptes retournés par Claude qui existent dans le plan actif", async () => {
    setupDatabase();
    anthropicCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify([
          { numeroCompte: "9999", score: 99, raison: "Compte inventé à exclure." },
          { numeroCompte: "110", score: 86, raison: "Compte présent dans le plan et cohérent avec une reprise." },
          { numeroCompte: "110", score: 80, raison: "Doublon à exclure." },
        ]),
      }],
    });
    const res = response();

    await suggestBalanceSageCounterparties(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      disponible: true,
      suggestions: [{ numeroCompte: "110", score: 86, raison: "Compte présent dans le plan et cohérent avec une reprise.", libelle: "Report à nouveau" }],
    });
    expect(anthropicCreate).toHaveBeenCalledOnce();
    const prompt = anthropicCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(prompt.messages[0]?.content).toContain("110 — Report à nouveau");
  });

  it("laisse la saisie manuelle disponible sans clé Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    setupDatabase();
    const res = response();

    await suggestBalanceSageCounterparties(request(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      disponible: false,
      suggestions: [],
    }));
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("retourne un état explicite si Claude répond dans un format invalide", async () => {
    setupDatabase();
    anthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "pas du json" }] });
    const res = response();

    await suggestBalanceSageCounterparties(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      disponible: false,
      suggestions: [],
      message: "La suggestion Claude n’a pas pu aboutir. Vous pouvez saisir le compte manuellement.",
    });
  });

  it("analyse une ligne mouvementée dont le compte est absent du plan", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(chain([{ id: 12, cooperativeId: 42, exercice: 2025, mode: "reprise" }]) as never)
      .mockReturnValueOnce(chain([
        {
          numeroCompte: "512",
          libelle: "Banque",
          soldeDebiteur: 75000,
          soldeCrediteur: 0,
          compteConnu: false,
          erreur: "Compte absent du plan comptable de la coopérative",
        },
      ]) as never)
      .mockReturnValueOnce(chain([
        { numeroCompte: "110", libelle: "Report à nouveau" },
      ]) as never);
    anthropicCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify([{ numeroCompte: "110", score: 90, raison: "Contrepartie de reprise disponible dans le plan." }]),
      }],
    });
    const res = response();

    await suggestBalanceSageCounterparties(request(), res);

    expect(anthropicCreate).toHaveBeenCalledOnce();
    const prompt = anthropicCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(prompt.messages[0]?.content).toContain("512 — Banque — solde débiteur: 75000 FCFA");
    expect(res.json).toHaveBeenCalledWith({
      disponible: true,
      suggestions: [{ numeroCompte: "110", score: 90, raison: "Contrepartie de reprise disponible dans le plan.", libelle: "Report à nouveau" }],
    });
  });
});