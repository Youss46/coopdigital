import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  db,
  fournisseursTable,
  livraisonsTable,
  membresTable,
  sessionsPeseeTable,
} from "@workspace/db";

vi.mock("../services/terrainService.js", () => ({
  getPrixActuel: vi.fn(),
}));
vi.mock("../services/comptabiliteService.js", () => ({
  generateEcrituresLivraison: vi.fn(),
}));
vi.mock("../services/delegueService.js", () => ({
  getMontantAlimentationsCaisseDelegue: vi.fn(),
}));
vi.mock("../services/intrantsService.js", () => ({
  getEncoursMembreTx: vi.fn(),
  enregistrerRemboursementParLivraison: vi.fn(),
}));
vi.mock("../services/notificationService.js", () => ({
  creerNotification: vi.fn(),
  notifierParRole: vi.fn(),
}));
vi.mock("../services/recuService.js", () => ({
  genererNumeroRecu: vi.fn(),
}));
vi.mock("../services/commissionService.js", () => ({
  creerCommissionTransfert: vi.fn(),
  deduireAvancesApresCommission: vi.fn(),
}));
vi.mock("../services/commissionMembreDelegueService.js", () => ({
  creerCommissionMembreSiTaux: vi.fn(),
}));
vi.mock("../services/entrepotDelegueService.js", () => ({
  entrerStockSiDelegue: vi.fn(),
}));
vi.mock("../services/membreDelegueReglement.js", () => ({
  calculerReglementMembreDelegue: vi.fn(),
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/certificationCacao.js", () => ({
  isCertificationCacao: vi.fn(),
}));

const { getSessions } = await import("../services/peseeSessionService.js");

type Query = {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeQuery(rows: unknown[]): Query {
  const query = {} as Query;
  query.from = vi.fn().mockReturnValue(query);
  query.leftJoin = vi.fn().mockReturnValue(query);
  query.where = vi.fn().mockReturnValue(query);
  query.orderBy = vi.fn().mockReturnValue(query);
  query.limit = vi.fn().mockResolvedValue(rows);
  return query;
}

describe("getSessions — pesées groupées et simples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("agrège une pesée simple avec une session groupée, sans doublon", async () => {
    const grouped = {
      id: 10,
      type: "groupée",
      statut: "terminee",
      livraisonId: 42,
      createdAt: new Date("2026-08-22T12:00:00Z"),
    };
    const simple = {
      id: -43,
      type: "simple",
      statut: "terminee",
      livraisonId: 43,
      createdAt: new Date("2026-08-22T13:00:00Z"),
    };
    const groupedQuery = makeQuery([grouped]);
    const simpleQuery = makeQuery([simple]);
    vi.mocked(db.select)
      .mockReturnValueOnce(groupedQuery as never)
      .mockReturnValueOnce(simpleQuery as never);

    const result = await getSessions(7, { statut: "terminee" });

    expect(result).toEqual([simple, grouped]);
    expect(result).toHaveLength(2);
    expect(result.filter((entry) => entry.livraisonId === 42)).toHaveLength(1);
    expect(result.find((entry) => entry.type === "simple")).toMatchObject({
      id: -43,
      type: "simple",
    });
  });

  it("exclut les livraisons déjà liées à une session et applique le périmètre coopérative/peseur", async () => {
    const groupedQuery = makeQuery([]);
    const simpleQuery = makeQuery([]);
    vi.mocked(db.select)
      .mockReturnValueOnce(groupedQuery as never)
      .mockReturnValueOnce(simpleQuery as never);

    await getSessions(7, { statut: "terminee", peseurId: 19 });

    expect(simpleQuery.from).toHaveBeenCalledWith(livraisonsTable);
    expect(simpleQuery.leftJoin).toHaveBeenNthCalledWith(
      1,
      membresTable,
      expect.anything(),
    );
    expect(simpleQuery.leftJoin).toHaveBeenNthCalledWith(
      2,
      fournisseursTable,
      expect.anything(),
    );
    const [conditions] = simpleQuery.where.mock.calls[0] as [unknown];
    expect(JSON.stringify(conditions)).toContain("NOT EXISTS");
    expect(JSON.stringify(conditions)).toContain("sessions_pesee");
  });

  it("ne mélange pas les pesées simples quand le statut demandé n'est pas terminée", async () => {
    const groupedQuery = makeQuery([{ id: 11, statut: "en_cours" }]);
    vi.mocked(db.select).mockReturnValueOnce(groupedQuery as never);

    const result = await getSessions(7, { statut: "en_cours" });

    expect(result).toEqual([{ id: 11, statut: "en_cours" }]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("applique les filtres de période aux deux sources", async () => {
    const groupedQuery = makeQuery([]);
    const simpleQuery = makeQuery([]);
    vi.mocked(db.select)
      .mockReturnValueOnce(groupedQuery as never)
      .mockReturnValueOnce(simpleQuery as never);

    await getSessions(7, {
      statut: "terminee",
      dateDebut: "2026-08-01",
      dateFin: "2026-08-22",
    });

    expect(groupedQuery.where).toHaveBeenCalledTimes(1);
    expect(simpleQuery.where).toHaveBeenCalledTimes(1);
    const [groupedConditions] = groupedQuery.where.mock.calls[0] as [unknown];
    const [simpleConditions] = simpleQuery.where.mock.calls[0] as [unknown];
    expect(JSON.stringify(groupedConditions)).toContain("2026-08-01");
    expect(JSON.stringify(groupedConditions)).toContain("2026-08-22");
    expect(JSON.stringify(simpleConditions)).toContain("2026-08-01");
    expect(JSON.stringify(simpleConditions)).toContain("2026-08-22");
  });
});