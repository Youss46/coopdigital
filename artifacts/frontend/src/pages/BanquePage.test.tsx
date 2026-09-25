import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import BanquePage from "./BanquePage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    utilisateur: {
      id: 1,
      nom: "Kouassi",
      prenoms: "Awa",
      role: "comptable",
      cooperativeId: 1,
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const compte = {
  id: 7,
  nom: "Compte principal",
  banque: "Banque de test",
  numero_compte: "00123456789",
  iban: "CI93 0001 0000 1234 5678 9012",
  solde_actuel_fcfa: "95000",
  solde_mini_alerte_fcfa: "0",
  actif: true,
};

const mouvement = {
  id: 41,
  type: "debit",
  motif: "virement_sortant",
  montant_fcfa: "125000",
  libelle: "Paiement de transport vers le fournisseur",
  reference: "CHQ-2026-014",
  date_operation: "2026-09-25",
  date_valeur: "2026-09-25",
  solde_apres_fcfa: "95000",
  rapproche: false,
  enregistre_par_nom: "Ekolan Awa",
  created_at: "2026-09-25T11:15:00.000Z",
};

describe("mise en page mobile de la Banque", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("présente le journal en fiches et garde les filtres accessibles", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/banque")) {
        return Promise.resolve(new Response(JSON.stringify([compte]), { status: 200 }));
      }
      if (url.includes("/api/banque/7/journal")) {
        return Promise.resolve(new Response(JSON.stringify([mouvement]), { status: 200 }));
      }
      throw new Error(`Appel inattendu: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(BanquePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const compteTitle = Array.from(container.querySelectorAll("h3")).find((title) =>
      title.textContent?.includes("Compte principal"),
    );
    expect(compteTitle).toBeDefined();
    await act(async () => {
      compteTitle!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const mobileList = container.querySelector<HTMLElement>('[aria-label="Mouvements du compte"]');
    expect(mobileList).not.toBeNull();
    expect(mobileList?.className).toContain("md:hidden");
    expect(mobileList?.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    expect(mobileList?.textContent).toContain("Paiement de transport vers le fournisseur");
    expect(mobileList?.textContent).toContain("Ekolan Awa");
    expect(mobileList?.textContent).toContain("CHQ-2026-014");
    expect(mobileList?.textContent).toContain("À rapprocher");
    expect(mobileList?.textContent).toContain("Solde après");
    expect(mobileList?.textContent).toContain("FCFA");

    const desktopTable = container.querySelector("table");
    expect(desktopTable?.parentElement?.className).toContain("hidden");
    expect(container.querySelector('input[aria-label="Date de début"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Date de fin"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Type de mouvement"]')).not.toBeNull();
  });
});