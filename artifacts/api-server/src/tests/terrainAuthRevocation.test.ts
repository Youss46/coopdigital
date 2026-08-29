import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: dbMock,
}));

const {
  COMPTE_DESACTIVE_CODE,
  COMPTE_DESACTIVE_MESSAGE,
  flexAuthMiddleware,
  terrainAuthMiddleware,
} = await import("../middlewares/terrainAuth.js");

const SECRET = "terrain-auth-test-secret";

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

function makeRequest(role: "peseur" | "pca" = "peseur") {
  const payload = role === "peseur"
    ? {
        id: 42,
        role,
        cooperativeId: 9,
        section: null,
        zoneType: null,
        zoneNom: null,
        delegueId: null,
      }
    : {
        id: 99,
        role,
        cooperativeId: 9,
      };
  return {
    headers: {
      authorization: `Bearer ${jwt.sign(payload, SECRET)}`,
    },
    log: { error: vi.fn() },
  };
}

function mockAccount(actif: boolean) {
  dbMock.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue([{ actif }]),
      }),
    }),
  });
}

describe("révocation des sessions terrain", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", SECRET);
    vi.stubEnv("SESSION_SECRET", "");
    dbMock.select.mockReset();
  });

  it("refuse immédiatement un JWT encore valide après désactivation", async () => {
    mockAccount(false);
    const response = makeResponse();
    const next = vi.fn();

    await terrainAuthMiddleware(makeRequest() as never, response as never, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      code: COMPTE_DESACTIVE_CODE,
      erreur: COMPTE_DESACTIVE_MESSAGE,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("laisse passer un compte terrain encore actif", async () => {
    mockAccount(true);
    const request = makeRequest();
    const response = makeResponse();
    const next = vi.fn();

    await terrainAuthMiddleware(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect((request as { agent?: { id: number } }).agent?.id).toBe(42);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("applique aussi la révocation au middleware flexible des lectures de pesée", async () => {
    mockAccount(false);
    const response = makeResponse();
    const next = vi.fn();

    await flexAuthMiddleware(makeRequest() as never, response as never, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      code: COMPTE_DESACTIVE_CODE,
      erreur: COMPTE_DESACTIVE_MESSAGE,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("ne relit pas l'état d'un token coopératif dans le middleware flexible", async () => {
    const request = makeRequest("pca");
    const response = makeResponse();
    const next = vi.fn();

    await flexAuthMiddleware(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});