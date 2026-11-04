import { describe, expect, it } from "vitest";
import { updateLotStatut } from "../controllers/lotsController.js";

describe("statut manuel du lot", () => {
  it("refuse de marquer vendu sans enregistrer une vente", async () => {
    const response = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        response.statusCode = code;
        return response;
      },
      json(body: unknown) {
        response.body = body;
        return response;
      },
    };

    await updateLotStatut(
      {
        user: { id: 1, cooperativeId: 1 },
        params: { id: "1" },
        body: { statut: "vendu" },
        log: { error: () => undefined },
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      erreur: "Le statut « Vendu » est défini lors de l'enregistrement d'une vente dans Ventes cacao.",
    });
  });
});
