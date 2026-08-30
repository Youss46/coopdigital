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

describe("intégration frontend Logistique", () => {
  it("expose le poste de pilotage et le rôle dédié", () => {
    expect(NAV_ITEMS.find((item) => item.href === "/logistique")).toMatchObject({
      label: "Logistique",
      roles: expect.arrayContaining(["responsable_logistique"]),
    });
    expect(featureKeyForPath("/logistique")).toBe("logistique");
    expect(featureKeyForPath("/peseurs")).toBe("peseurs");
    expect(featureKeyForPath("/mes-peseurs")).toBe("peseurs");
  });

  it("réserve les opérations financières aux rôles financiers", () => {
    expect(PERMISSIONS.logistique.lire).toEqual(expect.arrayContaining(["responsable_logistique"]));
    expect(PERMISSIONS.logistique.lire).not.toContain("comptable");
    expect(PERMISSIONS.transport.creer_bon).not.toContain("responsable_logistique");
  });
});