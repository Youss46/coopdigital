import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvancesDeleguesRapportModal from "./AvancesDeleguesRapportModal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("rapport global des avances de délégués de localités", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  afterEach(() => {
    act(() => root?.unmount());
    queryClient?.clear();
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("charge toutes les avances sans envoyer l’identifiant du délégué sélectionné", async () => {
    const rapport = {
      items: [],
      nombreAvances: 0,
      nombreEnCours: 0,
      nombreEnRetard: 0,
      totalMontantOctroyeFcfa: 0,
      totalMontantRembourseFcfa: 0,
      totalSoldeRestantFcfa: 0,
      genereLe: "2026-10-19T08:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rapport), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(AvancesDeleguesRapportModal, { onClose: vi.fn() }),
      ));
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/delegues-localites/avances/rapport",
      { headers: { Authorization: "Bearer " } },
    );
    expect(container.textContent).toContain("Imprimer toutes les avances restant dues");
    expect(container.textContent).toContain("Aucune avance restant due pour ce périmètre.");
  });
});
