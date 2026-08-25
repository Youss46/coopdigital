import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsOp } from "./idb";

const fakeState = vi.hoisted(() => ({
  gpsOps: [] as GpsOp[],
  draft: null as Record<string, unknown> | null,
}));

vi.mock("./idb", () => ({
  queueGpsOp: vi.fn(async (op: Omit<GpsOp, "timestamp" | "status">) => {
    fakeState.gpsOps.push({ ...op, timestamp: 1, status: "pending" });
  }),
  saveGpsDraft: vi.fn(async (draft: Record<string, unknown>) => {
    fakeState.draft = { ...draft };
  }),
  getGpsDraft: vi.fn(async () => fakeState.draft),
  deleteGpsDraft: vi.fn(async () => {
    fakeState.draft = null;
  }),
}));

import { collecterParcelle, syncGpsOps } from "./api";
import { getGpsDraft, saveGpsDraft } from "./idb";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const points = [
  { lat: 5.31, lon: -4.02, accuracy: 7, ts: 1 },
  { lat: 5.311, lon: -4.02, accuracy: 6, ts: 2 },
  { lat: 5.311, lon: -4.019, accuracy: 8, ts: 3 },
];

describe("régression collecte GPS hors ligne", () => {
  beforeEach(() => {
    fakeState.gpsOps.length = 0;
    fakeState.draft = null;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    vi.restoreAllMocks();
  });

  it("conserve le contour après rechargement et ne synchronise qu'une opération", async () => {
    const data = { polygoneGps: points, photos: ["photo-1", "photo-2"] };

    await saveGpsDraft({
      key: "gps_draft_12_34",
      missionId: 12,
      membreId: 34,
      points,
      finalized: true,
      autoMode: true,
      autoPaused: true,
    });
    const reloadedDraft = await getGpsDraft(12, 34);
    expect(reloadedDraft?.points).toEqual(points);
    expect(reloadedDraft?.autoMode).toBe(true);

    await collecterParcelle(12, 34, data, false);
    expect(fakeState.gpsOps).toHaveLength(1);
    expect(fakeState.gpsOps[0].data.polygoneGps).toEqual(points);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ succes: [fakeState.gpsOps[0].localId], echecs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(syncGpsOps(fakeState.gpsOps)).resolves.toEqual({
      succes: [fakeState.gpsOps[0].localId],
      echecs: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).operations).toHaveLength(1);
  });

  it("garde l'erreur visible dans l'état de synchronisation et permet la relance", async () => {
    const op: GpsOp = {
      localId: "gps-retry-1",
      missionId: 12,
      membreId: 34,
      data: { polygoneGps: points, photos: [] },
      timestamp: 1,
      status: "pending",
    };
    let attempt = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(JSON.stringify({
          succes: [],
          echecs: [{ localId: op.localId, erreur: "Réseau indisponible" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ succes: [op.localId], echecs: [] }), { status: 200 });
    });

    const first = await syncGpsOps([op]);
    expect(first.echecs).toEqual([{ localId: op.localId, erreur: "Réseau indisponible" }]);
    expect(first.succes).toEqual([]);

    const retry = await syncGpsOps([op]);
    expect(retry).toEqual({ succes: [op.localId], echecs: [] });
    expect(attempt).toBe(2);
  });
});