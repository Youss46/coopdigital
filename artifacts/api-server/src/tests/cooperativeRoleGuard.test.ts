import express, { type Request, type Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireM15Role } from "../middlewares/m15Auth.js";

const { enabledRoles } = vi.hoisted(() => ({
  enabledRoles: new Map<string, boolean>(),
}));

vi.mock("../services/cooperativeRolesService.js", () => ({
  ...(() => {
    class CooperativeRoleDisabledError extends Error {
      readonly code = "ROLE_DISABLED";
    }
    return {
      CooperativeRoleDisabledError,
      assertRoleActive: vi.fn(async (cooperativeId: number, role: string) => {
        if (enabledRoles.get(`${cooperativeId}:${role}`) === false) {
          throw new CooperativeRoleDisabledError("Ce rôle est désactivé pour cette coopérative");
        }
      }),
    };
  })(),
}));

describe("cooperativeRoleGuard", () => {
  async function startServer(cooperativeId: number, role: string) {
    const { cooperativeRoleGuard } = await import("../middlewares/cooperativeRoleGuard.js");
    const app = express();
    app.use((req, _res, next) => {
      req.user = {
        id: 1,
        role,
        cooperativeId,
      };
      req.log = { error: vi.fn() } as unknown as Request["log"];
      next();
    });
    app.use(cooperativeRoleGuard);
    app.get("/roles-test", (_req: Request, res: Response) => res.json({ ok: true }));
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Serveur indisponible");
    return { server, url: `http://127.0.0.1:${address.port}/roles-test` };
  }

  beforeEach(() => enabledRoles.clear());

  it("traite l'absence de configuration comme un rôle actif", async () => {
    const { server, url } = await startServer(1, "pca");
    expect((await fetch(url)).status).toBe(200);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("isole la configuration par coopérative et renvoie ROLE_DISABLED", async () => {
    enabledRoles.set("1:peseur", false);
    const disabled = await startServer(1, "peseur");
    const allowed = await startServer(2, "peseur");

    const refused = await fetch(disabled.url);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "ROLE_DISABLED" });

    expect((await fetch(allowed.url)).status).toBe(200);
    await Promise.all([
      new Promise<void>((resolve, reject) => disabled.server.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => allowed.server.close((error) => error ? reject(error) : resolve())),
    ]);
  });

  it("applique immédiatement une nouvelle désactivation aux requêtes suivantes", async () => {
    const { server, url } = await startServer(3, "comptable");

    expect((await fetch(url)).status).toBe(200);
    enabledRoles.set("3:comptable", false);
    expect((await fetch(url)).status).toBe(403);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("réserve la modification des rôles M15 au super administrateur", () => {
    const next = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const middleware = requireM15Role("superadmin");

    middleware({ m15User: { id: 7, email: "admin@test", role: "admin", type: "m15" } } as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    middleware({ m15User: { id: 7, email: "admin@test", role: "superadmin", type: "m15" } } as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});