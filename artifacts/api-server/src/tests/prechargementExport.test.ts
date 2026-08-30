import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal()),
  db: dbMock,
  expeditionHistoriqueTable: {},
}));

vi.mock("../services/terrainService.js", () => ({
  getPrixActuel: vi.fn(),
}));
vi.mock("../services/comptabiliteService.js", () => ({
  generateEcrituresLivraison: vi.fn(),
  proposerEcrituresDansTransaction: vi.fn(),
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
  notifExpeditionArriveePort: vi.fn(),
  notifExpeditionLitige: vi.fn(),
}));
vi.mock("../services/recuService.js", () => ({
  genererNumeroRecu: vi.fn(),
  reserverNumeroPesee: vi.fn().mockResolvedValue({ numero: 12, annee: 2026 }),
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
  isCertificationCacao: vi.fn(() => true),
}));

const { proposerEcrituresDansTransaction } = await import("../services/comptabiliteService.js");
const { createSession, addLigne, terminerSession } = await import("../services/peseeSessionService.js");
const { changerStatut, validerPrechargement } = await import("../services/expeditionsService.js");

type Chain = {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  for: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
};

function selectChain(rows: unknown[]): Chain {
  const chain = {} as Chain;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.for = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

function mutationChain(rows: unknown[] = []) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

const expedition = {
  id: 42,
  statut: "en_preparation",
  numeroExpedition: "EXP-2026-1-0001",
  port: "Abidjan",
  poidsPrevuKg: "1000",
  poidsChargeKg: "1000",
  poidsChargeEffectifKg: null,
  fraisTransportFcfa: null,
};

const prechargementConforme = {
  id: 91,
  numeroSession: "PSE-2026-00012",
  statut: "terminee",
  poidsTotalKg: "1002",
  nbSacsTotal: 40,
  prechargementStatut: "conforme",
  prechargementEcartKg: "2",
  prechargementEcartPct: "0.2",
  prechargementJustification: null,
};

describe("pré-pesée export — règles de contrôle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
    dbMock.update.mockReset();
    dbMock.transaction.mockReset();
    dbMock.transaction.mockImplementation(async (callback) => callback({
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }));
  });

  it("crée une session dédiée sans certification ni membre", async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([{ id: 42, statut: "en_preparation", poidsPrevuKg: "1000", poidsChargeKg: "1000" }]))
      .mockReturnValueOnce(selectChain([]));
    dbMock.insert.mockReturnValueOnce(mutationChain([{
      id: 91,
      numeroSession: "PSE-2026-00012",
      operation: "prechargement_export",
      expeditionId: 42,
      statut: "en_cours",
    }]));

    const result = await createSession(7, {
      operation: "prechargement_export",
      expeditionId: 42,
      produit: "cacao",
    });

    expect(result).toMatchObject({
      operation: "prechargement_export",
      expeditionId: 42,
      statut: "en_cours",
    });
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(dbMock.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        cooperativeId: 7,
        membreId: null,
        fournisseurId: null,
        expeditionId: 42,
        certificationCacao: null,
      }),
    );
  });

  it("refuse une seconde session active pour la même expédition", async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([{ id: 42, statut: "en_preparation", poidsPrevuKg: "1000", poidsChargeKg: "1000" }]))
      .mockReturnValueOnce(selectChain([{ id: 91, numeroSession: "PSE-2026-00012" }]));

    await expect(createSession(7, {
      operation: "prechargement_export",
      expeditionId: 42,
    })).rejects.toThrow("session en cours existe déjà");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("ajoute un passage et recalcule le poids net de la session", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{
          id: 91,
          numeroSession: "PSE-2026-00012",
          statut: "en_cours",
          nbSacsTotal: 10,
          poidsTotalKg: "250",
          bonReceptionId: null,
          transfertId: null,
        }]))
        .mockReturnValueOnce(selectChain([{ maxPassage: 2 }])),
      insert: vi.fn().mockReturnValue(mutationChain([{ id: 7, numeroPassage: 3 }])),
      update: vi.fn().mockReturnValue(mutationChain()),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) => callback(tx));

    const result = await addLigne(7, 91, { nbSacs: 4, poidsBrutKg: 120, tareKg: 5 });

    expect(result).toMatchObject({ id: 7, numeroPassage: 3 });
    expect(tx.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 91, numeroPassage: 3, nbSacs: 4, poidsBrutKg: "120", tareKg: "5" }),
    );
    expect(tx.update.mock.results[0]?.value.set).toHaveBeenCalledWith({
      nbSacsTotal: 14,
      poidsTotalKg: "365",
    });
  });

  it("clôture une pré-pesée conforme sans créer de livraison ni mouvement", async () => {
    const updated = { ...prechargementConforme, statut: "terminee" };
    const beforeSession = {
      ...updated,
      statut: "en_cours",
      operation: "prechargement_export",
      lignes: [],
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{
          id: 91,
          numeroSession: "PSE-2026-00012",
          peseurId: 18,
          statut: "en_cours",
          expeditionId: 42,
        }]))
        .mockReturnValueOnce(selectChain([{
          id: 42,
          statut: "en_preparation",
          poidsPrevuKg: "1000",
          poidsChargeKg: "1000",
        }]))
        .mockReturnValueOnce(selectChain([{ poids: 1002, nbSacs: 40 }]))
        .mockReturnValueOnce(selectChain([{ ecartMaxAutorisePct: "2" }])),
      update: vi.fn().mockReturnValue(mutationChain([updated])),
      insert: vi.fn().mockReturnValue(mutationChain()),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) => callback(tx));
    dbMock.select
      .mockReturnValueOnce(selectChain([beforeSession]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ ...updated, lignes: [] }]))
      .mockReturnValueOnce(selectChain([]));

    const result = await terminerSession(7, 91);

    expect(result).toMatchObject({
      statut: "terminee",
      poidsTotalKg: "1002",
      prechargementStatut: "conforme",
      ecartKg: 2,
      ecartPct: 0.2,
    });
    expect(tx.update.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: "terminee",
        poidsTotalKg: "1002",
        nbSacsTotal: 40,
        prechargementStatut: "conforme",
      }),
    );
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("classe un écart hors tolérance comme à justifier", async () => {
    const beforeSession = {
      ...prechargementConforme,
      statut: "en_cours",
      operation: "prechargement_export",
      lignes: [],
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{ id: 91, numeroSession: "PSE-2026-00012", peseurId: 18, statut: "en_cours", expeditionId: 42 }]))
        .mockReturnValueOnce(selectChain([{ id: 42, statut: "en_preparation", poidsPrevuKg: "1000", poidsChargeKg: "1000" }]))
        .mockReturnValueOnce(selectChain([{ poids: 1100, nbSacs: 40 }]))
        .mockReturnValueOnce(selectChain([{ ecartMaxAutorisePct: "2" }])),
      update: vi.fn().mockReturnValue(mutationChain([{ ...prechargementConforme, prechargementStatut: "a_justifier" }])),
      insert: vi.fn().mockReturnValue(mutationChain()),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) => callback(tx));
    dbMock.select
      .mockReturnValueOnce(selectChain([beforeSession]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ ...prechargementConforme, prechargementStatut: "a_justifier", lignes: [] }]))
      .mockReturnValueOnce(selectChain([]));

    const result = await terminerSession(7, 91);

    expect(result).toMatchObject({ prechargementStatut: "a_justifier", ecartKg: 100, ecartPct: 10 });
  });

  it("valide exceptionnellement un écart avec justification dans une transaction", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{ id: 42, statut: "en_preparation" }]))
        .mockReturnValueOnce(selectChain([{ id: 91, statut: "terminee", prechargementStatut: "a_justifier" }])),
      update: vi.fn().mockReturnValue(mutationChain([{ id: 91, prechargementStatut: "valide" }])),
      insert: vi.fn().mockReturnValue(mutationChain()),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(validerPrechargement(7, 42, 18, "Écart contrôlé avec pesée vérifiée"))
      .resolves.toMatchObject({ prechargementStatut: "valide" });
    expect(tx.update.mock.results[0]?.value.set).toHaveBeenCalledWith({
      prechargementStatut: "valide",
      prechargementJustification: "Écart contrôlé avec pesée vérifiée",
    });
    await expect(validerPrechargement(7, 42, 18, "non")).rejects.toThrow("au moins 5 caractères");
  });
});

describe("pré-pesée export — transition de chargement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
    dbMock.update.mockReset();
    dbMock.transaction.mockReset();
  });

  it.each([
    ["sans session clôturée", null, "pré-pesée export clôturée est obligatoire"],
    ["avec écart non validé", { ...prechargementConforme, prechargementStatut: "a_justifier" }, "validation motivée est obligatoire"],
  ])("bloque le passage à charge %s", async (_label, prechargement, message) => {
    dbMock.select
      .mockReturnValueOnce(selectChain([expedition]))
      .mockReturnValueOnce(selectChain(prechargement ? [prechargement] : []));

    await expect(changerStatut(7, 42, 18, "charge")).rejects.toThrow(message);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("autorise le chargement avec une pré-pesée conforme", async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([expedition]))
      .mockReturnValueOnce(selectChain([prechargementConforme]))
      .mockReturnValueOnce(selectChain([])); // aucun lot vendu : pas d'écriture comptable à calculer
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([])),
      update: vi.fn().mockReturnValue(mutationChain()),
      insert: vi.fn().mockReturnValue(mutationChain()),
    };
    dbMock.transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(changerStatut(7, 42, 18, "charge")).resolves.toEqual({ ok: true, statut: "charge" });
    expect(tx.update.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: "charge",
        poidsChargeEffectifKg: "1002",
        nombreSacsEffectif: 40,
      }),
    );
  });

  it("propage une erreur comptable pour que la transaction annule le chargement", async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([expedition]))
      .mockReturnValueOnce(selectChain([prechargementConforme]))
      .mockReturnValueOnce(selectChain([{ lotId: 8 }]))
      .mockReturnValueOnce(selectChain([{ prixUnitaireFcfa: 900, poidsKg: "1002" }]));
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([])) // sortie stock : aucun lot disponible dans ce scénario
        .mockReturnValueOnce(selectChain([])),
      update: vi.fn().mockReturnValue(mutationChain()),
      insert: vi.fn().mockReturnValue(mutationChain()),
    };
    const rollbackError = new Error("écriture OHADA indisponible");
    vi.mocked(proposerEcrituresDansTransaction).mockRejectedValueOnce(rollbackError);
    dbMock.transaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(changerStatut(7, 42, 18, "charge")).rejects.toBe(rollbackError);
    expect(dbMock.transaction).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledOnce();
  });
});