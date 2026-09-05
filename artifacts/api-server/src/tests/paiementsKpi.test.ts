import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

function table(name: string, columns: string[]) {
  return Object.fromEntries([
    ["_", { name }],
    ...columns.map((column) => [column, `${name}.${column}`]),
  ]);
}

vi.mock("@workspace/db", () => ({
  db: { select: mocks.select },
  paiementsTable: table("paiements", [
    "id", "livraisonId", "bonCarburantId", "depenseVehiculeId", "membreId", "montantFcfa",
    "modePaiement", "referenceTransaction", "statut", "createdAt",
    "motifRejet", "dateValidation", "agentSaisiseurId",
  ]),
  paiementLignesTable: table("paiement_lignes", ["paiementId"]),
  avancesTable: table("avances", []),
  campagnesTable: table("campagnes", ["cooperativeId", "statut", "dateOuverture", "dateFermeture"]),
  membresTable: table("membres", ["id", "cooperativeId", "delegueId"]),
  livraisonsTable: table("livraisons", ["id", "agentId", "fournisseurId"]),
  fournisseursTable: table("fournisseurs", ["id", "cooperativeId", "creeParDelegueId"]),
  usersTable: table("users", ["id", "role"]),
  bonsCarburantTable: table("bons_carburant", ["id", "cooperativeId"]),
  depensesVehiculeTable: table("depenses_vehicule", ["id", "cooperativeId", "libelle", "fournisseur"]),
  ventesExportateursTable: table("ventes_exportateurs", []),
  exportateursTable: table("exportateurs", []),
  parcellesTable: table("parcelles", []),
  missionsTerrainTable: table("missions_terrain", []),
  transfertsStockTable: table("transferts_stock", []),
  comptesMobilesMarchandsTable: table("comptes_mobiles_marchands", []),
  mouvementsMobileMarchandTable: table("mouvements_mobile_marchand", []),
  caissesTable: table("caisses", []),
  chequesEmisTable: table("cheques_emis", [
    "id", "paiementId", "montantFcfa", "statut", "dateEncaissement",
  ]),
  sessionsPeseeTable: table("sessions_pesee", ["id", "livraisonId"]),
  commissionsMembresDelaguesTable: table("commissions_membres_delegues", [
    "id", "sessionPeseeId", "montantFcfa", "statut", "membreDelegueId", "retenueAvancesFcfa",
  ]),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  or: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ operator: "eq", column, value }),
  desc: (column: unknown) => ({ operator: "desc", column }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    operator: "sql",
    text: strings.reduce((result, string, index) => `${result}${string}${values[index] ?? ""}`, ""),
  }),
  gte: (column: unknown, value: unknown) => ({ operator: "gte", column, value }),
  lte: (column: unknown, value: unknown) => ({ operator: "lte", column, value }),
  inArray: (column: unknown, values: unknown[]) => ({ operator: "inArray", column, values }),
  isNull: (column: unknown) => ({ operator: "isNull", column }),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: (source: unknown, name: string) => ({ source, _: { name }, id: `${name}.id`, role: `${name}.role` }),
}));

vi.mock("../services/pushService.js", () => ({
  envoyerPushGroupePortail: vi.fn(),
  envoyerPushGroupe: vi.fn(),
}));
vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcrituresDansTransaction: vi.fn(),
  resolveCompteDetteProducteur: vi.fn(),
  resolveCompteDebit: vi.fn(),
}));
vi.mock("../services/caisseService.js", () => ({
  verifierCaisseEspeces: vi.fn(),
  debiterCaisseParResponsable: vi.fn(),
  getSessionActive: vi.fn(),
  enregistrerMouvement: vi.fn(),
}));
vi.mock("../services/notificationService.js", () => ({ notifierParRole: vi.fn() }));
vi.mock("../services/recuService.js", () => ({ genererNumeroRecu: vi.fn() }));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { getDashboard } from "../controllers/dashboardController.js";
import { getPaiementTresorerieDescriptor, listPaiements, statsPaiements } from "../controllers/paiementsController.js";

type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
};

function selectChain(rows: unknown[]): SelectChain {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  } as SelectChain;
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function request(query: Record<string, string> = {}) {
  return {
    query,
    user: { id: 7, role: "directeur", cooperativeId: 42 },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

describe("date effective des règlements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    mocks.select.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("identifie un règlement de bon carburant dans la trésorerie", () => {
    expect(getPaiementTresorerieDescriptor(161, "BC-2026-0042")).toEqual({
      motif: "carburant",
      libelle: "Carburant — Bon BC-2026-0042",
    });
  });

  it("conserve le libellé producteur pour un paiement de livraison", () => {
    expect(getPaiementTresorerieDescriptor(161)).toEqual({
      motif: "paiement_producteur",
      libelle: "Paiement producteur — règlement #161",
    });
  });

  it("alimente « Payés ce mois » avec la date de validation", async () => {
    mocks.select.mockReturnValue(selectChain([
      // Date de création hors période, validation dans le mois : inclus.
      {
        id: 1,
        statut: "effectue",
        montantFcfa: 80_000,
        createdAt: new Date("2026-08-31T10:00:00.000Z"),
        dateValidation: new Date("2026-09-04T08:00:00.000Z"),
      },
      // Date de création dans le mois, validation hors période : exclu.
      {
        id: 2,
        statut: "effectue",
        montantFcfa: 50_000,
        createdAt: new Date("2026-09-03T10:00:00.000Z"),
        dateValidation: new Date("2026-08-31T10:00:00.000Z"),
      },
    ]));
    const res = response();

    await statsPaiements(request(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      valide_aujourd_hui: { count: 1, montant_total: 80_000 },
      effectue_ce_mois: { montant_total: 80_000 },
      effectue_periode: { count: 2, montant_total: 130_000 },
    }));
  });

  it("alimente « Payés ce mois » avec created_at si la validation est absente", async () => {
    mocks.select.mockReturnValue(selectChain([
      // Règlement historique sans date_validation : repli sur created_at.
      {
        id: 3,
        statut: "effectue",
        montantFcfa: 25_000,
        createdAt: new Date("2026-09-03T10:00:00.000Z"),
        dateValidation: null,
      },
    ]));
    const res = response();

    await statsPaiements(request(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      valide_aujourd_hui: { count: 0, montant_total: 0 },
      effectue_ce_mois: { montant_total: 25_000 },
    }));
  });

  it("ne compte un règlement par chèque qu'après son encaissement", async () => {
    mocks.select.mockReturnValue(selectChain([
      {
        id: 10,
        statut: "effectue",
        montantFcfa: 120_000,
        createdAt: new Date("2026-09-04T08:00:00.000Z"),
        dateValidation: new Date("2026-09-04T08:00:00.000Z"),
        chequeId: 91,
        chequeMontantFcfa: 120_000,
        chequeStatut: "emis",
        chequeDateEncaissement: null,
      },
      {
        id: 11,
        statut: "effectue",
        montantFcfa: 90_000,
        createdAt: new Date("2026-09-03T08:00:00.000Z"),
        dateValidation: new Date("2026-09-03T08:00:00.000Z"),
        chequeId: 92,
        chequeMontantFcfa: 90_000,
        chequeStatut: "encaisse",
        chequeDateEncaissement: "2026-09-04",
      },
    ]));
    const res = response();

    await statsPaiements(request({ periode: "month" }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      valide_aujourd_hui: { count: 1, montant_total: 90_000 },
      effectue_ce_mois: { montant_total: 90_000 },
      effectue_periode: { count: 1, montant_total: 90_000 },
    }));
  });

  it("compte seulement la part immédiatement réglée d'un paiement ventilé", async () => {
    mocks.select.mockReturnValue(selectChain([
      {
        id: 12,
        statut: "effectue",
        montantFcfa: 150_000,
        createdAt: new Date("2026-09-04T08:00:00.000Z"),
        dateValidation: new Date("2026-09-04T08:00:00.000Z"),
        chequeId: 93,
        chequeMontantFcfa: 100_000,
        chequeStatut: "emis",
        chequeDateEncaissement: null,
      },
    ]));
    const res = response();

    await statsPaiements(request({ periode: "month" }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      valide_aujourd_hui: { count: 1, montant_total: 50_000 },
      effectue_ce_mois: { montant_total: 50_000 },
      effectue_periode: { count: 1, montant_total: 50_000 },
    }));
  });

  it("alimente le KPI de période du tableau de bord avec la date effective", async () => {
    const paymentChain = selectChain([{ total: 105_000 }]);
    const chains = [
      selectChain([{ count: 1 }]),
      selectChain([{ count: 0 }]),
      selectChain([{ count: 0 }]),
      selectChain([{ total: 0 }]),
      selectChain([{ tonnage: 0 }]),
      paymentChain,
      selectChain([{ total: 0 }]),
      selectChain([{ sacs: 0 }]),
    ];
    mocks.select.mockImplementation(() => chains.shift());
    const res = response();
    const dashboardRequest = {
      query: { dateDebut: "2026-09-01", dateFin: "2026-09-30" },
      user: { cooperativeId: 42 },
      log: { error: vi.fn() },
    };

    await getDashboard(dashboardRequest as unknown as Request, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      paiementsMois: 105_000,
    }));
    const condition = JSON.stringify(paymentChain.where.mock.calls[0]?.[0]);
    expect(condition).not.toContain("paiements.dateValidation");
    const selectedTotal = JSON.stringify(mocks.select.mock.calls[5]);
    expect(selectedTotal).toContain("paiements.montantFcfa");
    expect(selectedTotal).toContain("cheques_emis");
    expect(selectedTotal).toContain("encaisse");
  });

  it("filtre la liste par la même date effective que les KPI", async () => {
    const paiement = {
      id: 12,
      statut: "effectue",
      montantFcfa: 25_000,
      createdAt: new Date("2026-09-03T10:00:00.000Z"),
      dateValidation: null,
    };
    const listeChain = selectChain([paiement]);
    mocks.select
      .mockReturnValueOnce(listeChain)
      .mockReturnValueOnce(selectChain([]));
    const res = response();

    await listPaiements(request({ periode: "month" }), res);

    const whereCondition = listeChain.where.mock.calls[0]?.[0];
    expect(JSON.stringify(whereCondition)).toContain("coalesce");
    expect(res.json).toHaveBeenCalledWith([{ ...paiement, lignes: [] }]);
  });

  it("filtre la liste sur une période personnalisée inclusive", async () => {
    const listeChain = selectChain([]);
    mocks.select
      .mockReturnValueOnce(listeChain)
      .mockReturnValueOnce(selectChain([]));
    const res = response();

    await listPaiements(request({
      date_debut: "2026-08-01",
      date_fin: "2026-08-31",
    }), res);

    const condition = JSON.stringify(listeChain.where.mock.calls[0]?.[0]);
    expect(condition).toContain("2026-08-01T00:00:00.000Z");
    expect(condition).toContain("2026-08-31T23:59:59.999Z");
  });

  it("rejette une période personnalisée inversée", async () => {
    const res = response();

    await listPaiements(request({
      date_debut: "2026-09-10",
      date_fin: "2026-09-01",
    }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erreur: "La date de début doit précéder la date de fin",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("filtre la liste sur les dates de la campagne active", async () => {
    const campagneChain = selectChain([{
      dateOuverture: "2026-04-01",
      dateFermeture: null,
    }]);
    const listeChain = selectChain([]);
    mocks.select
      .mockReturnValueOnce(campagneChain)
      .mockReturnValueOnce(listeChain)
      .mockReturnValueOnce(selectChain([]));
    const res = response();

    await listPaiements(request({ periode: "campaign" }), res);

    const condition = JSON.stringify(listeChain.where.mock.calls[0]?.[0]);
    expect(condition).toContain("2026-04-01T00:00:00.000Z");
    expect(condition).toContain("2026-09-04T23:59:59.999Z");
  });
});
