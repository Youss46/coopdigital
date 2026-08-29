import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackVenteEnregistree, type VenteSource } from "./analytics";

const sources: VenteSource[] = ["lot", "reception_port", "fournisseur"];

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