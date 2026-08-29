import { describe, expect, it } from "vitest";
import {
  featureKeyForPath,
  featureModeAllowsMethod,
  FEATURE_CATALOG,
} from "../services/cooperativeFeaturesService.js";

describe("cooperative features", () => {
  it("maps API paths to the same technical module key", () => {
    expect(featureKeyForPath("/membres/42")).toBe("membres");
    expect(featureKeyForPath("/finances/tableau-bord")).toBe("finances");
    expect(featureKeyForPath("/sessions-pesee/12")).toBe("pesee");
    expect(featureKeyForPath("/pesee/balances")).toBe("pesee");
    expect(featureKeyForPath("/transferts/42/arrivee")).toBe("entrepots");
    expect(featureKeyForPath("/terrain/collecte")).toBe("livraisons");
    expect(featureKeyForPath("/terrain/enquetes/12")).toBe("enquetes");
    expect(featureKeyForPath("/terrain/entrepot")).toBe("entrepots");
    expect(featureKeyForPath("/config/features")).toBe("parametres");
    expect(featureKeyForPath("/unknown")).toBeNull();
  });

  it("allows reads but blocks writes in read-only mode", () => {
    expect(featureModeAllowsMethod("lecture_seule", "GET")).toBe(true);
    expect(featureModeAllowsMethod("lecture_seule", "HEAD")).toBe(true);
    expect(featureModeAllowsMethod("lecture_seule", "POST")).toBe(false);
    expect(featureModeAllowsMethod("disabled", "GET")).toBe(false);
    expect(featureModeAllowsMethod("active", "DELETE")).toBe(true);
  });

  it("keeps every navigation module represented in the catalog", () => {
    const keys = new Set(FEATURE_CATALOG.map((feature) => feature.key));
    expect(keys.has("dashboard")).toBe(true);
    expect(keys.has("comptabilite")).toBe(true);
    expect(keys.has("missions")).toBe(true);
  });
});