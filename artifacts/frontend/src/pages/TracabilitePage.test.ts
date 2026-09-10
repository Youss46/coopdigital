import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LotTracabilite } from "@workspace/api-client-react";
import { construireExportEudr, DetailModal, obtenirFuseauHoraireLocal } from "./TracabilitePage";

const { useGetLotTracabiliteMock } = vi.hoisted(() => ({
  useGetLotTracabiliteMock: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetLots: vi.fn(),
  useCreateLot: vi.fn(),
  useGetLivraisonsNonLotees: vi.fn(),
  useUpdateLotStatut: vi.fn(),
  useGetLotTracabilite: useGetLotTracabiliteMock,
  useGetEntrepots: vi.fn(),
  useFusionnerLots: vi.fn(),
  useExpedierLot: vi.fn(),
  useGetVentes: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ token: null, utilisateur: null }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/usePermission", () => ({
  usePermission: () => false,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const lotData = {
  lot: {
    id: 7,
    cooperativeId: 3,
    qrCodeLot: "LOT-7",
    statut: "transit",
    poidsTotalKg: "1200",
    dateCreation: "2026-09-10",
    entrepot: "Entrepôt central",
    nbProducteurs: 0,
    nbLivraisons: 0,
    expeditionNumero: "EXP-7",
    expeditionStatut: "receptionne",
  },
  membres: [],
  livraisons: [],
  parcelles: [],
  vente: null,
  expeditions: [{
    id: 9,
    numeroExpedition: "EXP-7",
    port: "Abidjan",
    statut: "receptionne",
    poidsRecuKg: "1200",
    poidsAttribueKg: "1200",
  }],
  expeditionResume: {
    receptionStatut: "complete",
    nombreExpeditions: 1,
    poidsRecuKg: "1200",
    poidsAttenduKg: "1200",
  },
  expeditionHistorique: [
    {
      expeditionNumero: "EXP-7",
      statutPrecedent: null,
      statutNouveau: "charge",
      dateChangement: "2026-09-10T09:00:00.000Z",
      faitPar: null,
      faitParNom: null,
      faitParPrenoms: null,
      notes: null,
    },
    {
      expeditionNumero: "EXP-7",
      statutPrecedent: "charge",
      statutNouveau: "receptionne",
      dateChangement: "2026-09-10T14:30:00.000Z",
      faitPar: null,
      faitParNom: null,
      faitParPrenoms: null,
      notes: "Réception confirmée",
    },
  ],
} as unknown as LotTracabilite;

describe("export EUDR de la traçabilité", () => {
  it("conserve les heures distinctes de transitions effectuées le même jour", () => {
    const data = {
      lot: {
        id: 7,
        qrCodeLot: "LOT-7",
        poidsTotalKg: "1200",
        dateCreation: "2026-09-10",
        cooperativeId: 3,
        expeditionNumero: "EXP-7",
        expeditionStatut: "receptionne",
      },
      membres: [],
      livraisons: [],
      parcelles: [],
      expeditionHistorique: [
        {
          statutPrecedent: null,
          statutNouveau: "charge",
          dateChangement: "2026-09-10T09:00:00.000Z",
          faitPar: null,
          faitParNom: null,
          faitParPrenoms: null,
          notes: null,
        },
        {
          statutPrecedent: "charge",
          statutNouveau: "receptionne",
          dateChangement: "2026-09-10T14:30:00.000Z",
          faitPar: null,
          faitParNom: null,
          faitParPrenoms: null,
          notes: "Réception confirmée",
        },
      ],
    } as unknown as LotTracabilite;

    const payload = construireExportEudr(data);

    expect(payload.historique_expedition.map((etape) => etape.date_changement)).toEqual([
      "2026-09-10T09:00:00.000Z",
      "2026-09-10T14:30:00.000Z",
    ]);
  });
});

describe("timeline d'expédition sur mobile", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGetLotTracabiliteMock.mockReturnValue({ data: lotData, isLoading: false });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useGetLotTracabiliteMock.mockReset();
  });

  it("affiche l'heure complète et conserve les anciennes étapes sans auteur", async () => {
    await act(async () => {
      root.render(createElement(DetailModal, {
        lotId: 7,
        onClose: vi.fn(),
        onStatutChange: vi.fn(),
        peutModifier: false,
      }));
    });

    expect(container.textContent).toContain("Validé le 10 sept. 2026, 09:00:00");
    expect(container.textContent).toContain("Validé le 10 sept. 2026, 14:30:00");
    expect(container.textContent).toContain("Validé par : Système");
    expect(container.textContent).toContain(
      `Heures affichées selon le fuseau de l’appareil : ${obtenirFuseauHoraireLocal()}`,
    );

    const timestamp = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("09:00:00"),
    );
    expect(timestamp?.className).toContain("break-words");
    expect(timestamp?.parentElement?.className).toContain("min-w-0");
  });

  it("replie les transitions, auteurs et notes à 320 px", async () => {
    const narrowLotData = {
      ...lotData,
      expeditionHistorique: [
        {
          ...lotData.expeditionHistorique[0],
          statutPrecedent: "en_attente_de_validation_du_chargement",
          statutNouveau: "receptionne_apres_controle_qualite_complet",
          faitParPrenoms: "Alexandrine",
          faitParNom: "NomDeFamilleTresLongSansEspace",
          notes:
            "Note très longue qui doit rester dans la fiche même sur un écran compact de trois cent vingt pixels.",
        },
      ],
    } as unknown as LotTracabilite;
    useGetLotTracabiliteMock.mockReturnValue({ data: narrowLotData, isLoading: false });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });

    await act(async () => {
      root.render(createElement(DetailModal, {
        lotId: 7,
        onClose: vi.fn(),
        onStatutChange: vi.fn(),
        peutModifier: false,
      }));
    });

    const transition = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("→"),
    );
    const author = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("Validé par : Alexandrine"),
    );
    const note = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("Note très longue"),
    );

    expect(transition?.className).toContain("break-words");
    expect(author?.className).toContain("break-words");
    expect(note?.className).toContain("break-words");
    expect(transition?.parentElement?.className).toContain("min-w-0");
  });
});