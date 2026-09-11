import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { PERMISSIONS as BACKEND_PERMISSIONS } from "../middlewares/permissions";

type PermissionMatrix = Record<string, Record<string, string[]>>;

function readFrontendPermissions(): PermissionMatrix {
  const frontendPath = fileURLToPath(new URL("../../../frontend/src/config/permissions.ts", import.meta.url));
  const source = readFileSync(frontendPath, "utf8");
  const start = source.indexOf("export const PERMISSIONS");
  const end = source.indexOf("\n};", start) + 3;
  if (start < 0 || end < 3) throw new Error("La matrice frontend est introuvable.");

  // Le frontend reste une copie TypeScript indépendante. Évaluer uniquement la
  // déclaration exportée permet de la comparer sans charger Vite ni React.
  const declaration = source
    .slice(start, end)
    .replace(/export const PERMISSIONS[^=]*=/, "const PERMISSIONS =");
  return vm.runInNewContext(`(() => { ${declaration}; return PERMISSIONS; })()`) as PermissionMatrix;
}

function normalize(matrix: PermissionMatrix): PermissionMatrix {
  return Object.fromEntries(
    Object.entries(matrix)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([module, actions]) => [
        module,
        Object.fromEntries(
          Object.entries(actions)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([action, roles]) => [action, [...roles].sort()]),
        ),
      ]),
  );
}

describe("parité des permissions backend/frontend", () => {
  it("garde la copie frontend strictement alignée sur la matrice backend", () => {
    expect(normalize(readFrontendPermissions())).toEqual(normalize(BACKEND_PERMISSIONS));
  });

  it("déclare les actions Avances qui pilotent les boutons sensibles", () => {
    const frontendPermissions = readFrontendPermissions();
    expect(BACKEND_PERMISSIONS.avances).toMatchObject({
      modifier_plan: ["pca", "directeur", "comptable"],
      annuler: ["pca", "directeur", "comptable"],
    });
    expect(frontendPermissions.avances).toMatchObject({
      modifier_plan: ["pca", "directeur", "comptable"],
      annuler: ["pca", "directeur", "comptable"],
    });
  });
});