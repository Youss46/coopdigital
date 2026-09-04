import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: mocks.select },
  usersTable: {
    id: "id",
    cooperativeId: "cooperative_id",
    delegueId: "delegue_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

import { peseurCentralOnly } from "../middlewares/peseurCentralOnly";

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function makeReq(role: string, delegueId?: number | null) {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [{ delegueId }],
      }),
    }),
  });
  return {
    user: { id: 12, role, cooperativeId: 7 },
    log: { error: vi.fn() },
  } as never;
}

describe("peseurCentralOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("autorise un peseur rattaché à la coopérative centrale", async () => {
    const next = vi.fn();
    const res = makeRes();

    await peseurCentralOnly(makeReq("peseur", null), res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("refuse un peseur rattaché à un délégué", async () => {
    const next = vi.fn();
    const res = makeRes();

    await peseurCentralOnly(makeReq("peseur", 45), res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      erreur: "Accès refusé",
      message: "Seul le Peseur central peut effectuer cette opération.",
    });
  });

  it("refuse les autres rôles sans interroger le compte", async () => {
    const next = vi.fn();
    const res = makeRes();

    await peseurCentralOnly(makeReq("responsable_tracabilite"), res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});