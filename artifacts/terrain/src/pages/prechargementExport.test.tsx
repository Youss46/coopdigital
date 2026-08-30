// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  isOnline: true,
  navigate: vi.fn(),
  getExpeditionsApreparer: vi.fn(),
  createSessionPesee: vi.fn(),
  getSessionDetail: vi.fn(),
  addLignePesee: vi.fn(),
  deleteLignePesee: vi.fn(),
  terminerSessionPesee: vi.fn(),
}));

vi.mock("../contexts/OfflineContext", () => ({
  useOffline: () => ({ isOnline: fake.isOnline }),
}));
vi.mock("../lib/api", () => ({
  getExpeditionsApreparer: fake.getExpeditionsApreparer,
  createSessionPesee: fake.createSessionPesee,
  getSessionDetail: fake.getSessionDetail,
  addLignePesee: fake.addLignePesee,
  deleteLignePesee: fake.deleteLignePesee,
  terminerSessionPesee: fake.terminerSessionPesee,
  getTransfertsEnAttentePesee: vi.fn().mockResolvedValue([]),
}));
vi.mock("../components/BottomNavPeseur", () => ({
  default: () => createElement("nav", { "data-testid": "bottom-nav" }),
}));
vi.mock("../components/ScaleWeightDisplay", () => ({
  default: () => createElement("div", { "data-testid": "scale-display" }, "Balance"),
}));
vi.mock("../components/ui/numeric-input", () => ({
  NumericInput: ({ value, onChange, ...props }: { value: string; onChange: (value: string) => void }) =>
    createElement("input", {
      ...props,
      value,
      onChange: (event: Event) => onChange((event.target as HTMLInputElement).value),
    }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement("a", { href, ...props }, children),
  useLocation: () => ["/prechargement", fake.navigate],
}));

import PrechargementExportPage from "./PrechargementExportPage";
import PrechargementExportFlow from "./PrechargementExportFlow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const expedition = {
  id: 42,
  numeroExpedition: "EXP-2026-1-0001",
  statut: "en_preparation",
  typeVehicule: "propre",
  immatriculation: "AB-1234",
  port: "Abidjan",
  poidsPrevuKg: "1000",
  nombreSacs: 40,
  prechargement: null,
};

const session = {
  id: 91,
  numeroSession: "PSE-2026-00012",
  operation: "prechargement_export",
  statut: "en_cours",
  poidsTotalKg: "0",
  nbSacsTotal: 0,
  lignes: [],
};

async function render(component: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(component);
    await Promise.resolve();
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.isOnline = true;
  fake.getExpeditionsApreparer.mockResolvedValue([expedition]);
  fake.createSessionPesee.mockResolvedValue({ ...session, id: 91 });
  fake.getSessionDetail.mockResolvedValue(session);
  fake.addLignePesee.mockResolvedValue(session);
});

describe("liste Terrain des chargements à préparer", () => {
  it("charge une expédition et démarre sa pré-pesée", async () => {
    const { container, root } = await render(createElement(PrechargementExportPage));

    expect(container.textContent).toContain("EXP-2026-1-0001");
    expect(container.textContent).toContain("À peser");

    const itemButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("EXP-2026-1-0001"));
    expect(itemButton).toBeDefined();
    await act(async () => {
      itemButton!.click();
      await Promise.resolve();
    });

    expect(fake.createSessionPesee).toHaveBeenCalledWith({
      operation: "prechargement_export",
      expeditionId: 42,
      produit: "cacao",
    });
    expect(fake.navigate).toHaveBeenCalledWith("/prechargement-session/91");

    await act(async () => root.unmount());
    container.remove();
  });

  it("bloque clairement le parcours lorsque le téléphone est hors connexion", async () => {
    fake.isOnline = false;
    const { container, root } = await render(createElement(PrechargementExportPage));

    expect(container.textContent).toContain("nécessite une connexion active");
    expect(fake.getExpeditionsApreparer).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("formulaire Terrain de passages", () => {
  it("affiche les contrôles de passage et empêche une clôture vide", async () => {
    const { container, root } = await render(
      createElement(PrechargementExportFlow, { params: { sessionId: "91" } }),
    );

    expect(container.textContent).toContain("Total pré-pesé");
    expect(container.textContent).toContain("Ajouter le passage");
    expect(container.textContent).toContain("Aucune livraison ni sortie de stock");
    const closeButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Clôturer la pré-pesée"));
    expect(closeButton).toBeDefined();
    expect((closeButton as HTMLButtonElement).disabled).toBe(true);
    expect(fake.getSessionDetail).toHaveBeenCalledWith(91);
    expect(fake.terminerSessionPesee).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });
});