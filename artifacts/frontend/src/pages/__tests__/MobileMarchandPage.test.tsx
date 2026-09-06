import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import MobileMarchandPage from "../MobileMarchandPage";

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
  nom: "Wave principal",
  operateur: "wave",
  numero_marchand: null,
  solde_actuel_fcfa: "100000",
  solde_mini_alerte_fcfa: "0",
  actif: true,
};

const mouvements = [
  {
    id: 1,
    type: "credit",
    motif: "rechargement",
    montant_fcfa: "10000",
    libelle: "Recharge",
    reference: null,
    date_operation: "2026-09-06",
    solde_apres_fcfa: "100000",
    enregistre_par: 42,
    enregistre_par_nom: "Awa Kouassi",
    created_at: "2026-09-06T10:00:00.000Z",
  },
  {
    id: 2,
    type: "debit",
    motif: "frais_transaction",
    montant_fcfa: "500",
    libelle: "Frais",
    reference: null,
    date_operation: "2026-09-05",
    solde_apres_fcfa: "90000",
    enregistre_par: null,
    enregistre_par_nom: null,
    created_at: "2026-09-05T10:00:00.000Z",
  },
  {
    id: 3,
    type: "debit",
    motif: "autre_debit",
    montant_fcfa: "250",
    libelle: "Ancienne opération",
    reference: null,
    date_operation: "2026-09-04",
    solde_apres_fcfa: "89500",
    enregistre_par: null,
    enregistre_par_nom: "   ",
    created_at: "2026-09-04T10:00:00.000Z",
  },
];

describe("journal Mobile Marchand", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("affiche le nom de l'opérateur et utilise Système pour les auteurs absents ou vides", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      const body = path.endsWith("/journal") ? mouvements : [compte];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(MobileMarchandPage));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const journalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal"),
    );
    expect(journalButton).toBeDefined();

    await act(async () => {
      journalButton!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Effectué par : Awa Kouassi");
    expect(container.textContent).toContain("Effectué par : Système");
    expect(container.textContent?.match(/Effectué par : Système/g)).toHaveLength(2);
  });
});