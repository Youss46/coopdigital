import { describe, expect, it } from "vitest";
import {
  calculerPoidsAcceptePort,
  calculerPoidsDisponibleVente,
} from "../services/venteReceptionService.js";

describe("vente de la quantité acceptée au port", () => {
  it("rend toute la réception vendable quand aucun poids n'est refoulé", () => {
    expect(calculerPoidsAcceptePort(18500, 0)).toBe(18500);
  });

  it("soustrait le refoulement et garde les deux quantités séparées", () => {
    expect(calculerPoidsAcceptePort(18500, 535.5)).toBe(17964.5);
  });

  it("refuse un refoulement supérieur au poids reçu", () => {
    expect(() => calculerPoidsAcceptePort(100, 100.01)).toThrow();
  });

  it("permet les ventes partielles sans dépasser le reliquat", () => {
    expect(calculerPoidsDisponibleVente(17964.5, 5000)).toBe(12964.5);
    expect(calculerPoidsDisponibleVente(17964.5, 17964.5)).toBe(0);
    expect(calculerPoidsDisponibleVente(17964.5, 20000)).toBe(0);
  });
});