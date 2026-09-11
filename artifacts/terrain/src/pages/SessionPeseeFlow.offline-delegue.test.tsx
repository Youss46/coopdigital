// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrouillonPesee, Fournisseur } from "../lib/types";

const fakeState = vi.hoisted(() => {
  const fournisseur: Fournisseur = {
    id: 42,
    code: "MEM-042",
    nom: "Kouassi",
    prenoms: "Awa",
    telephone: "0700000042",
    section: "Abidjan",
    village: null,
    typeMembre: "membre",
    isMembreDelegue: true,
    bonReceptionId: 314,
    bonReceptionEnAttenteCount: 1,
    avanceEnCours: 0,
    intrantsDus: 0,
    derniereLivraison: null,
  };
  const brouillon: BrouillonPesee = {
    localId: "offline-delegue-1",
    membreId: fournisseur.id,
    membreNom: fournisseur.nom,
    membrePrenoms: fournisseur.prenoms,
    membreCode: fournisseur.code,
    produit: "cacao",
    operation: "reception_membre_delegue",
    certificationCacao: "RA",
    bonReceptionId: fournisseur.bonReceptionId,
    statut: "en_cours",
    syncStatus: "pending",
    lignes: [],
    poidsTotalKg: 0,
    nbSacsTotal: 0,
    createdAt: 1,
    updatedAt: 1,
  };

  return {
    fournisseur,
    brouillon,
    createBrouillon: vi.fn(async (data: {
      membreId: number;
      membreNom: string;
      membrePrenoms: string;
      membreCode: string;
      produit: string;
      operation: string;
      certificationCacao: string;
      bonReceptionId?: number | null;
    }) => ({
      ...brouillon,
      ...data,
    })),
    getBrouillon: vi.fn(async () => null as BrouillonPesee | null),
    navigate: vi.fn(),
  };
});

vi.mock("../contexts/OfflineContext", () => ({
  useOffline: () => ({ isOnline: false }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 7,
      nom: "Peseur",
      prenoms: "Central",
      email: "",
      telephone: null,
      role: "peseur",
      cooperativeId: 3,
      section: null,
      zoneType: null,
      zoneNom: null,
      delegueId: null,
    },
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/pesee-session", fakeState.navigate],
}));

vi.mock("../components/FournisseurSearch", () => ({
  default: ({ onSelect }: { onSelect: (f: Fournisseur) => void }) =>
    createElement(
      "button",
      { type: "button", onClick: () => onSelect(fakeState.fournisseur) },
      "Membre délégué",
    ),
}));

vi.mock("../components/OfflineBanner", () => ({
  default: () => null,
}));

vi.mock("../components/BottomNavPeseur", () => ({
  default: () => null,
}));

vi.mock("../components/ScaleWeightDisplay", () => ({
  default: () => null,
}));

vi.mock("../components/ui/numeric-input", () => ({
  NumericInput: (props: {
    value?: string;
    disabled?: boolean;
    onChange?: (value: string) => void;
  }) => createElement("input", {
    value: props.value ?? "",
    disabled: props.disabled,
    onChange: (event: { target: { value: string } }) => props.onChange?.(event.target.value),
  }),
}));

vi.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    ChevronLeft: Icon,
    Loader2: Icon,
    CheckCircle2: Icon,
    Scale: Icon,
    Package: Icon,
    Truck: Icon,
    Plus: Icon,
    Trash2: Icon,
    CheckCheck: Icon,
    X: Icon,
    AlertTriangle: Icon,
    WifiOff: Icon,
  };
});

vi.mock("../lib/idb", () => ({
  createBrouillon: fakeState.createBrouillon,
  getBrouillon: fakeState.getBrouillon,
  addLigneToBrouillon: vi.fn(),
  deleteLigneFromBrouillon: vi.fn(),
  terminerBrouillon: vi.fn(),
  annulerBrouillon: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  createSessionPesee: vi.fn(),
  getSessionsEnCours: vi.fn(async () => []),
  getSessionDetail: vi.fn(),
  addLignePesee: vi.fn(),
  deleteLignePesee: vi.fn(),
  terminerSessionPesee: vi.fn(),
  annulerSessionPesee: vi.fn(),
  convertirSessionEnLivraison: vi.fn(),
  telechargerRecuLivraison: vi.fn(),
  telechargerBordereauSession: vi.fn(),
  SessionEnCoursError: class SessionEnCoursError extends Error {},
  getPrix: vi.fn(),
  getFournisseurRecap: vi.fn(),
  getAvancesDeleguesTerrain: vi.fn(),
  patchPlanAvanceDeleague: vi.fn(),
  patchPlanAvanceMembre: vi.fn(),
}));

import SessionPeseeFlow from "./SessionPeseeFlow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("pesée hors ligne d'un membre délégué", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    fakeState.createBrouillon.mockClear();
    fakeState.getBrouillon.mockReset().mockResolvedValue(null);
    fakeState.navigate.mockClear();
    fakeState.fournisseur.bonReceptionEnAttenteCount = 1;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("reste dans le parcours et conserve le bon de réception", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(SessionPeseeFlow));
      await Promise.resolve();
    });

    await act(async () => {
      const memberButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Membre délégué");
      expect(memberButton).not.toBeUndefined();
      memberButton!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Type de cacao");
    expect(fakeState.navigate).not.toHaveBeenCalledWith("/receptions");

    const certificationButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "RA");
    expect(certificationButton).not.toBeUndefined();

    await act(async () => {
      certificationButton!.click();
      await Promise.resolve();
    });

    const startButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Commencer — RA");
    expect(startButton).not.toBeUndefined();

    await act(async () => {
      startButton!.click();
      await Promise.resolve();
    });

    expect(fakeState.createBrouillon).toHaveBeenCalledWith(expect.objectContaining({
      membreId: 42,
      operation: "reception_membre_delegue",
      certificationCacao: "RA",
      bonReceptionId: 314,
    }));
    expect(fakeState.navigate).not.toHaveBeenCalledWith("/receptions");
    expect(container.textContent).toContain("Pesée groupée");
  });

  it("réhydrate le producteur et le bon après une actualisation hors ligne", async () => {
    fakeState.getBrouillon.mockResolvedValue(fakeState.brouillon);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(SessionPeseeFlow, {
        params: { sessionId: `b-${fakeState.brouillon.localId}` },
      }));
      await Promise.resolve();
    });

    expect(fakeState.getBrouillon).toHaveBeenCalledWith(fakeState.brouillon.localId);
    expect(container.textContent).toContain("Kouassi Awa");
    expect(container.textContent).toContain("Pesée hors ligne");
    expect(container.textContent).toContain("Nouveau passage");

    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(Array.from(inputs).every((input) => !input.disabled)).toBe(true);
    expect(fakeState.navigate).not.toHaveBeenCalledWith("/receptions");
  });

  it("refuse de démarrer hors ligne quand plusieurs bons sont ouverts", async () => {
    fakeState.fournisseur.bonReceptionEnAttenteCount = 2;

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(SessionPeseeFlow));
      await Promise.resolve();
    });

    await act(async () => {
      const memberButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Membre délégué");
      expect(memberButton).not.toBeUndefined();
      memberButton!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Plusieurs bons de réception sont ouverts");
    expect(container.textContent).not.toContain("Type de cacao");
    expect(fakeState.createBrouillon).not.toHaveBeenCalled();
  });
});