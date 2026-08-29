import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import VentesPage from "@/pages/VentesPage";
import { trackVenteEnregistree, type VenteSource } from "./analytics";

const sources: VenteSource[] = ["lot", "reception_port", "fournisseur"];

const mocks = vi.hoisted(() => ({
  createVente: vi.fn(),
  toast: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "test-token" }),
}));

vi.mock("@/hooks/usePermission", () => ({
  usePermission: () => true,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: mocks.useQuery,
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetVentes: () => ({ data: [], isLoading: false }),
  useGetExportateurs: () => ({
    data: [{ id: 7, nom: "Exportateur test", ville: "Abidjan" }],
  }),
  useCreateVente: mocks.createVente,
  useEncaisserVente: () => ({ mutate: vi.fn(), isPending: false }),
  getGetVentesQueryKey: () => ["ventes"],
  getGetExportateursQueryKey: () => ["exportateurs"],
}));

describe("suivi analytique des ventes", () => {
  const track = vi.fn();

  beforeEach(() => {
    track.mockReset();
    window.umami = { track };
  });

  afterEach(() => {
    delete window.umami;
  });

  it.each(sources)(
    "enregistre une seule fois une vente réussie depuis %s",
    (source) => {
      trackVenteEnregistree(source, { ok: true, statut: "en_attente" });

      expect(track).toHaveBeenCalledOnce();
      expect(track).toHaveBeenCalledWith("vente_enregistree", {
        source,
        statut: "en_attente",
      });
    },
  );

  it.each(sources)(
    "n'enregistre aucun événement si la vente depuis %s échoue",
    (source) => {
      trackVenteEnregistree(source, { ok: false, statut: "en_attente" });

      expect(track).not.toHaveBeenCalled();
    },
  );
});

describe("branchement UI du suivi des ventes", () => {
  const track = vi.fn();
  let createVenteShouldSucceed = true;
  let fetchMock: ReturnType<typeof vi.fn>;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    track.mockReset();
    mocks.toast.mockReset();
    window.umami = { track };
    createVenteShouldSucceed = true;

    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      switch (queryKey[0]) {
        case "ventes-lots-stock":
          return {
            data: [{
              id: 12,
              qrCodeLot: "LOT-0012",
              statut: "en_stock",
              poidsTotalKg: "18500",
              entrepot: "Entrepôt membre",
              dateCreation: "2026-08-01",
            }],
          };
        case "ventes-stocks-receptionnes":
          return {
            data: [{
              expeditionId: 21,
              numeroExpedition: "EXP-0021",
              port: "San Pedro",
              dateReception: "2026-08-10",
              poidsRecuPortKg: 19000,
              poidsAcceptePortKg: 18500,
              poidsVenduKg: 0,
              poidsDisponibleKg: 18500,
              lots: [{ lotId: 12, poidsKg: 18500 }],
            }],
          };
        case "ventes-stock-fournisseurs":
          return {
            data: [{
              id: 34,
              nom: "Kouassi",
              prenoms: "Awa",
              type_fournisseur: "pisteur",
              poids_disponible_kg: "9000",
              nb_livraisons: 1,
            }],
          };
        case "livraisons-dispos-fourn":
          return { data: [{ id: 41, dateLivraison: "2026-08-12", poidsKg: "9000" }] };
        case "prix-actuel":
          return { data: { prixVenteExportFcfa: "1200" } };
        case "stock-dispo-auto":
          return { data: { poidsTotalKg: 18500, nbLivraisons: 2 } };
        default:
          return { data: [] };
      }
    });

    mocks.createVente.mockImplementation((options: {
      mutation: {
        onSuccess?: (data: { statut: string }, variables: { data: { expeditionId?: number } }) => void;
        onError?: (error: Error) => void;
      };
    }) => ({
      isPending: false,
      mutate: (variables: { data: { expeditionId?: number } }) => {
        if (createVenteShouldSucceed) {
          options.mutation.onSuccess?.({ statut: "en_attente" }, variables);
        } else {
          options.mutation.onError?.(new Error("HTTP 500"));
        }
      },
    }));

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    delete window.umami;
    vi.unstubAllGlobals();
    mocks.createVente.mockReset();
    mocks.useQuery.mockReset();
  });

  function renderPage() {
    act(() => {
      root = createRoot(container);
      root.render(createElement(VentesPage));
    });
  }

  function buttonContaining(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.includes(text));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Bouton introuvable: ${text}`);
    }
    return button;
  }

  function selectLabeled(labelText: string, value: string) {
    const label = Array.from(container.querySelectorAll("label"))
      .find((candidate) => candidate.textContent?.includes(labelText));
    const select = label?.parentElement?.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error(`Sélecteur introuvable: ${labelText}`);
    }
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function inputLabeled(labelText: string, value: string) {
    const label = Array.from(container.querySelectorAll("label"))
      .find((candidate) => candidate.textContent?.includes(labelText));
    const input = label?.parentElement?.querySelector("input")
      ?? label?.parentElement?.parentElement?.querySelector("input");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Champ introuvable: ${labelText}`);
    }
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function openSaleModal() {
    act(() => {
      buttonContaining("Nouvelle vente").click();
    });
  }

  function expectTracked(source: VenteSource) {
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("vente_enregistree", {
      source,
      statut: "en_attente",
    });
  }

  function expectNotTracked() {
    expect(track).not.toHaveBeenCalled();
  }

  function jsonResponse(ok: boolean, body: unknown, status = ok ? 200 : 500) {
    return {
      ok,
      status,
      json: async () => body,
    };
  }

  async function fillAutomaticSale(
    lotResponse = jsonResponse(true, { id: 42 }),
    saleResponse = jsonResponse(true, { statut: "en_attente" }),
  ) {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, {
        livraisonIds: [101, 102],
        poidsTotalKg: 18500,
        nbLivraisons: 2,
        surplusKg: 0,
      }))
      .mockResolvedValueOnce(lotResponse)
      .mockResolvedValueOnce(saleResponse);
    openSaleModal();
    act(() => {
      buttonContaining("Constituer automatiquement").click();
    });
    inputLabeled("Quantité cible (kg)", "18500");
    await act(async () => {
      buttonContaining("Prévisualiser").click();
    });
    selectLabeled("Exportateur", "7");
    inputLabeled("Prix unitaire", "1200");
  }

  function fillMemberSale(source: "lot" | "reception") {
    openSaleModal();
    if (source === "lot") {
      selectLabeled("Lot à vendre", "12");
    } else {
      act(() => {
        buttonContaining("Réceptions port").click();
      });
      selectLabeled("Réception au port", "21");
    }
    selectLabeled("Exportateur", "7");
  }

  function fillSupplierSale() {
    openSaleModal();
    act(() => {
      buttonContaining("Stock fournisseur").click();
    });
    selectLabeled("Pisteur / fournisseur", "34");
    act(() => {
      const checkbox = container.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        throw new Error("Livraison fournisseur introuvable");
      }
      checkbox.click();
    });
    selectLabeled("Exportateur", "7");
    inputLabeled("Prix unitaire", "1200");
  }

  it.each([
    ["lot", () => fillMemberSale("lot")],
    ["réception au port", () => fillMemberSale("reception")],
  ] as const)(
    "déclenche une seule fois l'événement après succès depuis %s",
    async (_source, fill) => {
      renderPage();
      fill();

      act(() => {
        buttonContaining("Enregistrer la vente").click();
      });

      await act(async () => {});
      expectTracked(_source === "lot" ? "lot" : "reception_port");
    },
  );

  it("déclenche une seule fois l'événement après succès depuis un fournisseur", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ statut: "en_attente" }),
    });
    renderPage();
    fillSupplierSale();

    await act(async () => {
      buttonContaining("Enregistrer la vente").click();
    });

    expectTracked("fournisseur");
  });

  it.each([
    ["lot", () => fillMemberSale("lot")],
    ["réception au port", () => fillMemberSale("reception")],
  ] as const)(
    "ne déclenche aucun événement après échec HTTP depuis %s",
    async (_source, fill) => {
      createVenteShouldSucceed = false;
      renderPage();
      fill();

      act(() => {
        buttonContaining("Enregistrer la vente").click();
      });

      await act(async () => {});
      expectNotTracked();
    },
  );

  it("ne déclenche aucun événement après échec HTTP depuis un fournisseur", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ erreur: "Erreur serveur" }),
    });
    renderPage();
    fillSupplierSale();

    await act(async () => {
      buttonContaining("Enregistrer la vente").click();
    });

    expectNotTracked();
  });

  it("constitue automatiquement un lot, enregistre la vente et confirme le succès", async () => {
    renderPage();
    await fillAutomaticSale();

    await act(async () => {
      buttonContaining("Constituer le lot et vendre").click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/lots/preview-auto",
      "/api/lots",
      "/api/ventes",
    ]);
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body))).toEqual({
      livraisonIds: [101, 102],
    });
    expect((fetchMock.mock.calls[2]![1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body))).toEqual(expect.objectContaining({
      exportateurId: 7,
      lotId: 42,
      poidsKg: 18500,
      prixUnitaireFcfa: 1200,
    }));
    expectTracked("lot");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Lot constitué et vente enregistrée",
    }));
    expect(container.textContent).not.toContain("Nouvelle vente cacao");
  });

  it("ne déclenche aucun événement si la constitution automatique du lot échoue", async () => {
    renderPage();
    await fillAutomaticSale(jsonResponse(false, { erreur: "Lot impossible" }));

    await act(async () => {
      buttonContaining("Constituer le lot et vendre").click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/lots");
    expectNotTracked();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Erreur",
      description: "Lot impossible",
      variant: "destructive",
    });
    expect(buttonContaining("Constituer le lot et vendre").disabled).toBe(false);
    expect(container.textContent).toContain("Nouvelle vente cacao");
  });

  it("ne déclenche aucun événement si la vente automatique échoue", async () => {
    renderPage();
    await fillAutomaticSale(
      jsonResponse(true, { id: 42 }),
      jsonResponse(false, { erreur: "Vente impossible" }),
    );

    await act(async () => {
      buttonContaining("Constituer le lot et vendre").click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/ventes");
    expectNotTracked();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Erreur",
      description: "Vente impossible",
      variant: "destructive",
    });
    expect(buttonContaining("Constituer le lot et vendre").disabled).toBe(false);
    expect(container.textContent).toContain("Nouvelle vente cacao");
  });
});
