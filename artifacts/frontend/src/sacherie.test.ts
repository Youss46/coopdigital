import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import { PERMISSIONS } from "@/config/permissions";
import { featureKeyForPath } from "@/hooks/useFeatureAccess";

describe("intégration frontend Sacherie", () => {
  it("expose la page dans la navigation et dans le contrôle de fonctionnalité", () => {
    expect(NAV_ITEMS.find((item) => item.href === "/sacherie")).toMatchObject({
      label: "Sacherie",
      roles: expect.arrayContaining(["sacherie"]),
    });
    expect(featureKeyForPath("/sacherie")).toBe("sacherie");
  });

  it("garde les droits de lecture séparés des mouvements et ajustements", () => {
    expect(PERMISSIONS.sacherie.lire).toEqual(expect.arrayContaining(["auditeur", "sacherie"]));
    expect(PERMISSIONS.sacherie.mouvement).toEqual(expect.arrayContaining(["magasinier", "sacherie"]));
    expect(PERMISSIONS.sacherie.ajuster).not.toContain("auditeur");
  });
});