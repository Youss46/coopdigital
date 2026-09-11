import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMouvementsStock, formaterPoids } from "./StocksPage";

describe("formatage des poids dans les stocks", () => {
  it("affiche 6077 kg en kilogrammes exacts avec le séparateur français", () => {
    expect(formaterPoids(6077)).toBe("6\u202f077 kg");
    expect(formaterPoids(6077)).not.toContain("t");
  });

  it("conserve les décimales valides en kilogrammes", () => {
    expect(formaterPoids("6077.25")).toBe("6\u202f077,25 kg");
  });
});

describe("chargement du journal des mouvements", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("charge les mouvements depuis l'API Railway sans en-tête qui déclenche un preflight CORS", async () => {
    const mouvements = [{
      id: 12,
      entrepotNom: "Entrepôt central",
      type: "sortie",
      poidsKg: "6090",
      motif: "Chargement expédition EXP-2026-16-0001",
      createdAt: "2026-09-11T10:00:00.000Z",
    }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mouvements), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const params = new URLSearchParams({ date_debut: "2026-09-01" });
    await expect(
      fetchMouvementsStock("https://api.example.com/", "token-test", params),
    ).resolves.toEqual(mouvements);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/stocks/mouvements?date_debut=2026-09-01",
      {
        cache: "no-store",
        headers: { Authorization: "Bearer token-test" },
      },
    );
  });

  it("utilise le chemin relatif du rewrite Vercel lorsque l'URL de base est vide", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchMouvementsStock("", "token-test", new URLSearchParams()),
    ).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stocks/mouvements",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("rejette une réponse non-2xx au lieu de la transformer en journal vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ erreur: "API indisponible" }), { status: 503 }),
      ),
    );

    await expect(
      fetchMouvementsStock("", "token-test", new URLSearchParams()),
    ).rejects.toThrow("Erreur chargement mouvements");
  });
});