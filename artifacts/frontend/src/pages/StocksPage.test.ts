import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMouvementsStock, formaterPoids } from "./StocksPage";

const {
  useGetEntrepotsMock,
  useGetStockAlertesMock,
  useEntreeStockMock,
  useSortieStockMock,
} = vi.hoisted(() => ({
  useGetEntrepotsMock: vi.fn(),
  useGetStockAlertesMock: vi.fn(),
  useEntreeStockMock: vi.fn(),
  useSortieStockMock: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetEntrepots: useGetEntrepotsMock,
  useGetStockAlertes: useGetStockAlertesMock,
  useEntreeStock: useEntreeStockMock,
  useSortieStock: useSortieStockMock,
  getGetEntrepotsQueryKey: () => ["entrepots"],
  getGetMouvementsStockQueryKey: () => ["mouvements"],
  getGetStockAlertesQueryKey: () => ["alertes"],
}));

vi.mock("@/hooks/usePermission", () => ({
  usePermission: () => false,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["", vi.fn()],
  useSearch: () => "",
}));

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

describe("cartes KPI après chargement des entrepôts", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    useGetEntrepotsMock.mockReturnValue({
      data: [{
        id: 1,
        nom: "Entrepôt central",
        ville: "Abidjan",
        capaciteKg: "10000",
        stockActuelKg: 6077,
        nombreSacsTotal: 0,
        seuilAlerteKg: "500",
        pourFournisseursExt: false,
      }],
      isLoading: false,
    });
    useGetStockAlertesMock.mockReturnValue({ data: [] });
    useEntreeStockMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useSortieStockMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("affiche le stock exact en kg dans la carte après la réponse API", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("lotissement-stats")
        ? { poidsTotal: 0, poidsLoti: 0, poidsNonLoti: 0 }
        : [];
      return {
        ok: true,
        json: async () => payload,
      };
    }));

    const { default: StocksPage } = await import("./StocksPage");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(StocksPage),
      ));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("6\u202f077 kg");
    expect(container.textContent).toContain("6,077 t");
    expect(container.textContent).not.toContain("6,08 t");
  });
});