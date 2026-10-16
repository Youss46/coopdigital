import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import { PERMISSIONS } from "@/config/permissions";
import { featureKeyForPath } from "@/hooks/useFeatureAccess";

describe("accès comptable aux ventes de cacao", () => {
  it("affiche le menu Ventes de cacao et associe la fonctionnalité correcte", () => {
    expect(NAV_ITEMS.find((item) => item.href === "/ventes")).toMatchObject({
      label: "Ventes de cacao",
      category: "Commerce",
      roles: expect.arrayContaining(["comptable"]),
    });
    expect(featureKeyForPath("/ventes")).toBe("ventes");
  });

  it("autorise la lecture, la création et l'encaissement des ventes", () => {
    expect(PERMISSIONS.ventes.lire).toContain("comptable");
    expect(PERMISSIONS.ventes.creer).toContain("comptable");
    expect(PERMISSIONS.ventes.encaisser).toContain("comptable");
  });
});
