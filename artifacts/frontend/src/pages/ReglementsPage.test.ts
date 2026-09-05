import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PaiementListItem } from "@workspace/api-client-react";
import { ModalValidation } from "./ReglementsPage";

function normaliserEspaces(value: string) {
  return value.replace(/[\u00a0\u202f]/g, " ");
}

describe("modale de validation d'un règlement", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it("affiche et transmet 495 000 FCFA quand l'avance couvre toute la commission", async () => {
    const onConfirm = vi.fn();
    const paiement = {
      id: 42,
      membreNom: "Kouassi",
      membrePrenoms: "Awa",
      montantFcfa: 500_000,
      montantBrutFcfa: 517_500,
      montantNetFcfa: 500_000,
      statut: "en_attente",
      modePaiement: null,
      livraisonId: 99,
      livraisonStatutPaiement: "EN_ATTENTE",
      livraisonMontantRestant: 495_000,
      commissionCollecteId: 7,
      commissionCollecteFcfa: 22_500,
      commissionCollecteStatut: "en_attente",
      commissionCollecteAvanceDisponibleFcfa: 22_500,
      commissionCollecteFrequencePaiement: "fin_campagne",
    } as PaiementListItem;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(ModalValidation, {
        paiement,
        onClose: vi.fn(),
        onConfirm,
        loading: false,
        sessionCaisseOuverte: true,
        isDelegue: true,
      }));
    });

    const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios).toHaveLength(2);

    await act(async () => {
      radios[1]!.click();
    });

    const total = Array.from(container.querySelectorAll("div")).find((element) =>
      element.firstElementChild?.textContent === "Total à décaisser",
    );
    expect(total).toBeDefined();
    expect(normaliserEspaces(total!.textContent ?? "")).toContain("495 000 FCFA");

    const montantHint = Array.from(container.querySelectorAll("p")).find((element) =>
      element.textContent?.startsWith("Montant total :"),
    );
    expect(montantHint).toBeDefined();
    expect(normaliserEspaces(montantHint!.textContent ?? "")).toContain(
      "Montant total : 495 000 FCFA de net cacao.",
    );
    expect(montantHint!.textContent).not.toContain("+ 22 500");

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Confirmer et payer"),
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton!.click();
    });

    expect(onConfirm).toHaveBeenCalledWith(
      "",
      "",
      495_000,
      "especes",
      undefined,
      { numero: "", banque: "" },
      true,
    );
  });

  it("affiche et transmet le total avec le seul reliquat de commission quand l'avance est partielle", async () => {
    const onConfirm = vi.fn();
    const paiement = {
      id: 43,
      membreNom: "Kouassi",
      membrePrenoms: "Awa",
      montantFcfa: 500_000,
      montantBrutFcfa: 517_500,
      montantNetFcfa: 500_000,
      statut: "en_attente",
      modePaiement: null,
      livraisonId: 100,
      livraisonStatutPaiement: "EN_ATTENTE",
      livraisonMontantRestant: 495_000,
      commissionCollecteId: 8,
      commissionCollecteFcfa: 22_500,
      commissionCollecteStatut: "en_attente",
      commissionCollecteAvanceDisponibleFcfa: 10_000,
      commissionCollecteFrequencePaiement: "fin_campagne",
    } as PaiementListItem;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(ModalValidation, {
        paiement,
        onClose: vi.fn(),
        onConfirm,
        loading: false,
        sessionCaisseOuverte: true,
        isDelegue: true,
      }));
    });

    const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios).toHaveLength(2);

    await act(async () => {
      radios[1]!.click();
    });

    const total = Array.from(container.querySelectorAll("div")).find((element) =>
      element.firstElementChild?.textContent === "Total à décaisser",
    );
    expect(total).toBeDefined();
    expect(normaliserEspaces(total!.textContent ?? "")).toContain("507 500 FCFA");
    expect(normaliserEspaces(container.textContent ?? "")).toContain("Retenue sur avance");
    expect(normaliserEspaces(container.textContent ?? "")).toContain("Reliquat de commission à décaisser");

    const montantHint = Array.from(container.querySelectorAll("p")).find((element) =>
      element.textContent?.startsWith("Montant total :"),
    );
    expect(montantHint).toBeDefined();
    expect(normaliserEspaces(montantHint!.textContent ?? "")).toContain(
      "Montant total : 495 000 FCFA de net cacao + 12 500 FCFA de commission restant à décaisser",
    );
    expect(normaliserEspaces(montantHint!.textContent ?? "")).toContain(
      "dont 10 000 FCFA retenus sur l’avance",
    );

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Confirmer et payer"),
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton!.click();
    });

    expect(onConfirm).toHaveBeenCalledWith(
      "",
      "",
      507_500,
      "especes",
      undefined,
      { numero: "", banque: "" },
      true,
    );
  });
});