import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import CaissePage from "./CaissePage";

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

const caisse = {
  id: 7,
  nom: "Caisse principale",
  type_caisse: "centrale",
  responsable_id: null,
  responsable_nom: null,
  solde_actuel_fcfa: "100000",
  fond_caisse_minimum_fcfa: "0",
  actif: true,
  session_id: null,
  session_statut: null,
  heure_ouverture: null,
  solde_ouverture_fcfa: null,
};

const autreCaisse = {
  ...caisse,
  id: 8,
  nom: "Caisse secondaire",
};

const ancienJournal = {
  mouvements: [{
    id: 1,
    type: "entree",
    motif: "don",
    montant_fcfa: "10000",
    libelle: "Ancienne opération",
    solde_apres_fcfa: "110000",
    date_operation: "2026-09-06",
    created_at: "2026-09-06T10:00:00.000Z",
    enregistre_par_nom: "Awa Kouassi",
    session_id: 1,
  }],
  totalEntrees: 10000,
  totalSorties: 0,
};

const nouveauJournal = {
  mouvements: [{
    id: 2,
    type: "sortie",
    motif: "autre",
    montant_fcfa: "2500",
    libelle: "Opération de la caisse secondaire",
    solde_apres_fcfa: "97500",
    date_operation: "2026-09-08",
    created_at: "2026-09-08T10:00:00.000Z",
    enregistre_par_nom: "Awa Kouassi",
    session_id: 2,
  }],
  totalEntrees: 0,
  totalSorties: 2500,
};

describe("plage du journal de caisse", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("n'émet aucun appel journal ou export et retire l'ancien résultat pour une plage inversée", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/caisse")) {
        return Promise.resolve(new Response(JSON.stringify([caisse]), { status: 200 }));
      }
      if (url.includes("/journal?")) {
        return Promise.resolve(new Response(JSON.stringify(ancienJournal), { status: 200 }));
      }
      throw new Error(`Appel inattendu: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(CaissePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const journalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal de caisse"),
    );
    expect(journalButton).toBeDefined();

    await act(async () => {
      journalButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Ancienne opération");
    const journalCallsBeforeInvalidPeriod = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/journal?"),
    ).length;
    expect(journalCallsBeforeInvalidPeriod).toBe(1);

    const dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    expect(dateInputs).toHaveLength(2);
    await act(async () => {
      const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setInputValue?.call(dateInputs[1], "2026-09-01");
      dateInputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(
      "La date de fin doit être postérieure ou égale à la date de début.",
    );
    expect(container.textContent).not.toContain("Ancienne opération");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/journal?"))).toHaveLength(
      journalCallsBeforeInvalidPeriod,
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/rapport-pdf?"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/journal/export?"))).toBe(false);
  });

  it("ignore la réponse tardive d'une caisse précédemment sélectionnée", async () => {
    let resolveCaissePrincipale!: (response: Response) => void;
    let resolveCaisseSecondaire!: (response: Response) => void;
    const journalCaissePrincipale = new Promise<Response>(resolve => {
      resolveCaissePrincipale = resolve;
    });
    const journalCaisseSecondaire = new Promise<Response>(resolve => {
      resolveCaisseSecondaire = resolve;
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/caisse")) {
        return Promise.resolve(new Response(JSON.stringify([caisse, autreCaisse]), { status: 200 }));
      }
      if (url.includes("/api/caisse/7/journal?")) return journalCaissePrincipale;
      if (url.includes("/api/caisse/8/journal?")) return journalCaisseSecondaire;
      throw new Error(`Appel inattendu: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(CaissePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const journalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal de caisse"),
    );
    expect(journalButton).toBeDefined();

    await act(async () => {
      journalButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const caisseSelect = container.querySelector<HTMLSelectElement>("select");
    expect(caisseSelect).not.toBeNull();
    await act(async () => {
      const setSelectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setSelectValue?.call(caisseSelect, "8");
      caisseSelect!.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      resolveCaisseSecondaire(new Response(JSON.stringify(nouveauJournal), { status: 200 }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(caisseSelect!.value).toBe("8");
    expect(container.textContent).toContain("Opération de la caisse secondaire");
    expect(container.textContent).not.toContain("Ancienne opération");

    await act(async () => {
      resolveCaissePrincipale(new Response(JSON.stringify(ancienJournal), { status: 200 }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Opération de la caisse secondaire");
    expect(container.textContent).not.toContain("Ancienne opération");
  });

  it("ignore la réponse tardive d'une période précédemment sélectionnée", async () => {
    localStorage.setItem(
      "coop.caisse.journal.period",
      JSON.stringify({ dateDebut: "2026-09-08", dateFin: "2026-09-08" }),
    );
    let resolveAnciennePeriode!: (response: Response) => void;
    let resolveNouvellePeriode!: (response: Response) => void;
    const anciennePeriode = new Promise<Response>(resolve => {
      resolveAnciennePeriode = resolve;
    });
    const nouvellePeriode = new Promise<Response>(resolve => {
      resolveNouvellePeriode = resolve;
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/caisse")) {
        return Promise.resolve(new Response(JSON.stringify([caisse]), { status: 200 }));
      }
      if (url.includes("date_debut=2026-09-08&date_fin=2026-09-08")) return anciennePeriode;
      if (url.includes("date_debut=2026-09-07&date_fin=2026-09-08")) return nouvellePeriode;
      throw new Error(`Appel inattendu: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(CaissePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const journalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal de caisse"),
    );
    expect(journalButton).toBeDefined();

    await act(async () => {
      journalButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    expect(dateInputs).toHaveLength(2);
    await act(async () => {
      const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setInputValue?.call(dateInputs[0], "2026-09-07");
      dateInputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/journal?"))).toHaveLength(2);

    await act(async () => {
      resolveNouvellePeriode(new Response(JSON.stringify(nouveauJournal), { status: 200 }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Opération de la caisse secondaire");
    expect(container.textContent).not.toContain("Ancienne opération");

    await act(async () => {
      resolveAnciennePeriode(new Response(JSON.stringify(ancienJournal), { status: 200 }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Opération de la caisse secondaire");
    expect(container.textContent).not.toContain("Ancienne opération");
  });

  it("restaure la période du journal après un remontage de la page", async () => {
    localStorage.setItem(
      "coop.caisse.journal.period",
      JSON.stringify({ dateDebut: "2026-09-06", dateFin: "2026-09-08" }),
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/caisse")) {
        return Promise.resolve(new Response(JSON.stringify([caisse]), { status: 200 }));
      }
      if (url.includes("date_debut=2026-09-06&date_fin=2026-09-08")) {
        return Promise.resolve(new Response(JSON.stringify(ancienJournal), { status: 200 }));
      }
      throw new Error(`Appel inattendu: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(CaissePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const journalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal de caisse"),
    );
    expect(journalButton).toBeDefined();

    await act(async () => {
      journalButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    let dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    expect(dateInputs.map(input => input.value)).toEqual(["2026-09-06", "2026-09-08"]);
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input).includes("date_debut=2026-09-06&date_fin=2026-09-08"),
    )).toBe(true);

    await act(async () => {
      root.unmount();
      root = createRoot(container);
      root.render(createElement(CaissePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const remountedJournalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal de caisse"),
    );
    expect(remountedJournalButton).toBeDefined();
    await act(async () => {
      remountedJournalButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    expect(dateInputs.map(input => input.value)).toEqual(["2026-09-06", "2026-09-08"]);
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("date_debut=2026-09-06&date_fin=2026-09-08"),
    ).length).toBeGreaterThanOrEqual(2);
  });

  it("ne charge pas le journal avec une période restaurée inversée", async () => {
    localStorage.setItem(
      "coop.caisse.journal.period",
      JSON.stringify({ dateDebut: "2026-09-08", dateFin: "2026-09-06" }),
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/caisse")) {
        return Promise.resolve(new Response(JSON.stringify([caisse]), { status: 200 }));
      }
      throw new Error(`Appel inattendu: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(CaissePage));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const journalButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Journal de caisse"),
    );
    expect(journalButton).toBeDefined();
    await act(async () => {
      journalButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    expect(dateInputs.map(input => input.value)).toEqual(["2026-09-08", "2026-09-06"]);
    expect(container.textContent).toContain(
      "La date de fin doit être postérieure ou égale à la date de début.",
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/journal?"))).toBe(false);
  });
});
