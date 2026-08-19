import { describe, expect, it, vi } from "vitest";
import { peseurOnly } from "../middlewares/terrainAuth.js";

function runPeseurOnly(agent?: { role: string; delegueId?: number | null }) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const next = vi.fn();
  peseurOnly(
    { agent } as never,
    { status, json } as never,
    next,
  );
  return { status, json, next };
}

describe("peseurOnly", () => {
  it("allows only the central peseur", () => {
    const result = runPeseurOnly({ role: "peseur", delegueId: null });

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it.each([
    { role: "peseur", delegueId: 7 },
    { role: "delegue", delegueId: null },
  ])("rejects a non-central actor: %o", (agent) => {
    const result = runPeseurOnly(agent);

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({ erreur: "Réservé au peseur central" });
  });
});